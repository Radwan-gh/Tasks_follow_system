-- AlterTable
-- A repeating task's instances, linked (docs/14-notifications-comments-attachments.md,
-- «توليد المهمة المتكررة»): each instance points at the one it was spawned from,
-- and every instance carries its series' first card id and its cycle number,
-- which is what reports group and order a repeating task by.
ALTER TABLE "Card" ADD COLUMN     "previousInstanceId" TEXT,
ADD COLUMN     "recurrenceIndex" INTEGER,
ADD COLUMN     "recurrenceSeriesId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Card_previousInstanceId_key" ON "Card"("previousInstanceId");

-- CreateIndex
CREATE INDEX "Card_recurrenceSeriesId_idx" ON "Card"("recurrenceSeriesId");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_previousInstanceId_fkey" FOREIGN KEY ("previousInstanceId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: link the instances spawned before this migration. The old model
-- spawned the next instance inside the transaction that moved the previous one
-- into «انتهى», as a copy with the same board, title and creator — so B was
-- spawned from A when A has a MOVED activity within seconds of B's creation.
-- Only unambiguous pairs are linked (one candidate per side); anything else
-- stays unlinked and simply starts a series of its own below.
WITH candidates AS (
  SELECT b."id" AS b_id, a."id" AS a_id
  FROM "Card" b
  JOIN "Card" a
    ON a."boardId" = b."boardId"
   AND a."title" = b."title"
   AND a."createdById" = b."createdById"
   AND a."createdAt" < b."createdAt"
  WHERE (jsonb_typeof(a."recurrence") = 'object' OR jsonb_typeof(b."recurrence") = 'object')
    AND EXISTS (
      SELECT 1 FROM "CardActivity" m
      WHERE m."cardId" = a."id"
        AND m."type" = 'MOVED'
        AND m."createdAt" BETWEEN b."createdAt" - INTERVAL '5 seconds' AND b."createdAt" + INTERVAL '5 seconds'
    )
),
one_per_b AS (
  SELECT b_id, MIN(a_id) AS a_id FROM candidates GROUP BY b_id HAVING COUNT(*) = 1
),
pairs AS (
  SELECT b_id, a_id FROM one_per_b
  WHERE a_id IN (SELECT a_id FROM one_per_b GROUP BY a_id HAVING COUNT(*) = 1)
)
UPDATE "Card" c SET "previousInstanceId" = pairs.a_id
FROM pairs WHERE c."id" = pairs.b_id;

-- Backfill: every chain's first card is its series; each instance gets its depth
-- as its cycle number. A repeating card with no chain is a series of one.
WITH RECURSIVE chain AS (
  SELECT r."id", r."id" AS root, 1 AS idx
  FROM "Card" r
  WHERE r."previousInstanceId" IS NULL
    AND (jsonb_typeof(r."recurrence") = 'object'
         OR EXISTS (SELECT 1 FROM "Card" n WHERE n."previousInstanceId" = r."id"))
  UNION ALL
  SELECT c."id", chain.root, chain.idx + 1
  FROM "Card" c JOIN chain ON c."previousInstanceId" = chain."id"
)
UPDATE "Card" c SET "recurrenceSeriesId" = chain.root, "recurrenceIndex" = chain.idx
FROM chain WHERE c."id" = chain."id";
