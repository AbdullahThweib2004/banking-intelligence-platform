import { test, expect } from '@playwright/test';
import { loginAsRole } from '../fixtures/api-context';
import { ROLES } from '../fixtures/api-users';
import { getAdminClient } from '../fixtures/supabase-admin';
import { SUPABASE_URL, SUPABASE_ANON_KEY, hasSupabaseConfig, hasServiceRole, runLiveOpenRouterTests } from '../utils/env';

/**
 * Assistant / RAG / OpenRouter tests. Live tests are disabled by default.
 * 
 * IMPORTANT boundary, confirmed by reading both edge functions
 * (supabase/functions/assistant-chat, policy-search): their input
 * validation (missing 'query', wrong HTTP method) runs and returns BEFORE
 * either function ever calls OpenRouter — those paths are genuinely
 * deterministic and safe to run always. The actual answer/embedding
 * generation calls OpenRouter for real, INSIDE the deployed function; there
 * is no way to mock that boundary from an external test (unlike the local
 * FastAPI backend, we don't control the function's process). So the
 * success path is inherently live and is covered by exactly one smoke test,
 * gated behind RUN_LIVE_OPENROUTER_TESTS=true per the task's requirement.
 * For full context
 * Chat history persistence (ai_chat_conversations/ai_chat_messages) is
 * plain table I/O with its own RLS — fully deterministic, tested directly
 * against Supabase with no OpenRouter dependency at all.
 */

async function callFunction(request: import('@playwright/test').APIRequestContext, name: string, body: unknown) {
  return request.post(`${SUPABASE_URL}/functions/v1/${name}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY as string,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    data: body,
    failOnStatusCode: false,
  });
}

test.describe('Assistant / RAG edge functions — deterministic input validation', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseConfig(), 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set');
  });

  test('assistant-chat rejects a request missing "query" (before any OpenRouter call)', async ({ request }) => {
    let response;
    try {
      response = await callFunction(request, 'assistant-chat', { language: 'en' });
    } catch (err) {
      test.skip(true, `assistant-chat not reachable: ${err}`);
      return;
    }
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('query');
  });

  test('assistant-chat rejects a non-POST method', async ({ request }) => {
    let response;
    try {
      response = await request.get(`${SUPABASE_URL}/functions/v1/assistant-chat`, {
        headers: { apikey: SUPABASE_ANON_KEY as string, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        failOnStatusCode: false,
      });
    } catch (err) {
      test.skip(true, `assistant-chat not reachable: ${err}`);
      return;
    }
    expect(response.status()).toBe(405);
  });

  test('policy-search rejects a request missing "query" (before any OpenRouter call)', async ({ request }) => {
    let response;
    try {
      response = await callFunction(request, 'policy-search', {});
    } catch (err) {
      test.skip(true, `policy-search not reachable: ${err}`);
      return;
    }
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('query');
  });

  test('policy-search rejects a non-POST method', async ({ request }) => {
    let response;
    try {
      response = await request.get(`${SUPABASE_URL}/functions/v1/policy-search`, {
        headers: { apikey: SUPABASE_ANON_KEY as string, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        failOnStatusCode: false,
      });
    } catch (err) {
      test.skip(true, `policy-search not reachable: ${err}`);
      return;
    }
    expect(response.status()).toBe(405);
  });
});

test.describe('Chat history persistence (plain table I/O, no OpenRouter needed)', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseConfig(), 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set');
  });

  test.afterAll(async () => {
    if (!hasServiceRole()) return;
    const admin = getAdminClient();
    await admin.from('ai_chat_conversations').delete().eq('title', '[qa-integration-test] conversation');
  });

  test('a conversation and its messages persist, with sources/provenance intact, visible only to their owner', async () => {
    const { client, session } = await loginAsRole(ROLES.EMPLOYEE);

    const conversation = await client
      .from('ai_chat_conversations')
      .insert({ user_id: session.user.id, title: '[qa-integration-test] conversation' })
      .select('*')
      .single();
    expect(conversation.error).toBeNull();

    const userMessage = await client
      .from('ai_chat_messages')
      .insert({ conversation_id: conversation.data.id, role: 'user', content: 'What is the max DBR?' })
      .select('*')
      .single();
    expect(userMessage.error).toBeNull();

    const sources = [{ title: 'Lending Policy', fileName: 'lending-policy.pdf' }];
    const assistantMessage = await client
      .from('ai_chat_messages')
      .insert({
        conversation_id: conversation.data.id,
        role: 'assistant',
        content: 'The maximum DBR is 40%.',
        sources,
      })
      .select('*')
      .single();
    expect(assistantMessage.error).toBeNull();
    // Provenance/source tracking — the exact citations shown in the UI.
    expect(assistantMessage.data?.sources).toEqual(sources);

    const messages = await client
      .from('ai_chat_messages')
      .select('role, content, sources')
      .eq('conversation_id', conversation.data.id)
      .order('created_at', { ascending: true });
    expect(messages.data).toHaveLength(2);
    expect(messages.data?.[0].role).toBe('user');
    expect(messages.data?.[1].role).toBe('assistant');

    // Ownership: a different role must not see this conversation at all.
    const other = await loginAsRole(ROLES.MANAGER);
    const otherView = await other.client
      .from('ai_chat_conversations')
      .select('id')
      .eq('id', conversation.data.id);
    expect(otherView.data ?? []).toHaveLength(0);
  });

  test('message role is constrained to user/assistant', async () => {
    const { client, session } = await loginAsRole(ROLES.EMPLOYEE);
    const conversation = await client
      .from('ai_chat_conversations')
      .insert({ user_id: session.user.id, title: '[qa-integration-test] conversation' })
      .select('*')
      .single();
// eslint-disable-next-line playwright/no-conditional-in-test
    const badMessage = await client
      .from('ai_chat_messages')
      .insert({ conversation_id: conversation.data.id, role: 'system', content: 'not allowed' })
      .select();
    expect(badMessage.error).not.toBeNull();
  });
});

test.describe('OpenRouter live smoke test (optional)', () => {
  test('assistant-chat returns a real, non-empty answer for a simple greeting', async ({ request }) => {
    test.skip(!runLiveOpenRouterTests(), 'Set RUN_LIVE_OPENROUTER_TESTS=true to run the one live OpenRouter smoke test');
    test.skip(!hasSupabaseConfig(), 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set');

    const response = await callFunction(request, 'assistant-chat', { query: 'Hello!', language: 'en' });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(typeof body.answer).toBe('string');
    expect(body.answer.length).toBeGreaterThan(0);
    expect(['file', 'database', 'both', 'general']).toContain(body.source);
  });
});
