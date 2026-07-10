// Run: deno test supabase/functions/assistant/pii_test.ts
import { PiiVault, minimizeRow } from './pii.ts';

function assert(cond: unknown, msg = 'assertion failed') { if (!cond) throw new Error(msg); }
function eq(a: unknown, b: unknown) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`expected ${y}, got ${x}`);
}

Deno.test('pseudonyms are stable per real name', () => {
  const v = new PiiVault();
  eq(v.alias('Employee', 'Maria Silva'), 'Employee 1');
  eq(v.alias('Employee', 'João Costa'), 'Employee 2');
  eq(v.alias('Employee', 'Maria Silva'), 'Employee 1'); // stable
  eq(v.alias('Customer', 'Maria Silva'), 'Customer 1'); // separate kind
});

Deno.test('minimizeRow strips PII and pseudonymizes names', () => {
  const v = new PiiVault();
  const out = minimizeRow(
    { employee_name: 'Maria Silva', total_sales: 120.5, customer_name: 'ACME Lda', tax_number: '501234567', email: 'a@b.pt', phone: '+351...' },
    v,
  ) as Record<string, unknown>;
  eq(out.employee_name, 'Employee 1');
  eq(out.customer_name, 'Customer 1');
  eq(out.total_sales, 120.5);
  assert(!('tax_number' in out), 'NIF must be stripped');
  assert(!('email' in out), 'email must be stripped');
  assert(!('phone' in out), 'phone must be stripped');
});

Deno.test('rehydrate maps pseudonyms back, longest-first (no 1-vs-12 corruption)', () => {
  const v = new PiiVault();
  for (let i = 1; i <= 12; i++) v.alias('Employee', `Person${i}`);
  const answer = 'Employee 12 sold the most, Employee 1 the least.';
  eq(v.rehydrate(answer), 'Person12 sold the most, Person1 the least.');
});

Deno.test('nested rows (transaction detail with items) are minimized recursively', () => {
  const v = new PiiVault();
  const out = minimizeRow(
    { customer_name: 'ACME Lda', employee_name: 'Maria Silva', items: [{ product_name: 'Coffee', quantity: 4 }] },
    v,
  ) as any;
  eq(out.customer_name, 'Customer 1');
  eq(out.employee_name, 'Employee 1');
  eq(out.items[0].product_name, 'Coffee'); // product names are not PII, kept
});

Deno.test('unknown names do not crash', () => {
  const v = new PiiVault();
  eq(v.alias('Employee', null), 'Employee (unknown)');
  eq(v.alias('Customer', '   '), 'Customer (unknown)');
});
