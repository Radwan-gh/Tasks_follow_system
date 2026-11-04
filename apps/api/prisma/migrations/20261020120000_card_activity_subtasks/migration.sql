-- AlterEnum
-- Subtask changes in a card's history (docs/10-subtasks-and-assignment.md).
ALTER TYPE "CardActivityType" ADD VALUE 'SUBTASK_ADDED';
ALTER TYPE "CardActivityType" ADD VALUE 'SUBTASK_RENAMED';
ALTER TYPE "CardActivityType" ADD VALUE 'SUBTASK_COMPLETED';
ALTER TYPE "CardActivityType" ADD VALUE 'SUBTASK_REOPENED';
ALTER TYPE "CardActivityType" ADD VALUE 'SUBTASK_DELETED';
ALTER TYPE "CardActivityType" ADD VALUE 'SUBTASK_ASSIGNED';
