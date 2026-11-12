import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { SearchBoardHit, SearchCardHit, SearchResponse, SearchSubtaskHit } from "@app/types";
import { HighlightedText } from "@/components/highlighted-text";
import { Skeleton } from "@/components/skeleton";
import { AppText } from "@/components/text";
import { avatarColorFor } from "@/lib/avatar";
import { formatDueDate, isOverdue } from "@/lib/date";
import { RESULTS, countLabel } from "@/lib/plural";
import { MIN_TOUCH_TARGET, colors, radii, spacing, statusColors } from "@/theme/tokens";

/**
 * What the boards screen's «ابحث: لوحات، مهام، مهام فرعية» found, in three groups — boards,
 * tasks, subtasks — each hit with the typed text marked. The design draws the
 * box and the in-board results (§3b-2) but no screen for this search, so the
 * rows reuse the in-board result card and the boards list's row.
 */
export function SearchResults({
  data,
  onOpenBoard,
  onOpenCard,
}: {
  data: SearchResponse;
  onOpenBoard: (boardId: string) => void;
  onOpenCard: (cardId: string, boardId: string) => void;
}) {
  const total = data.boards.length + data.cards.length + data.subtasks.length;
  return (
    <View style={{ gap: 18 }}>
      <AppText size="small" color={colors.muted} style={{ paddingHorizontal: spacing.xs }}>
        {data.truncated
          ? `${countLabel(total, RESULTS)}، وهناك غيرها. اكتب كلمة أدق لتضييق البحث.`
          : countLabel(total, RESULTS)}
      </AppText>

      {data.boards.length > 0 ? (
        <Group icon="grid-outline" title="اللوحات" count={data.boards.length}>
          {data.boards.map((board) => (
            <BoardHit key={board.id} board={board} query={data.query} onPress={() => onOpenBoard(board.id)} />
          ))}
        </Group>
      ) : null}

      {data.cards.length > 0 ? (
        <Group icon="document-text-outline" title="المهام" count={data.cards.length}>
          {data.cards.map((card) => (
            <CardHit key={card.id} card={card} query={data.query} onPress={() => onOpenCard(card.id, card.boardId)} />
          ))}
        </Group>
      ) : null}

      {data.subtasks.length > 0 ? (
        <Group icon="checkbox-outline" title="المهام الفرعية" count={data.subtasks.length}>
          {data.subtasks.map((subtask) => (
            <SubtaskHit
              key={subtask.id}
              subtask={subtask}
              query={data.query}
              onPress={() => onOpenCard(subtask.cardId, subtask.boardId)}
            />
          ))}
        </Group>
      ) : null}
    </View>
  );
}

function Group({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 10 }}>
      <View accessibilityRole="header" style={{ flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: spacing.xs }}>
        <Ionicons name={icon} size={14} color={colors.muted} />
        <AppText size="small" weight="bold" color={colors.muted}>
          {title} · {count}
        </AppText>
      </View>
      {children}
    </View>
  );
}

/** The boards list's row (`BoardRow`) with the match marked, and the description excerpt when that is what matched. */
function BoardHit({ board, query, onPress }: { board: SearchBoardHit; query: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={board.descriptionSnippet ? `لوحة ${board.name}، ${board.descriptionSnippet}` : `لوحة ${board.name}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radii.card,
        paddingVertical: 14,
        paddingHorizontal: spacing.lg,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: avatarColorFor(board.id).fg }} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="bold" numberOfLines={1}>
          <HighlightedText text={board.name} query={query} />
        </AppText>
        {board.descriptionSnippet ? (
          <AppText size="caption" color={colors.muted} numberOfLines={2}>
            <HighlightedText text={board.descriptionSnippet} query={query} size="caption" />
          </AppText>
        ) : null}
      </View>
      <Ionicons name="chevron-back" size={16} color={colors.muted} />
    </Pressable>
  );
}

/** The in-board result card (§3b-2) plus where the task lives, since these come from every board. */
function CardHit({ card, query, onPress }: { card: SearchCardHit; query: string; onPress: () => void }) {
  const finished = card.statusCategory === "DONE" || card.statusCategory === "CLOSED";
  const overdue = !!card.dueDate && !finished && isOverdue(card.dueDate);
  const urgent = card.priority === "URGENT";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`مهمة ${card.title}، ${card.listName} في ${card.boardName}`}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        // The right-edge urgent stripe, as on the board (`CardItem`): RN mirrors
        // borderLeft* under forceRTL, so this lands on the physical right.
        borderLeftWidth: urgent ? 3 : 1,
        borderLeftColor: urgent ? colors.urgent : colors.line,
        borderRadius: radii.card,
        padding: spacing.lg,
        gap: spacing.sm,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <AppText color={finished ? colors.slate : colors.ink} style={{ fontSize: 16, lineHeight: 25 }}>
        <HighlightedText text={card.title} query={query} style={{ fontSize: 16, lineHeight: 25 }} />
      </AppText>
      {card.descriptionSnippet ? (
        <AppText size="small" color={colors.muted} numberOfLines={2}>
          <HighlightedText text={card.descriptionSnippet} query={query} size="small" />
        </AppText>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: spacing.md, rowGap: spacing.xs }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              backgroundColor: statusColors[card.statusCategory ?? "UNCATEGORIZED"],
            }}
          />
          <AppText size="small" color={colors.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
            {card.listName} · {card.boardName}
          </AppText>
        </View>
        {card.dueDate ? (
          <AppText size="small" color={overdue ? colors.alert : colors.muted}>
            ◷ {formatDueDate(card.dueDate)}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

/** A subtask with its tick state and the task it belongs to — opening it opens that task. */
function SubtaskHit({ subtask, query, onPress }: { subtask: SearchSubtaskHit; query: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`مهمة فرعية ${subtask.title}${subtask.isDone ? "، منجزة" : ""}، ضمن ${subtask.cardTitle}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radii.card,
        padding: spacing.lg,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View
        style={{
          width: 22,
          height: 22,
          marginTop: 2,
          borderRadius: 7,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: subtask.isDone ? colors.done : colors.surface,
          borderWidth: subtask.isDone ? 0 : 1.5,
          borderColor: colors.lineStrong,
        }}
      >
        {subtask.isDone ? <Ionicons name="checkmark" size={15} color={colors.surface} /> : null}
      </View>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <AppText
          color={subtask.isDone ? colors.muted : colors.ink}
          style={{ textDecorationLine: subtask.isDone ? "line-through" : "none" }}
        >
          <HighlightedText text={subtask.title} query={query} />
        </AppText>
        <AppText size="small" color={colors.faint} numberOfLines={1}>
          ضمن: {subtask.cardTitle} · {subtask.boardName}
        </AppText>
      </View>
    </Pressable>
  );
}

/** «لا نتائج لـ «…»» — the design's empty search (§3b-2), with a way out of it. */
export function SearchEmpty({
  query,
  onClear,
  onClearFilters,
}: {
  query: string;
  onClear: () => void;
  /** Only where filters exist (inside a board) and some are on. */
  onClearFilters?: () => void;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radii.card,
        paddingVertical: 30,
        paddingHorizontal: spacing.xxl,
        alignItems: "center",
        gap: spacing.md,
      }}
    >
      <View
        style={{
          width: 54,
          height: 54,
          borderRadius: radii.card,
          backgroundColor: colors.canvas,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="search" size={22} color={colors.dashedStrong} />
      </View>
      <AppText size="title" weight="bold" style={{ textAlign: "center" }}>
        لا نتائج لـ «{query}»
      </AppText>
      <AppText size="small" color={colors.muted} style={{ textAlign: "center" }}>
        {onClearFilters ? "جرّب كلمة أقصر، أو أزل المرشّحات." : "جرّب كلمة أقصر."}
      </AppText>
      <View style={{ flexDirection: "row", gap: spacing.sm, alignSelf: "stretch", marginTop: spacing.xs }}>
        <EmptyAction label="مسح البحث" primary onPress={onClear} />
        {onClearFilters ? <EmptyAction label="إزالة المرشّحات" onPress={onClearFilters} /> : null}
      </View>
    </View>
  );
}

function EmptyAction({ label, primary = false, onPress }: { label: string; primary?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: MIN_TOUCH_TARGET + 4,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radii.field,
        backgroundColor: primary ? colors.ink : colors.surface,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.line,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <AppText weight="semibold" color={primary ? colors.surface : colors.ink}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** «تحميل النتائج» — two result-shaped placeholders. */
export function SearchSkeleton() {
  return (
    <View style={{ gap: spacing.md }}>
      {[
        ["74%", "38%"],
        ["56%", "30%"],
      ].map(([title, meta]) => (
        <View
          key={title}
          style={{
            backgroundColor: colors.toolbar,
            borderWidth: 1,
            borderColor: colors.hairline,
            borderRadius: radii.card,
            padding: spacing.lg,
            gap: 10,
          }}
        >
          <Skeleton width={title as `${number}%`} height={13} />
          <Skeleton width={meta as `${number}%`} height={10} />
        </View>
      ))}
    </View>
  );
}
