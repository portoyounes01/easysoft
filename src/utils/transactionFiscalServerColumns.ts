/**
 * Optional / newer `transactions` columns. If the remote Supabase was never
 * fully migrated, PostgREST can return 400 with PGRST204 for unknown
 * properties; strip these and retry the insert/upsert.
 *
 * - Fiscal: `supabase/migrations/20260413120000_transactions_fiscal_columns.sql`
 * - Discount metadata: `supabase/migrations/2025-09-24_add_discount_metadata.sql`
 */
export const OPTIONAL_TRANSACTION_MIGRATION_KEYS: ReadonlyArray<string> = [
    'fiscal_document_id',
    'fiscal_metadata_json',
    'fiscal_cancelled_at',
    'fiscal_cancelled_reason',
    'fiscal_cancelled_by_employee_id',
    'discount_type',
    'discount_percentage',
];

/** @deprecated use OPTIONAL_TRANSACTION_MIGRATION_KEYS */
export const OPTIONAL_FISCAL_TRANSACTION_SERVER_KEYS = OPTIONAL_TRANSACTION_MIGRATION_KEYS;

export function stripOptionalFiscalTransactionFields(
    row: Record<string, unknown>
): Record<string, unknown> {
    const o = { ...row };
    for (const k of OPTIONAL_TRANSACTION_MIGRATION_KEYS) {
        delete o[k];
    }
    return o;
}

/**
 * PGRST204: unknown column in JSON body vs PostgREST schema cache.
 * Message text can differ slightly by version; do not require a specific table name substring.
 */
export function isPgrstMissingTransactionsColumnError(
    error: { code?: string; message?: string } | null | undefined
): boolean {
    if (!error) return false;
    if (error.code === 'PGRST204') return true;
    const m = String(error.message || '').toLowerCase();
    return m.includes('schema cache') && m.includes('column');
}
