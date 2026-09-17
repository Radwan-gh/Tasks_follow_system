-- "تذكرني" (remember me) on the login screen.
--
-- A refresh token now records the choice made when it was issued: a remembered
-- session gets JWT_REFRESH_TTL (30 days by default), an unremembered one the
-- much shorter JWT_REFRESH_TTL_SHORT. Rotation in `/auth/refresh` reads this
-- column so an unremembered session cannot renew itself into a long-lived one.
--
-- Existing rows default to `true`: they were issued under the old, always
-- long-lived behavior and must not be shortened retroactively.

ALTER TABLE "RefreshToken" ADD COLUMN "remembered" BOOLEAN NOT NULL DEFAULT true;
