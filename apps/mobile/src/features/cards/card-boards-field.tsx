import { useEffect, useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CardBoardsResponse } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { api } from "@/lib/api";
import { boardRows, type BoardRow } from "@/lib/card-boards";
import { useAutoSavedIds } from "@/lib/use-auto-saved-ids";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/** Above this many boards, the list needs a search box in front of it — as in `BoardFilterSheet`. */
const SEARCH_THRESHOLD = 6;

const NO_IDS: string[] = [];

const LOCK_REASON: Record<NonNullable<BoardRow["lock"]>, string> = {
  notMember: "لست عضوًا فيها",
  archived: "لوحة مؤرشفة",
  lastOfMine: "تبقى المهمة في لوحة واحدة لك على الأقل",
};

export const cardBoardsKey = (cardId: string) => ["cardBoards", cardId] as const;

/**
 * «اللوحات» on the task screen (docs/18-multi-board-tasks.md): every board the
 * task is on, and — for its owner or an admin — «تغيير ▾», a checklist of
 * boards that saves on every tick like the people fields do. One task, one
 * status: on a board it is added to it shows in the column with the same
 * status. `onSaved` gets every board touched, before and after, so the caller
 * can refresh them.
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

  const serverIds = useMemo(() => boards.data?.boards.map((b) => b.id) ?? NO_IDS, [boards.data]);
  const selection = useAutoSavedIds(serverIds, async (boardIds) => {
    const before = queryClient.getQueryData<CardBoardsResponse>(cardBoardsKey(cardId))?.boards.map((b) => b.id) ?? [];
    const result = await api.cards.setBoards(cardId, { boardIds });
    queryClient.setQueryData(cardBoardsKey(cardId), result);
    onSaved([...new Set([...before, ...boardIds])]);
  });

  if (!boards.data) return null;
  const canChange = boards.data.canChange && !readOnly;
  // Shown as saved, or as just ticked while the save is on its way.
  const names = new Map([...boards.data.boards, ...boards.data.options].map((b) => [b.id, b.name]));
  const shown = selection.ids.filter((id) => names.has(id));

  return (
    <View style={{ gap: spacing.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`لوحات المهمة: ${shown.map((id) => names.get(id)).join("، ")}${canChange ? " — تغيير" : ""}`}
        disabled={!canChange}
        onPress={() => setPicking(true)}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <AppText size="caption" weight="semibold" color={colors.muted}>
          اللوحات
        </AppText>
        {canChange ? (
          <AppText size="small" weight="semibold" color={colors.accent}>
            تغيير ▾
          </AppText>
        ) : null}
      </Pressable>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {shown.map((id) => (
          <View
            key={id}
            style={{
              backgroundColor: colors.canvas,
              borderRadius: radii.chip,
              paddingHorizontal: spacing.md,
              paddingVertical: 6,
            }}
          >
            <AppText size="small" weight="semibold">
              {names.get(id)}
            </AppText>
          </View>
        ))}
      </View>
      {selection.saving ? (
        <AppText size="caption" color={colors.muted}>
          جارٍ الحفظ…
        </AppText>
      ) : selection.failed ? (
        <AppText size="caption" color={colors.alert} accessibilityRole="alert">
          تعذّر الحفظ، فأُعيدت اللوحات إلى آخر حالة محفوظة.
        </AppText>
      ) : null}

      <CardBoardsSheet
        visible={picking}
        onClose={() => setPicking(false)}
        data={boards.data}
        selectedIds={selection.ids}
        onChange={selection.change}
      />
    </View>
  );
}

/**
 * The checklist itself: the task's boards first, then the ones it could join.
 * A board that can't be unticked stays ticked with the reason under its name.
 */
function CardBoardsSheet({
  visible,
  onClose,
  data,
  selectedIds,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  data: CardBoardsResponse;
  selectedIds: string[];
  onChange: (boardIds: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (!visible) setSearch("");
  }, [visible]);

  const rows = boardRows(data, selectedIds);
  const term = search.trim().toLowerCase();
  // Ticked boards always stay on screen, so a search never hides where the task is.
  const visibleRows = term ? rows.filter((r) => r.checked || r.name.toLowerCase().includes(term)) : rows;

  function toggle(row: BoardRow) {
    if (row.lock) return;
    onChange(row.checked ? selectedIds.filter((id) => id !== row.id) : [...selectedIds, row.id]);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: spacing.xs }}>
        <AppText weight="bold" size="title">
          لوحات المهمة
        </AppText>
        <AppText size="small" color={colors.muted} style={{ marginBottom: spacing.sm }}>
          تظهر المهمة في كل لوحة تختارها بالحالة نفسها، ونقلها في إحداها ينقلها في الجميع.
        </AppText>

        {rows.length > SEARCH_THRESHOLD ? (
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="ابحث عن لوحة"
            placeholderTextColor={colors.muted}
            accessibilityLabel="ابحث عن لوحة"
            style={{
              minHeight: MIN_TOUCH_TARGET,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radii.field,
              paddingHorizontal: spacing.lg,
              marginBottom: spacing.xs,
              fontFamily: fonts.regular,
              fontSize: fontSizes.body,
              color: colors.ink,
              textAlign: "right",
              writingDirection: "rtl",
            }}
          />
        ) : null}

        {visibleRows.map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: row.checked, disabled: !!row.lock }}
            accessibilityHint={row.lock ? LOCK_REASON[row.lock] : undefined}
            onPress={() => toggle(row)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              minHeight: MIN_TOUCH_TARGET + 4,
              paddingHorizontal: spacing.lg,
              borderRadius: radii.field,
              backgroundColor: row.checked ? colors.accentSoft : "transparent",
            }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                backgroundColor: row.checked ? (row.lock ? colors.muted : colors.accent) : "transparent",
                borderWidth: row.checked ? 0 : 1.5,
                borderColor: colors.line,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {row.checked ? <Ionicons name="checkmark" size={15} color={colors.surface} /> : null}
            </View>
            <View style={{ flex: 1, paddingVertical: spacing.xs }}>
              <AppText weight={row.checked ? "bold" : "regular"} numberOfLines={1}>
                {row.name}
              </AppText>
              {row.lock && row.checked ? (
                <AppText size="caption" color={colors.muted}>
                  {LOCK_REASON[row.lock]}
                </AppText>
              ) : null}
            </View>
          </Pressable>
        ))}
        {term && visibleRows.length === rows.filter((r) => r.checked).length ? (
          <AppText size="small" color={colors.muted}>
            لا توجد لوحة أخرى تطابق «{search.trim()}».
          </AppText>
        ) : null}
        {data.options.length === 0 ? (
          <AppText size="caption" color={colors.muted} style={{ marginTop: spacing.sm }}>
            لا توجد لوحات أخرى يمكنك إضافة المهمة إليها.
          </AppText>
        ) : null}
      </View>
    </BottomSheet>
  );
}
