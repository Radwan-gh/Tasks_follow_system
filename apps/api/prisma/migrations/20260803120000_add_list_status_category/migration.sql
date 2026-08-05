-- CreateEnum
CREATE TYPE "ListStatusCategory" AS ENUM ('NEW', 'READY', 'IN_PROGRESS', 'REVIEW', 'DONE');

-- AlterTable
ALTER TABLE "List" ADD COLUMN     "statusCategory" "ListStatusCategory";
