-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "categoryId" TEXT;

-- CreateTable
CREATE TABLE "BoardCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Board_categoryId_idx" ON "Board"("categoryId");

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BoardCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardCategory" ADD CONSTRAINT "BoardCategory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
