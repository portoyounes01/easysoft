// PII-minimization for the AI assistant.
//
// GDPR posture: the model is US-hosted, so personal data must not reach it.
// Aggregate tools (sales overview, totals, top products) carry NO personal
// data and bypass this. The few tools that expose names (per-employee sales,
// per-transaction detail, transaction lists) route their results through a
// PiiVault: real names are swapped for stable pseudonyms ("Employee 1",
// "Customer 2") BEFORE the request leaves for the model, and the model's final
// answer is re-hydrated back to real names server-side. The model therefore
// only ever sees pseudonyms; the owner sees real names.
//
// Fields that are never useful to the model and are stripped outright:
// tax numbers (NIF), email, phone, address — plus credentials, which the read
// RPCs never select in the first place.

const STRIP_KEYS = new Set([
  'tax_number', 'nif', 'vat', 'email', 'phone', 'address', 'city',
  'postal_code', 'pin', 'password_hash', 'password',
]);

export class PiiVault {
  private realToAlias = new Map<string, string>(); // `${kind} ${real}` -> alias
  private aliasToReal = new Map<string, string>(); // alias -> real
  private counters = new Map<string, number>();

  alias(kind: 'Employee' | 'Customer', real: string | null | undefined): string {
    const name = (real ?? '').trim();
    if (!name) return `${kind} (unknown)`;
    const key = `${kind} ${name}`;
    let a = this.realToAlias.get(key);
    if (!a) {
      const n = (this.counters.get(kind) ?? 0) + 1;
      this.counters.set(kind, n);
      a = `${kind} ${n}`;
      this.realToAlias.set(key, a);
      this.aliasToReal.set(a, name);
    }
    return a;
  }

  // Replace pseudonyms in the model's answer with the real names.
  // Longest aliases first so "Employee 1" never corrupts "Employee 12".
  rehydrate(text: string): string {
    if (!text) return text;
    const pairs = [...this.aliasToReal.entries()].sort((a, b) => b[0].length - a[0].length);
    let out = text;
    for (const [alias, real] of pairs) out = out.split(alias).join(real);
    return out;
  }
}

// Recursively drop always-strip keys and pseudonymize name-bearing keys.
export function minimizeRow(row: unknown, vault: PiiVault): unknown {
  if (Array.isArray(row)) return row.map((r) => minimizeRow(r, vault));
  if (row && typeof row === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      if (STRIP_KEYS.has(k)) continue;
      if (k === 'employee_name') out[k] = vault.alias('Employee', v as string);
      else if (k === 'customer_name') out[k] = vault.alias('Customer', v as string);
      else out[k] = minimizeRow(v, vault);
    }
    return out;
  }
  return row;
}
