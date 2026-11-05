import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { CardBoardRef, CardBoardsResponse } from "@app/types";
import { api } from "@/lib/api";
import { boardChips, pickBoards } from "@/lib/card-boards";
import { useAutoSavedIds } from "@/lib/use-auto-saved-ids";
import { t, taskFonts, taskRadii } from "@/theme/task-tokens";
import { TText } from "./task-ui";

const NO_IDS: string[] = [];
export const cardBoardsKey = (cardId: string) => ["cardBoards", cardId] as const;
const optionsKey = (cardId: string) => ["cardBoardOptions", cardId] as const;

/**
 * «في [لوحة ✕] + لوحة» under the title (`Edit Task Prototype.dc.html`;
 * docs/18-multi-board-tasks.md). «+ لوحة» turns into a search field with a
 * list «أضف المهمة إلى لوحة أخرى» under it — each board with the column the
 * task lands in there, which is always the one with its own status. ⏎ adds the
 * first match. ✕ shows where the server would allow the removal (never the
 * last of the user's own boards). Every change saves at once.
 */
export function TaskBoardsRow({
  cardId,
  readOnly,
  statusName,
  onSaved,
  onFailed,
}: {
  cardId: string;
  readOnly: boolean;
  /** The task's status — the column it lands in on any board it is added to. */
  statusName: string;
  onSaved: (boardIds: string[]) => void;
  onFailed: () => void;
}) {
  const queryClient = useQueryClient();
  const boards = useQuery({ queryKey: cardBoardsKey(cardId), queryFn: () => api.cards.boards(cardId) });
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [addedNames, setAddedNames] = useState<ReadonlyMap<string, string>>(new Map());
  const options = useQuery({ queryKey: optionsKey(cardId), queryFn: () => api.cards.boardOptions(cardId), enabled: open });

  const serverIds = useMemo(() => boards.data?.boards.map((b) => b.id) ?? NO_IDS, [boards.data]);
  const selection = useAutoSavedIds(serverIds, async (boardIds) => {
    const before = queryClient.getQueryData<CardBoardsResponse>(cardBoardsKey(cardId))?.boards.map((b) => b.id) ?? [];
    try {
      const result = await api.cards.setBoards(cardId, { boardIds });
      queryClient.setQueryData(cardBoardsKey(cardId), result);
      void queryClient.invalidateQueries({ queryKey: optionsKey(cardId) });
      onSaved([...new Set([...before, ...boardIds])]);
    } catch (error) {
      onFailed();
      throw error;
    }
  });

  if (!boards.data) return <View style={{ height: 30 }} />;
  const canChange = boards.data.canChange && !readOnly;
  const chips = boardChips(boards.data, selection.ids, addedNames);
  const matches = pickBoards(options.data ?? [], selection.ids, term);

  function add(board: CardBoardRef) {
    setAddedNames((names) => new Map(names).set(board.id, board.name));
    selection.change([...selection.ids, board.id]);
    setOpen(false);
    setTerm("");
  }

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <TText size={13} color={t.muted}>
          في
        </TText>
        {chips.map((chip) => (
          <View
            key={chip.id}
            style={{ flexDirection: "row", alignItems: "center", gap: 7, height: 30, paddingStart: 10, paddingEnd: chip.removable ? 4 : 10, borderRadius: taskRadii.chip, borderWidth: 1, borderColor: t.lineStrong, backgroundColor: t.surface }}
          >
            <TText size={13} weight="semibold">
              {chip.name}
            </TText>
            {chip.removable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`إزالة المهمة من ${chip.name}`}
                hitSlop={6}
                onPress={() => selection.change(selection.ids.filter((id) => id !== chip.id))}
                style={{ width: 20, height: 20, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="close" size={12} color={t.muted} />
              </Pressable>
            ) : null}
          </View>
        ))}
        {canChange && !open ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="إضافة المهمة إلى لوحة أخرى"
            onPress={() => setOpen(true)}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 4, height: 30, paddingHorizontal: 10, borderRadius: taskRadii.chip, backgroundColor: pressed ? t.chip : "transparent" })}
          >
            <Ionicons name="add" size={14} color={t.ink3} />
            <TText size={13} weight="semibold" color={t.ink3}>
              لوحة
            </TText>
          </Pressable>
        ) : null}
        {open ? (
          <>
            <TextInput
              autoFocus
              value={term}
              onChangeText={setTerm}
              placeholder="اسم اللوحة…"
              placeholderTextColor={t.faint}
              autoCorrect={false}
              returnKeyType="done"
              submitBehavior="submit"
              onSubmitEditing={() => matches[0] && add(matches[0])}
              style={{ flex: 1, minWidth: 90, height: 30, padding: 0, paddingHorizontal: 4, fontFamily: taskFonts.regular, fontSize: 14, color: t.ink, textAlign: "right", writingDirection: "rtl" }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="إغلاق البحث"
              onPress={() => {
                setOpen(false);
                setTerm("");
              }}
              style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: t.chipStrong, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="close" size={13} color={t.ink} />
            </Pressable>
          </>
        ) : null}
      </View>

      {open ? (
        <View
          style={{
            marginTop: 6,
            backgroundColor: t.surface,
            borderWidth: 1,
            borderColor: t.lineStrong,
            borderRadius: 14,
            padding: 6,
            shadowColor: t.ink,
            shadowOpacity: 0.18,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 12 },
            elevation: 6,
          }}
        >
          <TText size={12} weight="semibold" color={t.muted} style={{ paddingTop: 6, paddingHorizontal: 10, paddingBottom: 4 }}>
            أضف المهمة إلى لوحة أخرى
          </TText>
          {options.isPending ? (
            <TText size={13} color={t.muted} style={{ padding: 12 }}>
              جارٍ التحميل…
            </TText>
          ) : matches.length === 0 ? (
            <TText size={13} color={t.muted} style={{ padding: 12 }}>
              {term.trim() ? "لا توجد لوحة أخرى بهذا الاسم." : "لا توجد لوحة أخرى."}
            </TText>
          ) : (
            matches.map((board) => (
              <Pressable
                key={board.id}
                accessibilityRole="button"
                accessibilityLabel={`إضافة إلى ${board.name}`}
                onPress={() => add(board)}
                style={({ pressed }) => ({ minHeight: 50, justifyContent: "center", paddingHorizontal: 10, borderRadius: 10, backgroundColor: pressed ? t.canvas : "transparent" })}
              >
                <TText size={14} weight="semibold">
                  {board.name}
                </TText>
                <TText size={12} color={t.muted}>
                  {statusName}
                </TText>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
