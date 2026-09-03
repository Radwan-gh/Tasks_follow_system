-- AlterEnum
ALTER TYPE "CardActivityType" ADD VALUE 'COST_UPDATED';

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "dueDateHasTime" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL,
    "currencySymbol" TEXT NOT NULL DEFAULT 'ل.س',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
