-- AlterEnum
-- Four priority levels (docs/05-boards-lists-cards.md): MEDIUM and HIGH between
-- NORMAL (the default) and URGENT, so the enum's own order stays low → high.
ALTER TYPE "CardPriority" ADD VALUE 'MEDIUM' BEFORE 'URGENT';
ALTER TYPE "CardPriority" ADD VALUE 'HIGH' BEFORE 'URGENT';
