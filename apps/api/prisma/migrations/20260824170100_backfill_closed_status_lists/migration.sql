-- Bring boards created before "انتهى" (CLOSED) existed in line with the
-- built-in template, without destroying anything.
--
-- A "template board" here is any board with at least one categorised list —
-- boards whose lists were all created by hand carry `statusCategory = NULL`
-- and are left completely alone.
--
-- Two steps:
--   1. Append an "انتهى" list to every template board that does not have one.
--   2. Reorder every list on those boards into the canonical status order.
--
-- "بانتظار تقييم" (REVIEW) is deliberately NOT removed. It was dropped from
-- the template when CLOSED was added, but existing boards may hold cards in
-- it; deleting or archiving it would lose work. It keeps its slot between
-- IN_PROGRESS and DONE.

-- Guard: the order keys written below are single base-62 digits ('a0'..'az'),
-- which can express at most 62 positions. That is far beyond any real board —
-- the template seeds five lists — but fail loudly rather than silently writing
-- duplicate positions and corrupting the ordering.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "List"
    WHERE "boardId" IN (SELECT DISTINCT "boardId" FROM "List" WHERE "statusCategory" IS NOT NULL)
    GROUP BY "boardId"
    HAVING COUNT(*) > 62
  ) THEN
    RAISE EXCEPTION
      'A board has more than 62 lists; this migration''s single-digit order keys cannot express that ordering. Reorder that board by hand, then re-run.';
  END IF;
END $$;

-- 1) Append "انتهى" where it is missing.
--
-- The id is a UUID rather than a cuid: cuids are generated client-side by
-- Prisma and Postgres has no equivalent. The column is plain text and ids are
-- opaque, so this is cosmetic only.
INSERT INTO "List" ("id", "boardId", "name", "position", "isArchived", "statusCategory", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  b."boardId",
  'انتهى',
  -- Provisional; step 2 rewrites every position on these boards anyway.
  'z0',
  false,
  'CLOSED'::"ListStatusCategory",
  NOW(),
  NOW()
FROM (SELECT DISTINCT "boardId" FROM "List" WHERE "statusCategory" = 'DONE') AS b
WHERE NOT EXISTS (
  SELECT 1 FROM "List" existing
  WHERE existing."boardId" = b."boardId" AND existing."statusCategory" = 'CLOSED'
);

-- 2) Reorder into canonical status order.
--
-- Uncategorised lists sort last, keeping their existing relative order — they
-- are the user's own columns and we have no business interleaving them with
-- the template's.
--
-- Positions are fractional-index keys (see packages/ordering). 'a0'..'az' is
-- exactly the ascending sequence `generateKeyBetween(prev, null)` produces
-- from an empty list, so the keys stay valid input for future moves.
WITH ordered AS (
  SELECT
    l."id",
    ROW_NUMBER() OVER (
      PARTITION BY l."boardId"
      ORDER BY
        CASE l."statusCategory"
          WHEN 'NEW'         THEN 1
          WHEN 'READY'       THEN 2
          WHEN 'IN_PROGRESS' THEN 3
          WHEN 'REVIEW'      THEN 4
          WHEN 'DONE'        THEN 5
          WHEN 'CLOSED'      THEN 6
          ELSE 7
        END,
        l."position"
    ) AS rn
  FROM "List" l
  WHERE l."boardId" IN (SELECT DISTINCT "boardId" FROM "List" WHERE "statusCategory" IS NOT NULL)
)
UPDATE "List"
SET "position" = 'a' || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', ordered.rn::int, 1)
FROM ordered
WHERE "List"."id" = ordered."id";
