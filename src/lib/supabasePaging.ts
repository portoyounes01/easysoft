// Shared PostgREST pagination for the PWA read source (docs/pwa-read-surfaces-plan.md).
// PostgREST caps a single response at ~1000 rows; an unbounded .select() silently
// truncates. fetchAllPages ranges through the full result so no read undercounts.
//
// Callers MUST add a deterministic secondary sort key (e.g. .order('id')) so .range()
// paging is stable across pages. PG_PAGE_SIZE assumes the server's PostgREST max-rows
// is >= 1000; if it's lower, reports/lists still undercount — align this to it.
export const PG_PAGE_SIZE = 1000;

export async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PG_PAGE_SIZE) {
    const { data, error } = await build(from, from + PG_PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PG_PAGE_SIZE) break;
  }
  return out;
}
