-- A computed row is one per ingredient (#152): its key is `<ingredientId>`, no longer `<ingredientId>:<unit>`.
-- The records stored per unit are merged per list and ingredient: hidden when any of them was hidden, checked by the
-- latest check (who and when) when any of them was checked. Manual items (`manual:<id>`) are left as they are.
INSERT INTO shopping_item (list_id, item_key, kind, hidden, checked_by, checked_at, created_at)
SELECT
  list_id,
  split_part(item_key, ':', 1),
  'computed',
  bool_or(hidden),
  (array_agg(checked_by ORDER BY checked_at DESC NULLS LAST))[1],
  max(checked_at),
  min(created_at)
FROM shopping_item
WHERE kind = 'computed' AND item_key LIKE '%:%'
GROUP BY list_id, split_part(item_key, ':', 1)
ON CONFLICT (list_id, item_key) DO UPDATE SET
  hidden = shopping_item.hidden OR excluded.hidden,
  checked_by = CASE
    WHEN excluded.checked_at > shopping_item.checked_at OR shopping_item.checked_at IS NULL
      THEN excluded.checked_by
    ELSE shopping_item.checked_by
  END,
  checked_at = greatest(shopping_item.checked_at, excluded.checked_at);
--> statement-breakpoint
DELETE FROM shopping_item WHERE kind = 'computed' AND item_key LIKE '%:%';
