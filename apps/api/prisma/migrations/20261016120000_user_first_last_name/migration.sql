-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lastName" TEXT NOT NULL DEFAULT '';

-- Backfill: first word of the existing display name is the first name, the
-- rest (possibly empty) the last name.
UPDATE "User"
SET "firstName" = split_part(btrim("displayName"), ' ', 1),
    "lastName"  = btrim(substr(btrim("displayName"), length(split_part(btrim("displayName"), ' ', 1)) + 1));
