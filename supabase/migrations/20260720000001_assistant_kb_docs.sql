-- =====================================================================
-- AI ASSISTANT — how-to knowledge base (Phase 1)
--
-- The assistant answers "how do I use the software?" from the product's own
-- markdown guides. This corpus is PRODUCT documentation — it contains NO
-- business data and NO personal data — so it is tenant-agnostic and safe to
-- send verbatim to the model.
--
-- The corpus is small (~25 root how-to guides, ~180 KB), so Postgres full-text
-- search (tsvector) is enough; pgvector/embeddings are a deliberate non-goal
-- for v1. Rows are populated by scripts/build-kb.ts (chunked by heading).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.kb_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file text NOT NULL,
  title       text NOT NULL,
  heading     text,
  content     text NOT NULL,
  ts tsvector GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(heading, '') || ' ' || coalesce(content, ''))
  ) STORED,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_file, heading)
);

CREATE INDEX IF NOT EXISTS idx_kb_documents_ts ON public.kb_documents USING GIN (ts);

-- Not tenant data, but lock it to the backend: RLS on, no client policy (deny
-- anon/authenticated). The search RPC is SECURITY DEFINER owned by postgres
-- (which owns this table and so bypasses RLS), and reachable only by service_role.
ALTER TABLE public.kb_documents ENABLE ROW LEVEL SECURITY;

-- --- search RPC (service_role only, like the assistant_* read tools) ---------
CREATE OR REPLACE FUNCTION public.assistant_search_docs(
  p_query text, p_limit int DEFAULT 5
)
RETURNS TABLE (source_file text, title text, heading text, content text, rank real)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q tsquery;
BEGIN
  IF p_query IS NULL OR length(btrim(p_query)) = 0 THEN
    RETURN;
  END IF;
  -- OR the terms: websearch_to_tsquery ANDs them, which is too strict for doc
  -- lookup (a guide would need every query word). Swapping & for | matches any
  -- term and ranks by how many hit, giving usable recall for how-to questions.
  q := NULLIF(replace(websearch_to_tsquery('english', p_query)::text, '&', '|'), '')::tsquery;
  IF q IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT d.source_file, d.title, d.heading, d.content, ts_rank(d.ts, q) AS rank
  FROM public.kb_documents d
  WHERE d.ts @@ q
  ORDER BY rank DESC
  LIMIT GREATEST(COALESCE(p_limit, 5), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.assistant_search_docs(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assistant_search_docs(text, int) TO service_role;

COMMENT ON TABLE public.kb_documents IS
  'Product how-to documentation chunks for the AI assistant. Not tenant/business data. Populated by scripts/build-kb.ts.';
