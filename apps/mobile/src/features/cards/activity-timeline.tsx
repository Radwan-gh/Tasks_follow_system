import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { describeCardActivity, type BoardMember, type CardActivity, type Comment, type List } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { RichTextView, SheetAction } from "@/components/rich-text-view";
import { Skeleton } from "@/components/skeleton";
import { AppText } from "@/components/text";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/lib/api";
import { countLabel, type ArabicNoun } from "@/lib/plural";
import { buildTimeline, type TimelineFilter } from "@/lib/timeline";
import { colors, radii, spacing, statusColors } from "@/theme/tokens";
import { MemberAvatar } from "./task-fields";

const COMMENTS: ArabicNoun = { zero: "لا تعليقات", one: "تعليق واحد", two: "تعليقان", few: "تعليقات", many: "تعليقًا" };
const CHANGES: ArabicNoun = { zero: "لا تغييرات", one: "تغيير واحد", two: "تغييران", few: "تغييرات", many: "تغييرًا" };

const time = new Intl.DateTimeFormat("ar", { hour: "numeric", minute: "2-digit" });

export const commentsKey = (cardId: string) => ["cardComments", cardId] as const;
export const historyKey = (cardId: string) => ["cardHistory", cardId] as const;

/**
 * 6d «التعليقات والسجل», under the subtasks on the task screen: «النشاط»
 * with its counts, the «الكل · التعليقات · السجل» chips, then one timeline
 * newest-first with day markers. A comment is a bubble under its writer's
 * name; a change is one small line with a dot in the colour of what it did
 * (a move takes the destination status's colour), so the kind reads before
 * the words. Long-pressing a comment copies it, or deletes it when it is
 * yours. The composer lives at the bottom of the screen (`CommentComposer`).
 */
export function ActivityTimeline({
  cardId,
  lists,
  members,
  onJump,
}: {
  cardId: string;
  /** The board's lists — a move's dot takes the colour of the status it went to. */
  lists: List[];
  members: BoardMember[];
  /** 6b's «مرّر للأسفل ⌄»: scrolls the screen to the timeline. */
  onJump?: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const history = useQuery({ queryKey: historyKey(cardId), queryFn: () => api.cards.history(cardId) });
  const comments = useQuery({ queryKey: commentsKey(cardId), queryFn: () => api.comments.list(cardId) });
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const [menuFor, setMenuFor] = useState<Comment | null>(null);
  const [deleting, setDeleting] = useState<Comment | null>(null);

  const remove = useMutation({
    mutationFn: (commentId: string) => api.comments.remove(cardId, commentId),
    onSuccess: () => {
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: commentsKey(cardId) });
    },
  });

  const mentionNames = useMemo(
    () => members.flatMap((m) => [m.user.displayName, m.user.firstName]).filter(Boolean),
    [members],
  );
  const statusByListName = useMemo(() => new Map(lists.map((l) => [l.name, l.statusCategory ?? "UNCATEGORIZED"] as const)), [lists]);

  const commentCount = comments.data?.length ?? 0;
  const changeCount = history.data?.length ?? 0;
  const rows = useMemo(
    () => (history.data && comments.data ? buildTimeline(history.data, comments.data, filter) : []),
    [history.data, comments.data, filter],
  );

  function dotColor(activity: CardActivity): string {
    if (activity.type === "MOVED") {
      const category = activity.toValue ? statusByListName.get(activity.toValue) : undefined;
      return statusColors[category ?? "UNCATEGORIZED"];
    }
    if (activity.type === "SUBTASK_COMPLETED") return colors.done;
    return colors.dashedStrong;
  }

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: 4 }}>
        <AppText size="small" weight="bold">
          النشاط
        </AppText>
        {history.data && comments.data ? (
          <AppText size="caption" color={colors.muted}>
            {countLabel(commentCount, COMMENTS)} · {countLabel(changeCount, CHANGES)}
          </AppText>
        ) : null}
        {onJump ? (
          <Pressable accessibilityRole="button" onPress={onJump} hitSlop={8} style={{ marginStart: "auto" }}>
            <AppText size="caption" weight="semibold" color={colors.accent}>
              مرّر للأسفل ⌄
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <FilterChip label="الكل" active={filter === "all"} onPress={() => setFilter("all")} />
        <FilterChip label={`التعليقات · ${commentCount}`} active={filter === "comments"} onPress={() => setFilter("comments")} />
        <FilterChip label={`السجل · ${changeCount}`} active={filter === "history"} onPress={() => setFilter("history")} />
      </View>

      {history.isPending || comments.isPending ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={14} width="70%" />
          <Skeleton height={56} />
          <Skeleton height={14} width="55%" />
        </View>
      ) : history.isError || comments.isError ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void history.refetch();
            void comments.refetch();
          }}
        >
          <AppText size="small" color={colors.alert}>
            تعذّر تحميل النشاط — إعادة المحاولة
          </AppText>
        </Pressable>
      ) : rows.length === 0 ? (
        <AppText size="small" color={colors.muted} style={{ paddingHorizontal: 4 }}>
          {filter === "comments" ? "لا تعليقات بعد — اكتب أول تعليق من الحقل في الأسفل." : "لا يوجد نشاط بعد."}
        </AppText>
      ) : (
        <View style={{ gap: 14 }}>
          {rows.map((row) => {
            if (row.kind === "day") {
              return (
                <View key={row.key} style={{ alignSelf: "center", backgroundColor: colors.dayMarker, borderRadius: radii.chip, paddingVertical: 3, paddingHorizontal: 10 }}>
                  <AppText weight="bold" color={colors.muted} style={{ fontSize: 11, lineHeight: 16 }}>
                    {row.label}
                  </AppText>
                </View>
              );
            }
            if (row.kind === "activity") {
              return (
                <View key={row.key} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingStart: spacing.md }}>
                  <View style={{ width: 8, height: 8, marginTop: 8, borderRadius: 999, backgroundColor: dotColor(row.activity) }} />
                  <AppText size="caption" color={colors.subtle} style={{ flex: 1, lineHeight: 22 }}>
                    <AppText size="caption" weight="semibold" color={colors.inkSoft} style={{ lineHeight: 22 }}>
                      {row.activity.actor.displayName}
                    </AppText>{" "}
                    {describeCardActivity(row.activity)}
                  </AppText>
                  <AppText color={colors.faint} style={{ fontSize: 11, lineHeight: 22 }}>
                    {time.format(new Date(row.activity.createdAt))}
                  </AppText>
                </View>
              );
            }
            const comment = row.comment;
            const author = members.find((m) => m.userId === comment.author.id);
            return (
              <Pressable
                key={row.key}
                onLongPress={() => setMenuFor(comment)}
                accessibilityHint="اضغط مطولًا للنسخ أو الحذف"
                style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
              >
                <MemberAvatar member={author ?? { userId: comment.author.id, user: comment.author }} size={32} />
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
                    <AppText size="small" weight="bold" style={{ lineHeight: 20 }}>
                      {comment.author.displayName}
                    </AppText>
                    <AppText color={colors.faint} style={{ fontSize: 11, lineHeight: 20 }}>
                      {time.format(new Date(comment.createdAt))}
                    </AppText>
                  </View>
                  <View
                    style={{
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.line,
                      borderRadius: 16,
                      borderTopStartRadius: 4,
                      paddingVertical: 10,
                      paddingHorizontal: spacing.md,
                    }}
                  >
                    <RichTextView text={comment.body} mentionNames={mentionNames} fontSize={14} lineHeight={25} />
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <BottomSheet visible={!!menuFor} onClose={() => setMenuFor(null)}>
        <View style={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}>
          <SheetAction
            label="⧉ نسخ التعليق"
            onPress={() => {
              if (menuFor) void Clipboard.setStringAsync(menuFor.body);
              setMenuFor(null);
            }}
          />
          {menuFor && menuFor.author.id === user?.id ? (
            <SheetAction
              label="حذف التعليق"
              destructive
              onPress={() => {
                setDeleting(menuFor);
                setMenuFor(null);
              }}
            />
          ) : null}
        </View>
      </BottomSheet>

      <ConfirmSheet
        visible={!!deleting}
        onClose={() => setDeleting(null)}
        title="حذف التعليق"
        consequence="لا يمكن التراجع عن حذف هذا التعليق."
        confirmLabel="حذف"
        confirming={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={{
        minHeight: 36,
        justifyContent: "center",
        paddingHorizontal: 14,
        borderRadius: radii.chip,
        backgroundColor: active ? colors.ink : colors.surface,
        borderWidth: active ? 0 : 1,
        borderColor: colors.line,
      }}
    >
      <AppText size="small" weight={active ? "semibold" : "regular"} color={active ? colors.surface : colors.subtle} style={{ lineHeight: 18 }}>
        {label}
      </AppText>
    </Pressable>
  );
}
