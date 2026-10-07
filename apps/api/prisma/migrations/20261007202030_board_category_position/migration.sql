-- Categories get an admin-set order (fractional-index `position`, as on List
-- and Card). Existing rows keep the order they were shown in — by name — and
-- are numbered with the same keys `generateNKeysBetween(null, null, n)` would
-- produce: "a0".."az" for the first 62, then two-digit "b00".. keys.
-- COLLATE "C": fractional keys compare byte-wise, never by locale (see docs/06-ordering.md).
ALTER TABLE "BoardCategory" ADD COLUMN "position" TEXT COLLATE "C";

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "name", "id") - 1 AS i
  FROM "BoardCategory"
)
UPDATE "BoardCategory" c
SET "position" = CASE
  WHEN r.i < 62 THEN
    'a' || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', (r.i + 1)::int, 1)
  ELSE
    'b' || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', ((r.i - 62) / 62 + 1)::int, 1)
        || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', ((r.i - 62) % 62 + 1)::int, 1)
END
FROM ranked r
WHERE c."id" = r."id";

ALTER TABLE "BoardCategory" ALTER COLUMN "position" SET NOT NULL;
