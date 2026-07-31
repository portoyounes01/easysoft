// Curated read-only tools exposed to the model. Each maps 1:1 to a
// SECURITY DEFINER, SELECT-only RPC that is tenant-scoped by p_tenant_id (see
// 20260729000000_assistant_readonly_rpcs.sql). The model can ONLY reach data
// through these — it never emits SQL, and the RPCs physically cannot write.
//
// Tenant is injected server-side (never from tool input), so a prompt-injected
// message cannot widen scope. Name-bearing results pass through the PiiVault
// before they are returned to the model.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { minimizeRow, PiiVault } from './pii.ts';

export interface ToolContext {
  admin: SupabaseClient;
  tenantId: string;
  vault: PiiVault;
}

const dateProps = {
  date_start: { type: 'string', description: 'Start date, inclusive, format YYYY-MM-DD.' },
  date_end: { type: 'string', description: 'End date, inclusive, format YYYY-MM-DD.' },
};

export const TOOL_DEFS = [
  {
    name: 'get_sales_overview',
    description: 'Totals for a date range: revenue, transaction count, items sold, tax, profit, average ticket. Use for "how much did I sell", "total sales this week", etc.',
    input_schema: { type: 'object', properties: { ...dateProps }, required: ['date_start', 'date_end'] },
  },
  {
    name: 'get_daily_sales',
    description: 'Per-day sales series (date, total_sales, transaction_count, items_sold, tax, profit) over a range. Use for trends or "which day was best".',
    input_schema: { type: 'object', properties: { ...dateProps }, required: ['date_start', 'date_end'] },
  },
  {
    name: 'get_sales_by_employee',
    description: 'Sales totals grouped by employee for a date range, sorted highest first. Use for "which employee sold/invoiced the most".',
    input_schema: { type: 'object', properties: { ...dateProps }, required: ['date_start', 'date_end'] },
  },
  {
    name: 'get_top_products',
    description: 'Best-selling products for a date range by quantity, with revenue. Use for "top/best products".',
    input_schema: { type: 'object', properties: { ...dateProps, limit: { type: 'integer', description: 'How many products (default 10).' } }, required: ['date_start', 'date_end'] },
  },
  {
    name: 'get_sales_by_payment',
    description: 'Sales split by payment method (cash, card, mixed) for a date range.',
    input_schema: { type: 'object', properties: { ...dateProps }, required: ['date_start', 'date_end'] },
  },
  {
    name: 'get_low_stock',
    description: 'Products currently at or below their minimum stock (low or out of stock). No date needed.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_product_catalog',
    description: 'Current product catalog with price, cost, stock, plus total inventory value (stock*cost). Optionally filter by category_id.',
    input_schema: { type: 'object', properties: { category_id: { type: 'string', description: 'Optional category UUID to filter by.' }, limit: { type: 'integer' } } },
  },
  {
    name: 'get_category_sales',
    description: 'Sales grouped by product category for a date range (revenue and quantity).',
    input_schema: { type: 'object', properties: { ...dateProps }, required: ['date_start', 'date_end'] },
  },
  {
    name: 'list_transactions',
    description: 'Individual transactions (headers) for a date range, newest first. Optionally filter by payment_method ("cash"|"card"|"mixed") or employee_id.',
    input_schema: { type: 'object', properties: { ...dateProps, payment_method: { type: 'string', enum: ['cash', 'card', 'mixed'] }, employee_id: { type: 'string' }, limit: { type: 'integer' } }, required: ['date_start', 'date_end'] },
  },
  {
    name: 'get_transaction_detail',
    description: 'Full detail (line items) for one transaction by its id.',
    input_schema: { type: 'object', properties: { transaction_id: { type: 'string', description: 'Transaction UUID.' } }, required: ['transaction_id'] },
  },
  {
    name: 'search_docs',
    description: 'Search the product how-to guides to answer "how do I ..." questions about using the software (adding products, printing, closing the register, etc.). Returns relevant documentation snippets.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Keywords describing what the user wants to do.' }, limit: { type: 'integer' } }, required: ['query'] },
  },
];

type Input = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function rpc(ctx: ToolContext, fn: string, params: Record<string, unknown>) {
  const { data, error } = await ctx.admin.rpc(fn, params);
  if (error) return { error: error.message };
  return data;
}

// Tools whose output may contain names → run through the PiiVault.
const PII_TOOLS = new Set(['get_sales_by_employee', 'list_transactions', 'get_transaction_detail']);

export async function runTool(name: string, input: Input, ctx: ToolContext): Promise<unknown> {
  const t = ctx.tenantId;
  let out: unknown;

  switch (name) {
    case 'get_sales_overview':
      out = await rpc(ctx, 'assistant_sales_overview', { p_tenant_id: t, p_start: s(input.date_start), p_end: s(input.date_end) });
      break;
    case 'get_daily_sales':
      out = await rpc(ctx, 'assistant_daily_sales', { p_tenant_id: t, p_start: s(input.date_start), p_end: s(input.date_end) });
      break;
    case 'get_sales_by_employee':
      out = await rpc(ctx, 'assistant_sales_by_employee', { p_tenant_id: t, p_start: s(input.date_start), p_end: s(input.date_end) });
      break;
    case 'get_top_products':
      out = await rpc(ctx, 'assistant_top_products', { p_tenant_id: t, p_start: s(input.date_start), p_end: s(input.date_end), p_limit: n(input.limit) ?? 10 });
      break;
    case 'get_sales_by_payment':
      out = await rpc(ctx, 'assistant_sales_by_payment', { p_tenant_id: t, p_start: s(input.date_start), p_end: s(input.date_end) });
      break;
    case 'get_low_stock':
      out = await rpc(ctx, 'assistant_low_stock', { p_tenant_id: t });
      break;
    case 'get_product_catalog':
      out = await rpc(ctx, 'assistant_product_catalog', { p_tenant_id: t, p_category_id: s(input.category_id), p_limit: n(input.limit) ?? 100 });
      break;
    case 'get_category_sales':
      out = await rpc(ctx, 'assistant_category_sales', { p_tenant_id: t, p_start: s(input.date_start), p_end: s(input.date_end) });
      break;
    case 'list_transactions':
      out = await rpc(ctx, 'assistant_list_transactions', { p_tenant_id: t, p_start: s(input.date_start), p_end: s(input.date_end), p_payment_method: s(input.payment_method), p_employee_id: s(input.employee_id), p_limit: n(input.limit) ?? 50 });
      break;
    case 'get_transaction_detail':
      out = await rpc(ctx, 'assistant_transaction_detail', { p_tenant_id: t, p_id: s(input.transaction_id) });
      break;
    case 'search_docs':
      out = await rpc(ctx, 'assistant_search_docs', { p_query: s(input.query), p_limit: n(input.limit) ?? 5 });
      break;
    default:
      return { error: `Unknown tool: ${name}` };
  }

  return PII_TOOLS.has(name) ? minimizeRow(out, ctx.vault) : out;
}
