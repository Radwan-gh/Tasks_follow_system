-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "isRestricted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CardMember" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardMember_userId_idx" ON "CardMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CardMember_cardId_userId_key" ON "CardMember"("cardId", "userId");

-- AddForeignKey
ALTER TABLE "CardMember" ADD CONSTRAINT "CardMember_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardMember" ADD CONSTRAINT "CardMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
