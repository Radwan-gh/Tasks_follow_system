-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canSendNotifications" BOOLEAN NOT NULL DEFAULT false;

-- DropForeignKey
ALTER TABLE "PushDevice" DROP CONSTRAINT "PushDevice_userId_fkey";

-- AlterTable
ALTER TABLE "PushDevice" ADD COLUMN     "deviceId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_deviceId_key" ON "PushDevice"("deviceId");

-- AddForeignKey
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
