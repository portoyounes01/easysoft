-- Backfill discount_type and discount_percentage for existing transactions

-- 1) Fill percentage when all items share the same non-null percentage
WITH uniform AS (
  SELECT
    ti.transaction_id,
    CASE
      WHEN COUNT(*) FILTER (WHERE ti.discount_percentage IS NULL) = 0
           AND MIN(ti.discount_percentage) = MAX(ti.discount_percentage)
      THEN MIN(ti.discount_percentage)
      ELSE NULL
    END AS pct
  FROM public.transaction_items ti
  WHERE ti.deleted_at IS NULL
  GROUP BY ti.transaction_id
)
UPDATE public.transactions t
SET discount_type = 'percentage',
    discount_percentage = u.pct
FROM uniform u
WHERE t.id = u.transaction_id AND u.pct IS NOT NULL;

-- 2) For remaining rows with discount > 0, mark as fixed
UPDATE public.transactions
SET discount_type = 'fixed', discount_percentage = 0
WHERE (discount_type IS NULL OR discount_type = 'none')
  AND discount > 0;


