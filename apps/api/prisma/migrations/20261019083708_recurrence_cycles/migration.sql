-- AlterEnum
ALTER TYPE "CardActivityType" ADD VALUE 'CYCLE_COMPLETED';

-- CreateTable
-- A recurring task is now one card that reopens itself: each close into «انتهى»
-- records one completed cycle here (docs/14-notifications-comments-attachments.md).
-- Cards spawned by the old copy-per-cycle model are left as they are.
CREATE TABLE "CardCycle" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3),
    "dueDateHasTime" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT NOT NULL,
    "lateMinutes" INTEGER,
    "subtaskDone" INTEGER NOT NULL DEFAULT 0,
    "subtaskTotal" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CardCycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardCycle_cardId_number_key" ON "CardCycle"("cardId", "number");

-- AddForeignKey
ALTER TABLE "CardCycle" ADD CONSTRAINT "CardCycle_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardCycle" ADD CONSTRAINT "CardCycle_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
