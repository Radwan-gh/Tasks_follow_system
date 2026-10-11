import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CardBoardRef, CardBoardsResponse } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { api } from "@/lib/api";
import { avatarColorFor } from "@/lib/avatar";
import { boardChips, boardInitial, pickBoards, type BoardChip } from "@/lib/card-boards";
import { useAutoSavedIds } from "@/lib/use-auto-saved-ids";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

const NO_IDS: string[] = [];

export const cardBoardsKey = (cardId: string) => ["cardBoards", cardId] as const;
const boardOptionsKey = (cardId: string) => ["cardBoardOptions", cardId] as const;

/**
 * «اللوحات» on the task screen (docs/18-multi-board-tasks.md), built like the
 * assignees field: the task's boards as boxes in one bordered box, ✕ on each
 * the user may take off, and «+ إضافة لوحة» — for the task's owner or an admin
 * — opening a popup with their three latest-used boards and a search for the
 * rest. Every add and remove saves at once (`useAutoSavedIds`). One task, one
 * status: on a board it is added to it shows in the column with the same
 * status. `onSaved` gets every board touched, before and after, to refresh.
 */
export function CardBoardsField({
  cardId,
  readOnly,
  onSaved,
}: {
  cardId: string;
  readOnly: boolean;
  onSaved: (boardIds: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const boards = useQuery({ queryKey: cardBoardsKey(cardId), queryFn: () => api.cards.boards(cardId) });
  const [picking, setPicking] = useState(false);
  // Names of boards added from the popup, until the server's own list has them.
  const [addedNames, setAddedNames] = useState<ReadonlyMap<string, string>>(new Map());

  const serverIds = useMemo(() => boards.data?.boards.map((b) => b.id) ?? NO_IDS, [boards.data]);
  const selection = useAutoSavedIds(serverIds, async (boardIds) => {
    const before = queryClient.getQueryData<CardBoardsResponse>(cardBoardsKey(cardId))?.boards.map((b) => b.id) ?? [];
    const result = await api.cards.setBoards(cardId, { boardIds });
    queryClient.setQueryData(cardBoardsKey(cardId), result);
    // A removed board is on offer again, and "latest used" may have moved.
    void queryClient.invalidateQueries({ queryKey: boardOptionsKey(cardId) });
    onSaved([...new Set([...before, ...boardIds])]);
  });

  if (!boards.data) return null;
  const canChange = boards.data.canChange && !readOnly;
  const chips = boardChips(boards.data, selection.ids, addedNames);

  function add(board: CardBoardRef) {
    setAddedNames((names) => new Map(names).set(board.id, board.name));
    selection.change([...selection.ids, board.id]);
    setPicking(false);
  }

  const status = selection.saving ? (
    <AppText size="caption" color={colors.muted}>
      جارٍ الحفظ…
    </AppText>
  ) : selection.failed ? (
    <AppText size="caption" color={colors.alert} accessibilityRole="alert">
      تعذّر الحفظ
    </AppText>
  ) : null;

  const boxes = chips.map((chip) => (
    <BoardBox
      key={chip.id}
      chip={chip}
      onRemove={canChange && chip.removable ? () => selection.change(selection.ids.filter((id) => id !== chip.id)) : undefined}
    />
  ));

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
        <AppText size="caption" weight="semibold" color={colors.muted}>
          اللوحات
        </AppText>
        {status}
      </View>
      {canChange ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: spacing.xs,
            minHeight: MIN_TOUCH_TARGET + 4,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radii.field,
            backgroundColor: colors.surface,
            paddingHorizontal: spacing.sm,
            paddingVertical: 5,
          }}
        >
          {boxes}
          <Pressable
            accessibilityRole="button"
            onPress={() => setPicking(true)}
            hitSlop={6}
            style={{ minHeight: 34, justifyContent: "center", paddingHorizontal: spacing.sm }}
          >
            <AppText size="small" weight="semibold" color={colors.accent}>
              + إضافة لوحة
            </AppText>
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>{boxes}</View>
      )}

      <AddBoardSheet
        cardId={cardId}
        visible={picking}
        onClose={() => setPicking(false)}
        excludeIds={selection.ids}
        onPick={add}
      />
    </View>
  );
}

/** A board's badge: a rounded square, so boards never read as people's round avatars. */
function BoardBadge({ id, name, size }: { id: string; name: string; size: number }) {
  const palette = avatarColorFor(id);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: palette.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AppText weight="bold" color={palette.fg} style={{ fontSize: size > 30 ? 13 : 11 }}>
        {boardInitial(name)}
      </AppText>
    </View>
  );
}

/** A board on the task — the same box as a picked person. With `onRemove` the whole box is the ✕ button. */
function BoardBox({ chip, onRemove }: { chip: BoardChip; onRemove?: () => void }) {
  const style = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.xs,
    borderRadius: radii.chip,
    backgroundColor: colors.canvas,
    paddingVertical: 3,
    paddingStart: 3,
    paddingEnd: spacing.md,
  };
  const content = (
    <>
      <BoardBadge id={chip.id} name={chip.name} size={24} />
      <AppText size="small">{chip.name}</AppText>
      {onRemove ? (
        <AppText size="caption" color={colors.muted}>
          ✕
        </AppText>
      ) : null}
    </>
  );
  if (!onRemove) return <View style={style}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`إزالة المهمة من ${chip.name}`}
      onPress={onRemove}
      hitSlop={4}
      style={style}
    >
      {content}
    </Pressable>
  );
}

/**
 * «إضافة إلى لوحة»: the user's three latest-used boards straight away, and a
 * search over every board they could add the task to. A tap — or the return
 * key, for the first row — adds it and closes the popup. The boards are read
 * only when it opens.
 */
function AddBoardSheet({
  cardId,
  visible,
  onClose,
  excludeIds,
  onPick,
}: {
  cardId: string;
  visible: boolean;
  onClose: () => void;
  excludeIds: string[];
  onPick: (board: CardBoardRef) => void;
}) {
  const options = useQuery({
    queryKey: boardOptionsKey(cardId),
    queryFn: () => api.cards.boardOptions(cardId),
    enabled: visible,
  });
  const [search, setSearch] = useState("");
  const inputRef = useRef<TextInput>(null);
  useEffect(() => {
    if (!visible) setSearch("");
  }, [visible]);

  const term = search.trim();
  const shown = pickBoards(options.data ?? [], excludeIds, term);
  const nothingToAdd = !!options.data && pickBoards(options.data, excludeIds, "").length === 0;

  let body;
  if (options.isPending) {
    body = <Note>جارٍ التحميل…</Note>;
  } else if (options.isError) {
    body = <Note color={colors.alert}>تعذّر تحميل اللوحات.</Note>;
  } else if (nothingToAdd) {
    body = <Note>لا توجد لوحات أخرى يمكنك إضافة المهمة إليها.</Note>;
  } else if (shown.length === 0) {
    body = <Note>لا توجد لوحة تطابق «{term}».</Note>;
  } else {
    body = (
      <View style={{ gap: 2 }}>
        {term ? null : (
          <AppText size="caption" weight="semibold" color={colors.muted} style={{ paddingHorizontal: spacing.xs }}>
            آخر اللوحات المستخدمة
          </AppText>
        )}
        {shown.map((board, index) => (
          <Pressable
            key={board.id}
            accessibilityRole="button"
            accessibilityLabel={`إضافة المهمة إلى ${board.name}`}
            onPress={() => onPick(board)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              minHeight: MIN_TOUCH_TARGET + 4,
              borderRadius: radii.field - 4,
              paddingHorizontal: spacing.sm,
              // The first row is what the keyboard's return key adds.
              backgroundColor: pressed || (term && index === 0) ? colors.accentSoft : "transparent",
            })}
          >
            <BoardBadge id={board.id} name={board.name} size={34} />
            <View style={{ flex: 1 }}>
              <Matched text={board.name} term={term} />
            </View>
            <AppText size="caption" weight="semibold" color={term && index === 0 ? colors.accent : colors.muted}>
              إضافة +
            </AppText>
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: spacing.md }}>
        <AppText weight="bold" size="title">
          إضافة إلى لوحة
        </AppText>
        <TextInput
          ref={inputRef}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => shown[0] && onPick(shown[0])}
          returnKeyType="done"
          autoCorrect={false}
          placeholder="ابحث عن لوحة"
          placeholderTextColor={colors.muted}
          accessibilityLabel="ابحث عن لوحة"
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radii.field,
            backgroundColor: colors.canvas,
            paddingHorizontal: spacing.lg,
            fontFamily: fonts.regular,
            fontSize: fontSizes.body,
            color: colors.ink,
            textAlign: "right",
            writingDirection: "rtl",
          }}
        />
        {body}
      </View>
    </BottomSheet>
  );
}

function Note({ children, color = colors.muted }: { children: ReactNode; color?: string }) {
  return (
    <AppText size="small" color={color} style={{ paddingHorizontal: spacing.xs }}>
      {children}
    </AppText>
  );
}

/** `text` with the typed part emphasised — shows *why* a board matched, as the people search does. */
function Matched({ text, term }: { text: string; term: string }) {
  const at = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (at < 0) return <AppText>{text}</AppText>;
  return (
    <AppText>
      {text.slice(0, at)}
      <AppText weight="bold" color={colors.accent}>
        {text.slice(at, at + term.length)}
      </AppText>
      {text.slice(at + term.length)}
    </AppText>
  );
}
