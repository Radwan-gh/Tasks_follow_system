-- CreateEnum
CREATE TYPE "BoardKind" AS ENUM ('PERSONAL', 'SHARED');

-- CreateEnum
CREATE TYPE "BoardShareRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canApproveBoards" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "kind" "BoardKind" NOT NULL DEFAULT 'PERSONAL';

-- CreateTable
CREATE TABLE "BoardShareRequest" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "BoardShareRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardShareRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoardShareRequest_boardId_createdAt_idx" ON "BoardShareRequest"("boardId", "createdAt");

-- CreateIndex
CREATE INDEX "BoardShareRequest_status_createdAt_idx" ON "BoardShareRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "BoardShareRequest" ADD CONSTRAINT "BoardShareRequest_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardShareRequest" ADD CONSTRAINT "BoardShareRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardShareRequest" ADD CONSTRAINT "BoardShareRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing boards: one that already has anyone besides its owner (a member or
-- a viewer) counts as shared and approved; one with only its owner is personal.
UPDATE "Board" b SET "kind" = 'SHARED'
WHERE EXISTS (
  SELECT 1 FROM "BoardMember" m WHERE m."boardId" = b."id" AND m."userId" <> b."ownerId"
);
