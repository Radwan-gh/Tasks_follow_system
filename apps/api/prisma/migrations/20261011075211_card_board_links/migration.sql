-- AlterEnum
ALTER TYPE "CardActivityType" ADD VALUE 'BOARDS_CHANGED';

-- CreateTable
-- A task shown on more than its home board (docs/18-multi-board-tasks.md).
-- `position` is a fractional-index key compared against `Card.position` in the
-- same column, so it gets the same byte-order collation (see
-- 20260831154926_fix_position_collation).
CREATE TABLE "CardBoardLink" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "position" TEXT COLLATE "C" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardBoardLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardBoardLink_listId_position_idx" ON "CardBoardLink"("listId", "position");

-- CreateIndex
CREATE INDEX "CardBoardLink_boardId_idx" ON "CardBoardLink"("boardId");

-- CreateIndex
CREATE UNIQUE INDEX "CardBoardLink_cardId_boardId_key" ON "CardBoardLink"("cardId", "boardId");

-- AddForeignKey
ALTER TABLE "CardBoardLink" ADD CONSTRAINT "CardBoardLink_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardBoardLink" ADD CONSTRAINT "CardBoardLink_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardBoardLink" ADD CONSTRAINT "CardBoardLink_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE;
