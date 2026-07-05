-- =====================================================================
-- allocate_fiscal_number — atomic, gap-free per-series counter bump.
--
-- Called by the pos-checkout edge function (service_role) to reserve the
-- next document.number for (tenant, environment, doc_type, series). Uses a
-- single UPDATE ... RETURNING so concurrent tills on the same series serialize
-- on the row lock and never collide. The series row is upserted by the caller
-- first; if it is somehow missing we raise rather than silently return NULL
-- (a NULL number would corrupt the fiscal sequence).
--
-- SECURITY DEFINER + self-enforced tenant arg: the function trusts its caller
-- (service_role, from the edge function that already derived tenant from the
-- device JWT). It is NOT granted to authenticated/anon, so a client cannot
-- burn numbers directly.
--
-- NOTE: allocation happens BEFORE the fiskaly call. If fiskaly then fails, the
-- number is "spent" (a gap). Portuguese fiscal series tolerate gaps as long as
-- the sequence is monotonic and gaps are explainable; the fiscal_issue_attempts
-- ledger records every spent number's outcome. A reconciler (deferred) can later
-- emit ABORT/void records for gaps if AT requires it. NO explicit BEGIN/COMMIT.
-- =====================================================================

-- Remember the number/series a checkout allocated, so a retry of a crashed
-- (status='pending') attempt reuses it instead of burning a fresh number.
ALTER TABLE public.fiscal_issue_attempts ADD COLUMN IF NOT EXISTS document_number text;
ALTER TABLE public.fiscal_issue_attempts ADD COLUMN IF NOT EXISTS series text;

CREATE OR REPLACE FUNCTION public.allocate_fiscal_number(
  p_tenant   uuid,
  p_env      text,
  p_doc_type text,
  p_series   text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next bigint;
BEGIN
  UPDATE public.fiscal_series
     SET current_number = current_number + 1
   WHERE tenant_id = p_tenant
     AND environment = p_env
     AND doc_type = p_doc_type
     AND series = p_series
  RETURNING current_number INTO v_next;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'fiscal_series row missing for %/%/%/%', p_tenant, p_env, p_doc_type, p_series
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_fiscal_number(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_fiscal_number(uuid, text, text, text) TO service_role;
