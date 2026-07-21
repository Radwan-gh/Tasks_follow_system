-- CreateEnum
CREATE TYPE "CardActivityType" AS ENUM ('CREATED', 'MOVED', 'RENAMED', 'DESCRIPTION_UPDATED', 'DUE_DATE_CHANGED', 'ARCHIVED', 'UNARCHIVED');

-- CreateTable
CREATE TABLE "CardActivity" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "CardActivityType" NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardActivity_cardId_createdAt_idx" ON "CardActivity"("cardId", "createdAt");

-- AddForeignKey
ALTER TABLE "CardActivity" ADD CONSTRAINT "CardActivity_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardActivity" ADD CONSTRAINT "CardActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
