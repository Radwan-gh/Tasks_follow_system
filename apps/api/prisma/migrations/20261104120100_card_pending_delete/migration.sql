-- AlterTable
-- Pending deletion with a 30-second undo (docs/05-boards-lists-cards.md).
ALTER TABLE "Card" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Card_deletedAt_idx" ON "Card"("deletedAt");
