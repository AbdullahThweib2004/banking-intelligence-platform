import { supabase } from '@/integrations/supabase/client';
import type { Citation } from '@/lib/rag';

export const MAX_HISTORY_CHATS = 10;

export interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}

export interface SavedMessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: Citation[] | null;
  created_at: string;
}

export interface DbErrorInfo {
  message: string;
  code?: string;
  missingTable: boolean;
}

export type CreateConversationResult =
  | { ok: true; conversation: ConversationSummary }
  | { ok: false; error: DbErrorInfo };

export type PersistMessageResult =
  | { ok: true; message: SavedMessageRow }
  | { ok: false; error: DbErrorInfo };

function truncateTitle(text: string, max = 56): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function parseDbError(error: unknown): DbErrorInfo {
  if (!error || typeof error !== 'object') {
    return { message: 'Unknown database error', missingTable: false };
  }

  const e = error as Record<string, unknown>;
  const code = e.code ? String(e.code) : undefined;
  const message = [e.message, e.details, e.hint, code].filter(Boolean).map(String).join(' — ');

  const missingTable =
    code === 'PGRST205' ||
    code === 'PGRST204' ||
    code === '42P01' ||
    /Could not find the table|does not exist|schema cache/i.test(message);

  return {
    message: message || 'Unknown database error',
    code,
    missingTable,
  };
}

export async function getAuthenticatedUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Failed to read auth session:', error);
    return null;
  }
  return data.session?.user?.id ?? null;
}

export async function fetchConversationHistory(
  userId: string,
  limit = MAX_HISTORY_CHATS
): Promise<{ data: ConversationSummary[]; error: DbErrorInfo | null }> {
  const { data, error } = await supabase
    .from('ai_chat_conversations')
    .select('id, title, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { data: [], error: parseDbError(error) };
  }

  return { data: (data as ConversationSummary[]) ?? [], error: null };
}

export async function createConversation(
  userId: string,
  firstQuestion: string
): Promise<CreateConversationResult> {
  const title = truncateTitle(firstQuestion);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('ai_chat_conversations')
    .insert({ user_id: userId, title, updated_at: now })
    .select('id, title, updated_at')
    .single();

  if (error) {
    const parsed = parseDbError(error);
    console.error('[chatHistory] createConversation failed:', parsed, error);
    return { ok: false, error: parsed };
  }

  return { ok: true, conversation: data as ConversationSummary };
}

export async function persistMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  sources?: Citation[]
): Promise<PersistMessageResult> {
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
    const parsed = parseDbError(error);
    console.error('[chatHistory] persistMessage failed:', parsed, error);
    return { ok: false, error: parsed };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('ai_chat_conversations')
    .update({ updated_at: now })
    .eq('id', conversationId);

  if (updateError) {
    console.error('[chatHistory] update conversation timestamp failed:', parseDbError(updateError), updateError);
  }

  return { ok: true, message: data as SavedMessageRow };
}

export async function loadConversationMessages(
  conversationId: string
): Promise<{ data: SavedMessageRow[]; error: DbErrorInfo | null }> {
  const { data, error } = await supabase
    .from('ai_chat_messages')
    .select('id, role, content, sources, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    return { data: [], error: parseDbError(error) };
  }

  return { data: (data as SavedMessageRow[]) ?? [], error: null };
}

export async function pruneOldConversations(
  userId: string,
  keep = MAX_HISTORY_CHATS
): Promise<{ error: DbErrorInfo | null }> {
  const { data, error } = await supabase
    .from('ai_chat_conversations')
    .select('id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    return { error: parseDbError(error) };
  }

  const rows = data as { id: string }[] | null;
  if (!rows || rows.length <= keep) {
    return { error: null };
  }

  const deleteIds = rows.slice(keep).map((row) => row.id);
  if (deleteIds.length === 0) {
    return { error: null };
  }

  const { error: deleteError } = await supabase
    .from('ai_chat_conversations')
    .delete()
    .in('id', deleteIds)
    .eq('user_id', userId);

  if (deleteError) {
    return { error: parseDbError(deleteError) };
  }

  return { error: null };
}

export function userFacingSaveError(error: DbErrorInfo): string {
  if (error.missingTable) {
    return 'Chat history tables are not set up in Supabase. Ask an admin to run migration 20260622120000_ai_chat_history_fix.sql.';
  }
  if (error.code === '42501') {
    return 'Permission denied saving chat history. Check Supabase RLS policies.';
  }
  return `Could not save conversation: ${error.message}`;
}
