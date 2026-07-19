import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, List } from "@app/types";
import { api } from "../../lib/api-client";
import { CardPreview } from "./components/CardItem";
import { CardDetailModal } from "./components/CardDetailModal";
import { BoardSettingsModal } from "./components/BoardSettingsModal";
import { ListColumn } from "./components/ListColumn";
import { useAuth } from "../auth/AuthContext";

function resolveTargetListId(
  over: { id: string | number; data: { current?: Record<string, unknown> } },
  findListOfCard: (cardId: string) => List | undefined,
): string | undefined {
  const overData = over.data.current;
  if (!overData) return undefined;
  if (overData.type === "list") return String(over.id);
  if (overData.type === "list-dropzone") return overData.listId as string;
  if (overData.type === "card") return findListOfCard(String(over.id))?.id;
  return undefined;
}

export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: board, isLoading } = useQuery({
    queryKey: ["board", boardId],
    queryFn: () => api.boards.get(boardId!),
    enabled: Boolean(boardId),
  });

  const [lists, setLists] = useState<List[]>([]);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newListName, setNewListName] = useState("");

  useEffect(() => {
    if (board) setLists(board.lists);
  }, [board]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["board", boardId] });

  const createListMutation = useMutation({
    mutationFn: (name: string) => api.lists.create(boardId!, { name }),
    onSuccess: invalidate,
  });
  const moveListMutation = useMutation({
    mutationFn: (vars: { listId: string; beforeId: string | null; afterId: string | null }) =>
      api.lists.update(vars.listId, { move: { beforeId: vars.beforeId, afterId: vars.afterId } }),
    onError: invalidate,
  });
  const moveCardMutation = useMutation({
    mutationFn: (vars: { cardId: string; targetListId: string; beforeId: string | null; afterId: string | null }) =>
      api.cards.update(vars.cardId, {
        targetListId: vars.targetListId,
        move: { beforeId: vars.beforeId, afterId: vars.afterId },
      }),
    onError: invalidate,
  });
  const createCardMutation = useMutation({
    mutationFn: (vars: { listId: string; title: string }) => api.cards.create(vars.listId, { title: vars.title }),
    onSuccess: invalidate,
  });

  function findListOfCard(cardId: string): List | undefined {
    return lists.find((l) => l.cards.some((c) => c.id === cardId));
  }

  function onDragStart(event: DragStartEvent) {
    const { active } = event;
    if (active.data.current?.type === "card") {
      const list = findListOfCard(String(active.id));
      setActiveCard(list?.cards.find((c) => c.id === active.id) ?? null);
    }
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.data.current?.type !== "card") return;

    const activeCardId = String(active.id);
    const sourceList = findListOfCard(activeCardId);
    const targetListId = resolveTargetListId(over, findListOfCard);
    if (!sourceList || !targetListId) return;
    if (sourceList.id === targetListId && String(over.id) === activeCardId) return;

    setLists((prev) => {
      const next = prev.map((l) => ({ ...l, cards: [...l.cards] }));
      const from = next.find((l) => l.id === sourceList.id);
      const to = next.find((l) => l.id === targetListId);
      if (!from || !to) return prev;

      const fromIndex = from.cards.findIndex((c) => c.id === activeCardId);
      if (fromIndex === -1) return prev;
      const [moving] = from.cards.splice(fromIndex, 1);

      let toIndex = to.cards.findIndex((c) => c.id === over.id);
      if (toIndex === -1) toIndex = to.cards.length;
      to.cards.splice(toIndex, 0, moving);
      return next;
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCard(null);
    if (!over) return;

    if (active.data.current?.type === "list") {
      const oldIndex = lists.findIndex((l) => l.id === active.id);
      const newIndex = lists.findIndex((l) => l.id === over.id);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const reordered = arrayMove(lists, oldIndex, newIndex);
      setLists(reordered);
      moveListMutation.mutate({
        listId: String(active.id),
        beforeId: reordered[newIndex - 1]?.id ?? null,
        afterId: reordered[newIndex + 1]?.id ?? null,
      });
      return;
    }

    if (active.data.current?.type === "card") {
      const cardId = String(active.id);
      const targetList = findListOfCard(cardId);
      if (!targetList) return;
      const index = targetList.cards.findIndex((c) => c.id === cardId);
      moveCardMutation.mutate({
        cardId,
        targetListId: targetList.id,
        beforeId: targetList.cards[index - 1]?.id ?? null,
        afterId: targetList.cards[index + 1]?.id ?? null,
      });
    }
  }

  if (isLoading || !board) {
    return <div className="p-8 text-slate-500">Loading board...</div>;
  }

  const openCard = openCardId ? lists.flatMap((l) => l.cards).find((c) => c.id === openCardId) ?? null : null;
  const isOwner = board.members.some((m) => m.userId === user?.id && m.role === "OWNER");

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex items-center gap-4 border-b bg-white px-6 py-4">
        <Link to="/boards" className="text-sm text-slate-500 hover:underline">
          ← Boards
        </Link>
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="text-lg font-semibold text-slate-900">{board.name}</h1>
          {board.description && (
            <p className="truncate text-sm text-slate-500" title={board.description}>
              {board.description}
            </p>
          )}
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          title="Board settings"
        >
          Edit
        </button>
      </header>
      <div className="flex-1 overflow-x-auto p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={lists.map((l) => l.id)} strategy={horizontalListSortingStrategy}>
            <div className="flex gap-4">
              {lists.map((list) => (
                <ListColumn
                  key={list.id}
                  list={list}
                  onAddCard={(title) => createCardMutation.mutate({ listId: list.id, title })}
                  onOpenCard={setOpenCardId}
                />
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newListName.trim()) return;
                  createListMutation.mutate(newListName.trim());
                  setNewListName("");
                }}
                className="h-fit w-64 shrink-0 rounded-lg bg-white/60 p-3"
              >
                <input
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="+ Add list"
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </form>
            </div>
          </SortableContext>
          <DragOverlay>{activeCard ? <CardPreview card={activeCard} /> : null}</DragOverlay>
        </DndContext>
      </div>
      {openCard && (
        <CardDetailModal
          card={openCard}
          onClose={() => setOpenCardId(null)}
          onSave={async (updates) => {
            await api.cards.update(openCard.id, updates);
            invalidate();
          }}
          onDelete={async () => {
            await api.cards.remove(openCard.id);
            invalidate();
          }}
        />
      )}
      {settingsOpen && (
        <BoardSettingsModal
          board={board}
          canArchive={isOwner}
          onClose={() => setSettingsOpen(false)}
          onSave={async (updates) => {
            await api.boards.update(board.id, updates);
            invalidate();
            queryClient.invalidateQueries({ queryKey: ["boards"] });
          }}
          onArchive={async () => {
            await api.boards.update(board.id, { isArchived: true });
            queryClient.invalidateQueries({ queryKey: ["boards"] });
            navigate("/boards");
          }}
        />
      )}
    </div>
  );
}
