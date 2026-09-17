-- Login moves from `email` to `username`.
--
-- `username` becomes the sole credential; `email` is demoted to an optional
-- contact field (still unique when present, but no longer used to sign in or to
-- add someone to a board).
--
-- Existing rows are backfilled from the email local-part so every account keeps
-- working without admin intervention: `walid.kelzia@gmail.com` -> `walid.kelzia`.

ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Local-part, lowercased, with anything outside [a-z0-9._-] stripped.
UPDATE "User"
SET "username" = regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9._-]', '', 'g');

-- A local-part made entirely of stripped characters (or an empty email) would
-- leave this blank — fall back to the row id, which is always present.
UPDATE "User"
SET "username" = "id"
WHERE "username" IS NULL OR "username" = '';

-- Two different addresses can share a local-part (a@x.com / a@y.com). Oldest
-- account keeps the bare name; the rest get a suffix from their id, which is
-- unique by construction.
WITH ranked AS (
  SELECT "id",
         "username",
         row_number() OVER (PARTITION BY "username" ORDER BY "createdAt", "id") AS rn
  FROM "User"
)
UPDATE "User" u
SET "username" = ranked."username" || '-' || right(u."id", 6)
FROM ranked
WHERE u."id" = ranked."id"
  AND ranked.rn > 1;

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- `email` is no longer required.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
