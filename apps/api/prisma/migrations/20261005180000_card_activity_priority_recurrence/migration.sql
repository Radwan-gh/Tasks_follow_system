-- AlterEnum
ALTER TYPE "CardActivityType" ADD VALUE 'PRIORITY_CHANGED';
ALTER TYPE "CardActivityType" ADD VALUE 'RECURRENCE_CHANGED';

-- DUE_DATE_CHANGED values now say whether the due date has a time of day:
-- `YYYY-MM-DD` for date-only, a full ISO timestamp otherwise. Rows written
-- before this didn't record it and were always shown as a date, so they become
-- date-only on the users' calendar (APP_TIME_ZONE's default) — the same day they
-- displayed before.
UPDATE "CardActivity"
SET "fromValue" = to_char(("fromValue")::timestamptz AT TIME ZONE 'Asia/Damascus', 'YYYY-MM-DD')
WHERE "type" = 'DUE_DATE_CHANGED' AND "fromValue" LIKE '____-__-__T%';

UPDATE "CardActivity"
SET "toValue" = to_char(("toValue")::timestamptz AT TIME ZONE 'Asia/Damascus', 'YYYY-MM-DD')
WHERE "type" = 'DUE_DATE_CHANGED' AND "toValue" LIKE '____-__-__T%';
