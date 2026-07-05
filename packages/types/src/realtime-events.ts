import { z } from "zod";
import { CardSchema, ListSchema } from "./domain";

/**
 * Realtime event contracts (Phase 2). Defined now, alongside the REST DTOs
 * they mirror, so the eventual Socket.IO gateway and both clients share one
 * source of truth instead of hand-typed payloads drifting apart.
 */

const BoardEventEnvelope = z.object({
  boardId: z.string(),
  clientMutationId: z.string().optional(),
});

export const CardCreatedEvent = BoardEventEnvelope.extend({
  type: z.literal("card.created"),
  card: CardSchema,
});

export const CardUpdatedEvent = BoardEventEnvelope.extend({
  type: z.literal("card.updated"),
  card: CardSchema,
});

export const CardMovedEvent = BoardEventEnvelope.extend({
  type: z.literal("card.moved"),
  cardId: z.string(),
  listId: z.string(),
  position: z.string(),
});

export const CardArchivedEvent = BoardEventEnvelope.extend({
  type: z.literal("card.archived"),
  cardId: z.string(),
});

export const ListCreatedEvent = BoardEventEnvelope.extend({
  type: z.literal("list.created"),
  list: ListSchema,
});

export const ListMovedEvent = BoardEventEnvelope.extend({
  type: z.literal("list.moved"),
  listId: z.string(),
  position: z.string(),
});

export const BoardRealtimeEventSchema = z.discriminatedUnion("type", [
  CardCreatedEvent,
  CardUpdatedEvent,
  CardMovedEvent,
  CardArchivedEvent,
  ListCreatedEvent,
  ListMovedEvent,
]);
export type BoardRealtimeEvent = z.infer<typeof BoardRealtimeEventSchema>;
