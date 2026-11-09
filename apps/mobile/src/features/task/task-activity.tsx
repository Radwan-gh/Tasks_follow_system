import { useEffect, useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import Ionicons from "@expo/vector-icons/Ionicons";
import { describeCardActivity, type BoardMember, type CardActivity, type Comment } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { RichTextView } from "@/components/rich-text-view";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/lib/api";
import { topMatches } from "@/lib/match-users";
import { activeMention, replaceRange, type Selection } from "@/lib/rich-text";
import { countLabel, type ArabicNoun } from "@/lib/plural";
import { relativeTime } from "@/lib/task-format";
import { t, taskFonts } from "@/theme/task-tokens";
import { fs } from "@/theme/tokens";
import { SheetTitle, TAvatar, TText, type TIcon } from "./task-ui";

export const historyKey = (cardId: string) => ["cardHistory", cardId] as const;
export const commentsKey = (cardId: string) => ["cardComments", cardId] as const;

const CHANGES: ArabicNoun = { zero: "لا تغييرات", one: "تغيير واحد", two: "تغييران", few: "تغييرات", many: "تغييرًا" };

/** How many entries the activity shows at first, and adds each time the bottom is reached. */
export const ACTIVITY_PAGE = 5;

type Entry =
  | { kind: "comment"; id: string; createdAt: string; comment: Comment }
  | { kind: "log"; id: string; createdAt: string; activity: CardActivity };

/**
 * «النشاط» (`Edit Task Prototype.dc.html`): the comment count, then comments
 * and changes in one list, newest first — a comment is a bubble under its
 * writer, a change one small grey line. It shows five entries and five more
 * each time the screen is scrolled to the bottom (`shown`), ending with
 * «بداية سجل المهمة». Long-pressing a comment copies it, or deletes your own.
 *
 * Collapsed by default (the user's call, not the prototype's): just «النشاط»
 * with its counts and a chevron; tapping the header opens it, and posting a
 * comment opens it so the new comment shows.
 */
export function TaskActivity({
  cardId,
  members,
  shown,
  open,
  onToggle,
}: {
  cardId: string;
  members: BoardMember[];
  shown: number;
  open: boolean;
  onToggle: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const history = useQuery({ queryKey: historyKey(cardId), queryFn: () => api.cards.history(cardId) });
  const comments = useQuery({ queryKey: commentsKey(cardId), queryFn: () => api.comments.list(cardId) });
  const [menuFor, setMenuFor] = useState<Comment | null>(null);

  const remove = useMutation({
    mutationFn: (commentId: string) => api.comments.remove(cardId, commentId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: commentsKey(cardId) }),
  });

  const mentionNames = useMemo(() => members.flatMap((m) => [m.user.displayName, m.user.firstName]).filter(Boolean), [members]);
  const entries = useMemo<Entry[]>(
    () =>
      [
        ...(history.data ?? []).map((activity): Entry => ({ kind: "log", id: `a:${activity.id}`, createdAt: activity.createdAt, activity })),
        ...(comments.data ?? []).map((comment): Entry => ({ kind: "comment", id: `c:${comment.id}`, createdAt: comment.createdAt, comment })),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [history.data, comments.data],
  );
  const now = new Date();
  const nameOf = (id: string, displayName: string) => (id === user?.id ? "أنت" : displayName);
  const personOf = (id: string, displayName: string) => members.find((m) => m.userId === id) ?? { userId: id, user: { displayName } };

  return (
    <View style={{ gap: 10, paddingTop: 14, marginTop: 4, borderTopWidth: 1, borderTopColor: t.line }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? "إخفاء النشاط" : "عرض النشاط"}
        onPress={onToggle}
        style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}
      >
        <TText size={15} weight="bold">
          النشاط
        </TText>
        <View style={{ backgroundColor: t.chip, borderRadius: 999, paddingVertical: 1, paddingHorizontal: 8 }}>
          <TText size={12} weight="semibold" color={t.ink3} lineHeight={18}>
            {comments.data?.length ?? 0}
          </TText>
        </View>
        {!open && history.data ? (
          <TText size={12} color={t.muted}>
            {countLabel(history.data.length, CHANGES)}
          </TText>
        ) : null}
        <View style={{ marginStart: "auto", width: 32, height: 32, borderRadius: 999, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={t.ink3} />
        </View>
      </Pressable>

      {!open ? null : history.isPending || comments.isPending ? (
        <TText size={12} color={t.muted}>
          جارٍ تحميل النشاط…
        </TText>
      ) : history.isError || comments.isError ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void history.refetch();
            void comments.refetch();
          }}
        >
          <TText size={12} color={t.danger}>
            تعذّر تحميل النشاط — إعادة المحاولة
          </TText>
        </Pressable>
      ) : (
        <>
          {entries.slice(0, shown).map((entry) =>
            entry.kind === "comment" ? (
              <Pressable
                key={entry.id}
                onLongPress={() => setMenuFor(entry.comment)}
                accessibilityHint="اضغط مطولًا للنسخ أو الحذف"
                style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
              >
                <TAvatar person={personOf(entry.comment.author.id, entry.comment.author.displayName)} size={30} />
                <View
                  style={{
                    flex: 1,
                    minWidth: 0,
                    backgroundColor: t.surface,
                    borderWidth: 1,
                    borderColor: t.line,
                    borderRadius: 14,
                    borderTopEndRadius: 4,
                    paddingTop: 8,
                    paddingHorizontal: 12,
                    paddingBottom: 10,
                    gap: 2,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <TText size={13} weight="bold">
                      {nameOf(entry.comment.author.id, entry.comment.author.displayName)}
                    </TText>
                    <TText size={11} color={t.muted}>
                      {relativeTime(entry.createdAt, now)}
                    </TText>
                  </View>
                  <RichTextView look="task" text={entry.comment.body} mentionNames={mentionNames} fontSize={14} lineHeight={24} color={t.ink} />
                </View>
              </Pressable>
            ) : (
              <View key={entry.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingStart: 11 }}>
                <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: t.idle }} />
                <TText size={12} color={t.ink3} style={{ flex: 1 }}>
                  <TText size={12} weight="bold">
                    {nameOf(entry.activity.actor.id, entry.activity.actor.displayName)}
                  </TText>{" "}
                  {describeCardActivity(entry.activity)}
                </TText>
                <TText size={12} color={t.muted}>
                  {relativeTime(entry.createdAt, now)}
                </TText>
              </View>
            ),
          )}
          {shown >= entries.length ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 8, paddingBottom: 4 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
              <TText size={12} color={t.muted}>
                بداية سجل المهمة
              </TText>
              <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
            </View>
          ) : null}
        </>
      )}

      <BottomSheet visible={!!menuFor} onClose={() => setMenuFor(null)} look="task">
        <View style={{ paddingHorizontal: 8 }}>
          <SheetTitle>التعليق</SheetTitle>
          <MenuRow
            icon="copy-outline"
            label="نسخ التعليق"
            onPress={() => {
              if (menuFor) void Clipboard.setStringAsync(menuFor.body);
              setMenuFor(null);
            }}
          />
          {menuFor && menuFor.author.id === user?.id ? (
            <MenuRow
              icon="trash-outline"
              label="حذف التعليق"
              danger
              onPress={() => {
                if (menuFor) remove.mutate(menuFor.id);
                setMenuFor(null);
              }}
            />
          ) : null}
        </View>
      </BottomSheet>
    </View>
  );
}

export function MenuRow({ icon, label, onPress, danger }: { icon: TIcon; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, paddingHorizontal: 10, borderRadius: 10, backgroundColor: pressed ? t.canvas : "transparent" })}
    >
      <Ionicons name={icon} size={17} color={danger ? t.danger : t.ink} />
      <TText size={14} weight="medium" color={danger ? t.danger : t.ink}>
        {label}
      </TText>
    </Pressable>
  );
}

/**
 * The comment bar at the bottom: your avatar, the field, and ↑ — grey until
 * there is something to send. Typing «@» and a few letters suggests the task's
 * people (an addition to the prototype, carried over from the app).
 */
export function TaskComposer({
  cardId,
  members,
  me,
  onSent,
}: {
  cardId: string;
  members: BoardMember[];
  me: BoardMember | undefined;
  /** After a comment is posted — the screen opens the activity so it shows. */
  onSent?: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const [forced, setForced] = useState<Selection | undefined>(undefined);

  const post = useMutation({
    mutationFn: (body: string) => api.comments.create(cardId, { body }),
    onSuccess: () => {
      setDraft("");
      onSent?.();
      void queryClient.invalidateQueries({ queryKey: commentsKey(cardId) });
    },
  });

  useEffect(() => {
    if (post.isError && draft === "") post.reset();
  }, [draft, post]);

  const mention = selection.start === selection.end ? activeMention(draft, selection.start) : null;
  const suggestions = mention ? topMatches(members, mention.query, new Set()) : [];
  const canSend = draft.trim().length > 0 && !post.isPending;

  return (
    <View style={{ backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.line }}>
      {post.isError ? (
        <Pressable accessibilityRole="button" onPress={() => post.mutate(draft.trim())} style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <TText size={12} weight="semibold" color={t.danger}>
            لم يُرسل — إعادة المحاولة
          </TText>
        </Pressable>
      ) : null}
      {mention && suggestions.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 12, paddingTop: 8 }}>
          {suggestions.map((member) => (
            <Pressable
              key={member.userId}
              accessibilityRole="button"
              accessibilityLabel={`الإشارة إلى ${member.user.displayName}`}
              onPress={() => {
                const edit = replaceRange(draft, { start: mention.start, end: selection.start }, `@${member.user.displayName} `);
                setDraft(edit.text);
                setSelection(edit.selection);
                setForced(edit.selection);
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 7, height: 32, paddingStart: 4, paddingEnd: 10, borderRadius: 999, backgroundColor: t.accentSoft }}
            >
              <TAvatar person={member} size={24} />
              <TText size={13} weight="semibold" color={t.accent}>
                {member.user.displayName}
              </TText>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12 }}>
        {me ? <TAvatar person={me} size={32} /> : null}
        <TextInput
          value={draft}
          onChangeText={setDraft}
          selection={forced}
          onSelectionChange={(e) => {
            setSelection(e.nativeEvent.selection);
            setForced(undefined);
          }}
          placeholder="اكتب تعليقًا…"
          placeholderTextColor={t.faint}
          accessibilityLabel="اكتب تعليقًا"
          multiline
          submitBehavior="submit"
          onSubmitEditing={() => canSend && post.mutate(draft.trim())}
          returnKeyType="send"
          style={{
            flex: 1,
            minHeight: 42,
            maxHeight: 110,
            borderWidth: 1,
            borderColor: t.line,
            backgroundColor: t.canvas,
            borderRadius: 21,
            paddingHorizontal: 16,
            paddingVertical: 10,
            fontFamily: taskFonts.regular,
            fontSize: fs(14),
            lineHeight: fs(21),
            color: t.ink,
            textAlign: "right",
            writingDirection: "rtl",
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="إرسال التعليق"
          disabled={!canSend}
          onPress={() => post.mutate(draft.trim())}
          style={{ width: 42, height: 42, borderRadius: 999, backgroundColor: canSend ? t.accent : t.idle, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="arrow-up" size={19} color={t.surface} />
        </Pressable>
      </View>
    </View>
  );
}
