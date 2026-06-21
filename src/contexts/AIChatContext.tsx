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
import { answerQuestion } from '@/lib/rag';
import type { Citation } from '@/lib/rag';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { generateId } from '@/lib/utils';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: Citation[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: Citation[] | null;
  created_at: string;
}

interface ConversationRow {
  id: string;
  title: string;
  updated_at: string;
}

function truncateTitle(text: string, max = 56): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function mapMessageRow(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    timestamp: new Date(row.created_at),
    sources: row.sources ?? undefined,
  };
}

function isMissingHistoryTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;
  const code = String(e.code ?? '');
  const message = String(e.message ?? e.details ?? '');
  const status = Number(e.status ?? e.statusCode ?? 0);

  if (status === 404) return true;
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204') return true;
  return /ai_chat_conversations|ai_chat_messages|does not exist|Could not find the table|schema cache/i.test(
    message
  );
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
  const [historyUnavailable, setHistoryUnavailable] = useState(false);

  const activeConversationIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  const historyUnavailableRef = useRef(false);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    historyUnavailableRef.current = historyUnavailable;
  }, [historyUnavailable]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  const resetLocal = useCallback(() => {
    setMessages([]);
    setInput('');
    setIsLoading(false);
    setActiveConversationId(null);
    setHistory([]);
    setSendError(null);
    setHistoryUnavailable(false);
    historyUnavailableRef.current = false;
  }, []);

  const markHistoryUnavailable = useCallback(() => {
    historyUnavailableRef.current = true;
    setHistoryUnavailable(true);
    setHistory([]);
  }, []);

  const fetchHistory = useCallback(async () => {
    if (!user?.id || historyUnavailableRef.current) return;
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from('ai_chat_conversations')
      .select('id, title, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      if (isMissingHistoryTable(error)) {
        markHistoryUnavailable();
      } else {
        console.error('Failed to load chat history:', error);
      }
    } else {
      setHistory((data as ConversationRow[]) ?? []);
    }
    setHistoryLoading(false);
  }, [user?.id, markHistoryUnavailable]);

  const createConversation = useCallback(
    async (firstQuestion: string): Promise<string | null> => {
      if (!user?.id || historyUnavailableRef.current) return null;

      const title = truncateTitle(firstQuestion);
      const { data, error } = await supabase
        .from('ai_chat_conversations')
        .insert({ user_id: user.id, title })
        .select('id')
        .single();

      if (error) {
        if (isMissingHistoryTable(error)) {
          markHistoryUnavailable();
        } else {
          console.error('Failed to create conversation:', error);
          toast.error('Could not save this conversation. Your message will still be answered.');
        }
        return null;
      }

      const id = (data as { id: string }).id;
      setActiveConversationId(id);
      activeConversationIdRef.current = id;
      return id;
    },
    [user?.id, markHistoryUnavailable]
  );

  const persistMessage = useCallback(
    async (
      conversationId: string,
      role: 'user' | 'assistant',
      content: string,
      sources?: Citation[]
    ): Promise<ChatMessage | null> => {
      const { data, error } = await supabase
        .from('ai_chat_messages')
        .insert({
          conversation_id: conversationId,
          role,
          content,
          sources: sources?.length ? sources : null,
        })
        .select('id, role, content, sources, created_at')
        .single();

      if (error) {
        console.error('Failed to save message:', error);
        return null;
      }

      await supabase
        .from('ai_chat_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      return mapMessageRow(data as MessageRow);
    },
    []
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

    const { data, error } = await supabase
      .from('ai_chat_messages')
      .select('id, role, content, sources, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    setConversationLoading(false);

    if (error) {
      console.error('Failed to load conversation:', error);
      toast.error('Could not load this conversation. Please try again.');
      return;
    }

    setMessages((data as MessageRow[]).map(mapMessageRow));
    setInput('');
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      const query = content.trim();
      if (!query || isLoadingRef.current) return;

      if (!user?.id) {
        const msg = 'You must be signed in to send a message.';
        setSendError(msg);
        toast.error(msg);
        return;
      }

      setSendError(null);
      setIsLoading(true);
      isLoadingRef.current = true;

      try {
        const historySnapshot = messages;
        const optimisticUserId = generateId();
        const optimisticUser: ChatMessage = {
          id: optimisticUserId,
          role: 'user',
          content: query,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, optimisticUser]);
        setInput('');

        let conversationId = activeConversationIdRef.current;
        if (!conversationId && !historyUnavailableRef.current) {
          conversationId = await createConversation(query);
        }

        if (conversationId) {
          const savedUser = await persistMessage(conversationId, 'user', query);
          if (savedUser) {
            setMessages((prev) =>
              prev.map((m) => (m.id === optimisticUserId ? savedUser : m))
            );
          }
        }

        const result = await answerQuestion(query, {
          history: historySnapshot.map((m) => ({
            role: m.role,
            content: m.content,
            hadSources: Boolean(m.sources?.length),
          })),
        });

        const optimisticAssistantId = generateId();
        const assistantMessage: ChatMessage = {
          id: optimisticAssistantId,
          role: 'assistant',
          content: result.answer,
          timestamp: new Date(),
          sources: result.found ? result.citations : undefined,
        };

        setMessages((prev) => [...prev, assistantMessage]);

        if (conversationId) {
          const savedAssistant = await persistMessage(
            conversationId,
            'assistant',
            result.answer,
            result.found ? result.citations : undefined
          );
          if (savedAssistant) {
            setMessages((prev) =>
              prev.map((m) => (m.id === optimisticAssistantId ? savedAssistant : m))
            );
          }
          await fetchHistory();
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
    [user?.id, messages, createConversation, persistMessage, fetchHistory]
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
    fetchHistory();
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
