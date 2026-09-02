-- Fractional-index `position` columns (List, Card, Subtask) must sort in
-- plain byte order for `generateKeyBetween`'s ordering guarantee to hold
-- (see `packages/ordering` and CLAUDE.md's "Fractional-index positions"
-- section). This database's default collation is a Windows locale
-- ("English_United States.1254"), which does NOT sort ASCII strings the
-- same way as JS's plain string comparison — e.g. it does not reliably put
-- every uppercase letter before every lowercase one. `ORDER BY position ASC`
-- was therefore returning lists/cards/subtasks in an order that did not
-- match the order the fractional-index keys were generated in.
--
-- Fix: pin these three columns to the "C" collation (byte-order, locale-
-- independent), matching what the ordering algorithm assumes. No data
-- migration needed — the stored key values were already correct; only the
-- SQL sort order was wrong.
ALTER TABLE "List" ALTER COLUMN "position" TYPE text COLLATE "C";
ALTER TABLE "Card" ALTER COLUMN "position" TYPE text COLLATE "C";
ALTER TABLE "Subtask" ALTER COLUMN "position" TYPE text COLLATE "C";
