import React, { createContext, useCallback, useContext, useState } from 'react';
import { assistantService } from '../services/assistantService';

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AssistantContextType {
  messages: AssistantMessage[];
  loading: boolean;
  error: string | null;
  ask: (question: string) => Promise<void>;
  reset: () => void;
}

const AssistantContext = createContext<AssistantContextType | undefined>(undefined);

export const AssistantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);
    try {
      const res = await assistantService.ask(q, conversationId);
      if (res.conversation_id) setConversationId(res.conversation_id);
      setMessages(prev => [...prev, { role: 'assistant', content: res.answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [conversationId, loading]);

  const reset = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setError(null);
  }, []);

  return (
    <AssistantContext.Provider value={{ messages, loading, error, ask, reset }}>
      {children}
    </AssistantContext.Provider>
  );
};

export const useAssistant = (): AssistantContextType => {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error('useAssistant must be used within an AssistantProvider');
  return ctx;
};
