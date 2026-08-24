-- Add the "انتهى" (CLOSED) status category.
--
-- This is on its own, ahead of the data migration that uses it, because
-- Postgres will not let a newly added enum value be *used* in the same
-- transaction that adds it — and Prisma runs each migration file in one
-- transaction. Splitting the two is the documented way around it.
ALTER TYPE "ListStatusCategory" ADD VALUE 'CLOSED';
