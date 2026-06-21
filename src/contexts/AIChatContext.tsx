import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Citation } from '@/lib/rag';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: Citation[];
}

interface AIChatContextType {
  messages: ChatMessage[];
  input: string;
  isLoading: boolean;
  setInput: (value: string) => void;
  appendMessage: (message: ChatMessage) => void;
  setIsLoading: (loading: boolean) => void;
  clearConversation: () => void;
}

const AIChatContext = createContext<AIChatContextType | undefined>(undefined);

export const AIChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setInput('');
    setIsLoading(false);
  }, []);

  // Clear chat when the signed-in user changes or on logout — not on tab blur/focus.
  useEffect(() => {
    const uid = user?.id ?? null;
    if (ownerId !== null && ownerId !== uid) {
      clearConversation();
    }
    setOwnerId(uid);
    if (!uid) {
      clearConversation();
    }
  }, [user?.id, ownerId, clearConversation]);

  const appendMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const value = useMemo(
    () => ({
      messages,
      input,
      isLoading,
      setInput,
      appendMessage,
      setIsLoading,
      clearConversation,
    }),
    [messages, input, isLoading, appendMessage, clearConversation]
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
