import { CardSchema } from "@app/types";
import { Prisma, type CardPriority } from "@prisma/client";

/** Appended to a duplicated task's title. */
export const COPY_SUFFIX = " (نسخة)";

/** The longest a title may be — `CardSchema.title`'s own limit. */
const MAX_TITLE = CardSchema.shape.title.maxLength ?? 300;

/**
 * «<title> (نسخة)», cutting the original short so the result still fits the
 * title limit. Trailing spaces left by the cut are dropped, so the suffix
 * never follows a double space.
 */
export function duplicateTitle(title: string): string {
  const room = MAX_TITLE - COPY_SUFFIX.length;
  const base = title.length > room ? title.slice(0, room).trimEnd() : title;
  return `${base}${COPY_SUFFIX}`;
}

/** What `POST /cards/:id/duplicate` copies from the card row itself. */
export interface DuplicableCard {
  title: string;
  description: string | null;
  dueDate: Date | null;
  dueDateHasTime: boolean;
  priority: CardPriority;
  costAmount: Prisma.Decimal | null;
  costNote: string | null;
  recurrence: Prisma.JsonValue | null;
  isRestricted: boolean;
}

/**
 * The copy's own fields (docs/05-boards-lists-cards.md «نسخ المهمة»): every
 * detail of the original — cost included, unlike a recurrence's next
 * instance — but never its archived or pending-delete state. Where it goes and
 * who created it are the caller's to add.
 */
export function duplicateCardFields(card: DuplicableCard) {
  return {
    title: duplicateTitle(card.title),
    description: card.description,
    dueDate: card.dueDate,
    dueDateHasTime: card.dueDateHasTime,
    priority: card.priority,
    costAmount: card.costAmount,
    costNote: card.costNote,
    recurrence: card.recurrence === null ? Prisma.JsonNull : (card.recurrence as Prisma.InputJsonValue),
    isRestricted: card.isRestricted,
  };
}
