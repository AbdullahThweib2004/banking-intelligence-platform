import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { answerHybridQuestion, formatSourceLabel } from '@/lib/chatHybridAnswer';
import type { Citation } from '@/lib/rag';
import {
  MAX_HISTORY_CHATS,
  createConversation as dbCreateConversation,
  fetchConversationHistory,
  getAuthenticatedUserId,
  loadConversationMessages,
  persistMessage as dbPersistMessage,
  pruneOldConversations as dbPruneOldConversations,
  userFacingSaveError,
  type ConversationSummary,
  type DbErrorInfo,
} from '@/lib/chatHistoryDb';
import { toast } from 'sonner';
import { generateId } from '@/lib/utils';

export type { ConversationSummary };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: Citation[];
  /** Short "where this came from" badge text — session-only, not persisted (not reconstructable after reload without re-classifying). */
  sourceLabel?: string;
}

function mapMessageRow(row: {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: Citation[] | null;
  created_at: string;
}): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    timestamp: new Date(row.created_at),
    sources: row.sources ?? undefined,
  };
}

interface AIChatContextType {
  messages: ChatMessage[];
  input: string;
  isLoading: boolean;
  conversationLoading: boolean;
  history: ConversationSummary[];
  historyLoading: boolean;
  activeConversationId: string | null;
  sendError: string | null;
  setInput: (value: string) => void;
  sendMessage: (content: string) => Promise<void>;
  startNewChat: () => void;
  selectConversation: (id: string) => Promise<void>;
}

const AIChatContext = createContext<AIChatContextType | undefined>(undefined);

export { MAX_HISTORY_CHATS };

export const AIChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  const activeConversationIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  const missingTableWarnedRef = useRef(false);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  const warnMissingTableOnce = useCallback((error: DbErrorInfo) => {
    if (missingTableWarnedRef.current) return;
    missingTableWarnedRef.current = true;
    console.error('[chatHistory] tables missing or not exposed:', error);
    toast.error(userFacingSaveError(error));
  }, []);

  const upsertHistoryItem = useCallback((item: ConversationSummary) => {
    setHistory((prev) => {
      const without = prev.filter((h) => h.id !== item.id);
      return [item, ...without]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, MAX_HISTORY_CHATS);
    });
  }, []);

  const resetLocal = useCallback(() => {
    setMessages([]);
    setInput('');
    setIsLoading(false);
    setActiveConversationId(null);
    activeConversationIdRef.current = null;
    setHistory([]);
    setSendError(null);
    missingTableWarnedRef.current = false;
  }, []);

  const fetchHistory = useCallback(async (userId: string) => {
    setHistoryLoading(true);
    const { data, error } = await fetchConversationHistory(userId);

    if (error) {
      if (error.missingTable) {
        warnMissingTableOnce(error);
        setHistory([]);
      } else {
        console.error('[chatHistory] fetch failed:', error);
      }
    } else {
      setHistory(data);
    }
    setHistoryLoading(false);
  }, [warnMissingTableOnce]);

  const ensureConversation = useCallback(
    async (userId: string, firstQuestion: string): Promise<string | null> => {
      const existing = activeConversationIdRef.current;
      if (existing) return existing;

      const result = await dbCreateConversation(userId, firstQuestion);
      if (!result.ok) {
        if (result.error.missingTable) {
          warnMissingTableOnce(result.error);
        }
        return null;
      }

      setActiveConversationId(result.conversation.id);
      activeConversationIdRef.current = result.conversation.id;
      upsertHistoryItem(result.conversation);
      return result.conversation.id;
    },
    [upsertHistoryItem, warnMissingTableOnce]
  );

  const startNewChat = useCallback(() => {
    setMessages([]);
    setInput('');
    setIsLoading(false);
    setSendError(null);
    setActiveConversationId(null);
    activeConversationIdRef.current = null;
  }, []);

  const selectConversation = useCallback(async (id: string) => {
    setConversationLoading(true);
    setSendError(null);
    setActiveConversationId(id);
    activeConversationIdRef.current = id;

    const { data, error } = await loadConversationMessages(id);
    setConversationLoading(false);

    if (error) {
      console.error('[chatHistory] load conversation failed:', error);
      toast.error('Could not load this conversation. Please try again.');
      return;
    }

    setMessages(data.map(mapMessageRow));
    setInput('');
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      const query = content.trim();
      if (!query || isLoadingRef.current) return;

      const userId = await getAuthenticatedUserId();
      if (!userId) {
        const msg = 'You must be signed in to send a message.';
        setSendError(msg);
        toast.error(msg);
        return;
      }

      setSendError(null);
      setIsLoading(true);
      isLoadingRef.current = true;

      let conversationId = activeConversationIdRef.current;
      let lastSaveError: DbErrorInfo | null = null;
      let userMessagePersisted = false;

      try {
        const historySnapshot = messages;
        const optimisticUserId = generateId();
        setMessages((prev) => [
          ...prev,
          {
            id: optimisticUserId,
            role: 'user',
            content: query,
            timestamp: new Date(),
          },
        ]);
        setInput('');

        if (!conversationId) {
          conversationId = await ensureConversation(userId, query);
        }

        if (conversationId) {
          const userSave = await dbPersistMessage(conversationId, 'user', query);
          if (userSave.ok) {
            userMessagePersisted = true;
            setMessages((prev) =>
              prev.map((m) => (m.id === optimisticUserId ? mapMessageRow(userSave.message) : m))
            );
          } else {
            lastSaveError = userSave.error;
          }
        }

        const result = await answerHybridQuestion(query, {
          history: historySnapshot.map((m) => ({
            role: m.role,
            content: m.content,
            hadSources: Boolean(m.sources?.length),
          })),
        });

        const optimisticAssistantId = generateId();
        setMessages((prev) => [
          ...prev,
          {
            id: optimisticAssistantId,
            role: 'assistant',
            content: result.answer,
            timestamp: new Date(),
            sources: result.citations.length > 0 ? result.citations : undefined,
            sourceLabel: formatSourceLabel(result.source, result.language),
          },
        ]);

        if (!conversationId) {
          conversationId = await ensureConversation(userId, query);
        }

        if (conversationId) {
          if (!userMessagePersisted) {
            const retryUser = await dbPersistMessage(conversationId, 'user', query);
            if (retryUser.ok) {
              userMessagePersisted = true;
              setMessages((prev) =>
                prev.map((m) => (m.id === optimisticUserId ? mapMessageRow(retryUser.message) : m))
              );
            } else {
              lastSaveError = retryUser.error;
            }
          }

          const assistantSave = await dbPersistMessage(
            conversationId,
            'assistant',
            result.answer,
            result.citations.length > 0 ? result.citations : undefined
          );

          if (assistantSave.ok) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === optimisticAssistantId ? mapMessageRow(assistantSave.message) : m
              )
            );
            upsertHistoryItem({
              id: conversationId,
              title: history.find((h) => h.id === conversationId)?.title ?? query.slice(0, 56),
              updated_at: new Date().toISOString(),
            });
          } else {
            lastSaveError = assistantSave.error;
          }

          await dbPruneOldConversations(userId);
          await fetchHistory(userId);
        } else {
          const createResult = await dbCreateConversation(userId, query);
          lastSaveError = createResult.ok ? null : createResult.error;
        }

        if (lastSaveError) {
          const friendly = userFacingSaveError(lastSaveError);
          console.error('[chatHistory] save failed:', lastSaveError);
          setSendError(friendly);
          toast.error(friendly);
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'Unknown error';
        const msg = `Could not get an answer: ${detail}`;
        console.error('Assistant request failed:', err);
        setSendError(msg);
        toast.error(msg);

        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: 'assistant',
            content:
              'Sorry, something went wrong while generating a response. Please try again.',
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsLoading(false);
        isLoadingRef.current = false;
      }
    },
    [messages, ensureConversation, fetchHistory, history, upsertHistoryItem]
  );

  useEffect(() => {
    const uid = user?.id ?? null;
    if (ownerId !== null && ownerId !== uid) {
      resetLocal();
    }
    setOwnerId(uid);
    if (!uid) {
      resetLocal();
      return;
    }
    void (async () => {
      await dbPruneOldConversations(uid);
      await fetchHistory(uid);
    })();
  }, [user?.id, ownerId, resetLocal, fetchHistory]);

  const value = useMemo(
    () => ({
      messages,
      input,
      isLoading,
      conversationLoading,
      history,
      historyLoading,
      activeConversationId,
      sendError,
      setInput,
      sendMessage,
      startNewChat,
      selectConversation,
    }),
    [
      messages,
      input,
      isLoading,
      conversationLoading,
      history,
      historyLoading,
      activeConversationId,
      sendError,
      sendMessage,
      startNewChat,
      selectConversation,
    ]
  );

  return <AIChatContext.Provider value={value}>{children}</AIChatContext.Provider>;
};

export const useAIChat = (): AIChatContextType => {
  const ctx = useContext(AIChatContext);
  if (!ctx) {
    throw new Error('useAIChat must be used within an AIChatProvider');
  }
  return ctx;
};
