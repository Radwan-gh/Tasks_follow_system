-- AlterEnum
ALTER TYPE "CardActivityType" ADD VALUE 'CHECKLIST_ITEM_ADDED';
ALTER TYPE "CardActivityType" ADD VALUE 'CHECKLIST_ITEM_COMPLETED';
ALTER TYPE "CardActivityType" ADD VALUE 'CHECKLIST_ITEM_UNCOMPLETED';
ALTER TYPE "CardActivityType" ADD VALUE 'CHECKLIST_ITEM_REMOVED';

-- CreateEnum
CREATE TYPE "RecurrenceCadence" AS ENUM ('WEEKLY');

-- AlterTable
ALTER TABLE "Card" ADD COLUMN "recurringTaskId" TEXT,
    ADD COLUMN "occurrenceStart" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RecurringTask" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "targetListId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cadence" "RecurrenceCadence" NOT NULL DEFAULT 'WEEKLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringSubtask" (
    "id" TEXT NOT NULL,
    "recurringTaskId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringSubtask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "recurringSubtaskId" TEXT,
    "label" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringTask_boardId_position_idx" ON "RecurringTask"("boardId", "position");

-- CreateIndex
CREATE INDEX "RecurringSubtask_recurringTaskId_position_idx" ON "RecurringSubtask"("recurringTaskId", "position");

-- CreateIndex
CREATE INDEX "ChecklistItem_cardId_position_idx" ON "ChecklistItem"("cardId", "position");

-- CreateIndex
CREATE INDEX "ChecklistItem_recurringSubtaskId_idx" ON "ChecklistItem"("recurringSubtaskId");

-- CreateIndex
CREATE UNIQUE INDEX "Card_recurringTaskId_occurrenceStart_key" ON "Card"("recurringTaskId", "occurrenceStart");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_recurringTaskId_fkey" FOREIGN KEY ("recurringTaskId") REFERENCES "RecurringTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTask" ADD CONSTRAINT "RecurringTask_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTask" ADD CONSTRAINT "RecurringTask_targetListId_fkey" FOREIGN KEY ("targetListId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTask" ADD CONSTRAINT "RecurringTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSubtask" ADD CONSTRAINT "RecurringSubtask_recurringTaskId_fkey" FOREIGN KEY ("recurringTaskId") REFERENCES "RecurringTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_recurringSubtaskId_fkey" FOREIGN KEY ("recurringSubtaskId") REFERENCES "RecurringSubtask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
