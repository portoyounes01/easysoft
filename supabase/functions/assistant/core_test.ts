// End-to-end test of the assistant loop with MOCKED Anthropic + Supabase.
// Proves: tool dispatch works, and personal data is pseudonymized BEFORE it
// reaches the model, then re-hydrated to real names afterwards — all without a
// real API key or database.
//
// Run: deno test --allow-net supabase/functions/assistant/core_test.ts
import { runAssistant } from './core.ts';
import { PiiVault } from './pii.ts';
import type { ToolContext } from './tools.ts';

function eq(a: unknown, b: unknown) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`expected ${y}, got ${x}`);
}
function assert(cond: unknown, msg = 'assertion failed') { if (!cond) throw new Error(msg); }

// Fake Supabase admin: returns real employee names for the RPC the model calls.
const fakeAdmin = {
  rpc(fn: string, _params: unknown) {
    if (fn === 'assistant_sales_by_employee') {
      return Promise.resolve({
        data: [
          { employee_id: 'e1', employee_name: 'Maria Silva', total_sales: 12.30, transaction_count: 1, items_sold: 4 },
          { employee_id: 'e2', employee_name: 'João Costa', total_sales: 6.15, transaction_count: 1, items_sold: 5 },
        ],
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  },
} as unknown as ToolContext['admin'];

Deno.test('tool-use loop pseudonymizes to the model and re-hydrates the answer', async () => {
  const capturedBodies: any[] = [];
  const realFetch = globalThis.fetch;

  // Mock the Anthropic Messages API: 1st call -> ask for the employee tool,
  // 2nd call -> final answer referencing the pseudonym "Employee 1".
  let call = 0;
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    capturedBodies.push(JSON.parse(init.body as string));
    call += 1;
    const body = call === 1
      ? { stop_reason: 'tool_use', content: [
          { type: 'text', text: 'Let me check.' },
          { type: 'tool_use', id: 'tu1', name: 'get_sales_by_employee', input: { date_start: '2026-07-01', date_end: '2026-07-07' } },
        ] }
      : { stop_reason: 'end_turn', content: [
          { type: 'text', text: 'Employee 1 sold the most at €12.30, ahead of Employee 2 at €6.15.' },
        ] };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  }) as typeof fetch;

  try {
    const vault = new PiiVault();
    const ctx: ToolContext = { admin: fakeAdmin, tenantId: 'tenant-a', vault };
    const result = await runAssistant({
      apiKey: 'test-key',
      todayIso: '2026-07-07',
      businessName: 'Test Café',
      history: [],
      question: 'Which employee sold the most this week?',
      ctx,
    });

    // 1) The model was asked to run the tool.
    eq(result.toolsUsed, ['get_sales_by_employee']);

    // 2) The tool_result sent back to the model (2nd request) must contain the
    //    PSEUDONYM and must NOT contain the real names — the GDPR guarantee.
    const secondReq = capturedBodies[1];
    const toolResultMsg = secondReq.messages.find((m: any) =>
      Array.isArray(m.content) && m.content.some((b: any) => b.type === 'tool_result'));
    const toolResultText = JSON.stringify(toolResultMsg);
    assert(toolResultText.includes('Employee 1'), 'tool result should carry the pseudonym');
    assert(!toolResultText.includes('Maria Silva'), 'real employee name must NOT reach the model');
    assert(!toolResultText.includes('João Costa'), 'real employee name must NOT reach the model');

    // 3) The model's answer (as returned by the loop) still holds the pseudonym...
    assert(result.answer.includes('Employee 1'), 'model answer holds the pseudonym');
    assert(!result.answer.includes('Maria Silva'), 'model output has no real name yet');

    // 4) ...and re-hydration (what index.ts does) restores the real names for the owner.
    const shown = vault.rehydrate(result.answer);
    assert(shown.includes('Maria Silva'), 're-hydrated answer shows the real name');
    assert(shown.includes('João Costa'), 're-hydrated answer shows the real name');
    assert(!shown.includes('Employee 1'), 'pseudonym replaced in the shown answer');
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test('loop returns text directly when no tool is needed', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'To add a product, open Products and tap New.' }],
    }), { status: 200 }))) as typeof fetch;
  try {
    const ctx: ToolContext = { admin: fakeAdmin, tenantId: 'tenant-a', vault: new PiiVault() };
    const result = await runAssistant({ apiKey: 'k', todayIso: '2026-07-07', history: [], question: 'how do I add a product?', ctx });
    eq(result.toolsUsed, []);
    assert(result.answer.startsWith('To add a product'), 'returns model text');
  } finally {
    globalThis.fetch = realFetch;
  }
});
