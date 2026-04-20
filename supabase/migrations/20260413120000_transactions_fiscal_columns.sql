-- Portugal AT: mirror fiscal issuance on transactions for server sync / evidence pack.
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS fiscal_document_id TEXT;

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS fiscal_metadata_json JSONB;

COMMENT ON COLUMN public.transactions.fiscal_document_id IS 'Immutable client fiscal document id (UUID string) after AT checkout.';
COMMENT ON COLUMN public.transactions.fiscal_metadata_json IS 'Immutable fiscal snapshot (invoice, ATCUD, hash, QR payload, chain).';
