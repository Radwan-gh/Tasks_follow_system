import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import type { Card, List } from "@app/types";
import { api } from "../../lib/api-client";
import { useAuth } from "../auth/AuthContext";
import { CardPreview } from "./components/CardItem";
import { CardDetailPanel } from "./components/CardDetailPanel";
import { BoardSettingsModal } from "./components/BoardSettingsModal";
import { BoardMembersModal } from "./components/BoardMembersModal";
import { BoardOwnerSummaryPanel } from "./components/BoardOwnerSummaryPanel";
import { CreateCardModal } from "./components/CreateCardModal";
import { FilterPopover } from "./components/FilterPopover";
import { FilteredBoardView } from "./components/FilteredBoardView";
import { ListColumn } from "./components/ListColumn";
import { UserAvatar } from "./components/MemberPicker";
import { EMPTY_FILTERS, hasActiveFilters, type CardFilters } from "./lib/filter-cards";

/** The closed column's default window (`v2-new-style.md` §4) — a client-chosen default, not server-enforced. */
function thirtyDaysAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString();
}

function resolveTargetListId(
  over: { id: string | number; data: { current?: Record<string, unknown> } },
  findListOfCard: (cardId: string) => List | undefined,
): string | undefined {
  const overData = over.data.current;
  if (!overData) return undefined;
  if (overData.type === "list-dropzone") return overData.listId as string;
  if (overData.type === "card") return findListOfCard(String(over.id))?.id;
  return undefined;
}

export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showAllClosed, setShowAllClosed] = useState(false);
  // Computed once per mount, not per render — otherwise the query key below
  // would change on every render and defeat React Query's caching.
  const closedSinceDefault = useMemo(() => thirtyDaysAgoIso(), []);
  const closedSince = showAllClosed ? undefined : closedSinceDefault;
  const { data: board, isLoading } = useQuery({
    queryKey: ["board", boardId, closedSince],
    queryFn: () => api.boards.get(boardId!, closedSince),
    enabled: Boolean(boardId),
  });

  const [lists, setLists] = useState<List[]>([]);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [creatingCardOpen, setCreatingCardOpen] = useState(false);
  const [filters, setFilters] = useState<CardFilters>(EMPTY_FILTERS);

  useEffect(() => {
    if (board) setLists(board.lists);
  }, [board]);

  // Deep-link from My Tasks (`/boards/:id?card=:cardId`) — seed the open card
  // once the board has loaded, then drop the param so it doesn't re-open on
  // a later reload of the same URL after the card was closed.
  useEffect(() => {
    const cardId = searchParams.get("card");
    if (cardId && board?.lists.some((l) => l.cards.some((c) => c.id === cardId))) {
      setOpenCardId(cardId);
      const next = new URLSearchParams(searchParams);
      next.delete("card");
      setSearchParams(next, { replace: true });
    }
  }, [board, searchParams, setSearchParams]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["board", boardId] });

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
  const deleteCardMutation = useMutation({
    mutationFn: (cardId: string) => api.cards.remove(cardId),
    onSuccess: (_data, cardId) => {
      setOpenCardId((open) => (open === cardId ? null : open));
      invalidate();
    },
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
    return <div className="p-8 text-slate-500">جارٍ تحميل اللوحة...</div>;
  }

  const openCard = openCardId ? lists.flatMap((l) => l.cards).find((c) => c.id === openCardId) ?? null : null;
  const currentMembership = board.members.find((m) => m.userId === user?.id);
  const isOwner = currentMembership?.role === "OWNER";
  const isViewer = currentMembership?.role === "VIEWER";
  const readOnly = board.isArchived || isViewer;
  const previewMembers = board.members.slice(0, 3);
  const filtersActive = hasActiveFilters(filters);

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <header className="flex items-end justify-between gap-4 border-b border-line bg-surface px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link to="/boards" className="text-sm text-muted hover:text-ink">
              → اللوحات
            </Link>
            <h1 className="truncate text-lg font-bold text-ink">{board.name}</h1>
          </div>
          <div className="mt-1 flex items-center gap-2">
            {board.dueDate && (
              <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-ink/70">
                ◷ التسليم {new Date(board.dueDate).toLocaleDateString("ar", { dateStyle: "medium" })}
              </span>
            )}
            <span className="text-xs text-muted">
              {board.cardCount} مهمة · {board.doneCount} مكتملة
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <input
            type="search"
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            placeholder="⌕ بحث في اللوحة"
            className="hidden w-[220px] rounded-field border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none sm:block"
          />
          <FilterPopover filters={filters} onChange={setFilters} boardMembers={board.members} />
          {previewMembers.length > 0 && (
            <div className="flex items-center">
              {previewMembers.map((m, i) => (
                <span key={m.userId} className={i > 0 ? "-ms-2" : ""}>
                  <span className="block rounded-full ring-2 ring-surface">
                    <UserAvatar displayName={m.user.displayName} dimmed={!m.user.isActive} />
                  </span>
                </span>
              ))}
            </div>
          )}
          {isOwner && (
            <>
              <button
                onClick={() => setMembersOpen(true)}
                className="min-h-[38px] rounded-field border border-line px-3 text-sm font-semibold text-ink hover:bg-canvas"
              >
                الأعضاء
              </button>
              <button
                onClick={() => setSummaryOpen(true)}
                className="min-h-[38px] rounded-field border border-line px-3 text-sm font-semibold text-ink hover:bg-canvas"
              >
                ملخّص
              </button>
            </>
          )}
          {!readOnly && lists.length > 0 && (
            <button
              onClick={() => setCreatingCardOpen(true)}
              className="min-h-[38px] rounded-field bg-accent px-4 text-sm font-medium text-white hover:opacity-90"
            >
              + مهمة
            </button>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            className="min-h-[38px] rounded-field border border-line px-3 text-sm font-semibold text-ink hover:bg-canvas"
            title="إعدادات اللوحة"
          >
            الإعدادات
          </button>
        </div>
      </header>

      {(board.isArchived || isViewer) && (
        <div className="flex items-center justify-between gap-4 bg-ink px-6 py-2 text-sm text-white">
          <span>{board.isArchived ? "مؤرشفة — للقراءة فقط" : "للعرض فقط — لا يمكنك التعديل على هذه اللوحة"}</span>
          {board.isArchived && isOwner && (
            <button
              onClick={async () => {
                await api.boards.update(board.id, { isArchived: false });
                invalidate();
                queryClient.invalidateQueries({ queryKey: ["boards"] });
              }}
              className="rounded-field bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20"
            >
              استعادة
            </button>
          )}
        </div>
      )}

      {filtersActive ? (
        <div className="flex-1 overflow-y-auto">
          <FilteredBoardView
            lists={lists}
            boardMembers={board.members}
            currentUserId={user?.id ?? ""}
            filters={filters}
            onOpenCard={setOpenCardId}
          />
        </div>
      ) : (
      <div className="flex-1 overflow-x-auto p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <div className="flex items-start gap-4">
            {lists.map((list) => (
              <ListColumn
                key={list.id}
                list={list}
                boardMembers={board.members}
                readOnly={readOnly}
                onShowOlderClosed={
                  !showAllClosed && board.hiddenClosedCount > 0 ? () => setShowAllClosed(true) : undefined
                }
                onOpenCard={setOpenCardId}
                onDeleteCard={(id) => deleteCardMutation.mutate(id)}
              />
            ))}
          </div>
          <DragOverlay>{activeCard ? <CardPreview card={activeCard} /> : null}</DragOverlay>
        </DndContext>
      </div>
      )}
      {openCard && (
        <CardDetailPanel
          card={openCard}
          boardMembers={board.members}
          boardOwnerId={board.ownerId}
          currentUserId={user?.id ?? ""}
          readOnly={readOnly}
          onClose={() => setOpenCardId(null)}
          onSave={async (updates) => {
            await api.cards.update(openCard.id, updates);
            invalidate();
          }}
          onSaveAccess={async (updates) => {
            await api.cards.updateAccess(openCard.id, updates);
            invalidate();
          }}
          onSaveAssignees={async (updates) => {
            await api.cards.updateAssignees(openCard.id, updates);
            invalidate();
          }}
        />
      )}
      {creatingCardOpen && (
        <CreateCardModal
          lists={lists}
          defaultListId={lists[0]?.id ?? ""}
          creating={createCardMutation.isPending}
          onClose={() => setCreatingCardOpen(false)}
          onCreate={(listId, title) => {
            createCardMutation.mutate(
              { listId, title },
              { onSuccess: () => setCreatingCardOpen(false) },
            );
          }}
        />
      )}
      {summaryOpen && <BoardOwnerSummaryPanel boardId={board.id} onClose={() => setSummaryOpen(false)} />}
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
      {membersOpen && (
        <BoardMembersModal boardId={board.id} members={board.members} onClose={() => setMembersOpen(false)} />
      )}
    </div>
  );
}
