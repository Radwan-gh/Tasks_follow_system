import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CardActivity, Comment } from "@app/types";
import { AppText } from "@/components/text";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { Skeleton } from "@/components/skeleton";
import { avatarColorFor } from "@/lib/avatar";
import { initials } from "@/lib/initials";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/lib/api";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

type TimelineRow =
  | { kind: "activity"; id: string; createdAt: string; activity: CardActivity }
  | { kind: "comment"; id: string; createdAt: string; comment: Comment };

/**
 * "السجل والتعليقات" (`design-prompt-group-3.md` §3a-5): system events (grey
 * rows, unchanged from before this feature) and text comments (`canvas`
 * bubbles) merged into one timeline sorted by time, plus a composer and
 * long-press-to-delete on the viewer's own comments.
 */
export function HistorySection({ cardId, readOnly = false }: { cardId: string; readOnly?: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const history = useQuery({ queryKey: ["cardHistory", cardId], queryFn: () => api.cards.history(cardId) });
  const comments = useQuery({ queryKey: ["cardComments", cardId], queryFn: () => api.comments.list(cardId) });

  const [draft, setDraft] = useState("");
  const [failedDraft, setFailedDraft] = useState<string | null>(null);
  const [deletingComment, setDeletingComment] = useState<Comment | null>(null);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["cardComments", cardId] });
  }

  const post = useMutation({
    mutationFn: (body: string) => api.comments.create(cardId, { body }),
    onSuccess: () => {
      setFailedDraft(null);
      invalidate();
    },
    onError: (_err, body) => setFailedDraft(body),
  });

  const remove = useMutation({
    mutationFn: (commentId: string) => api.comments.remove(cardId, commentId),
    onSuccess: () => {
      setDeletingComment(null);
      invalidate();
    },
  });

  function send() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    post.mutate(body);
  }

  const isPending = history.isPending || comments.isPending;
  const isError = history.isError || comments.isError;

  const rows: TimelineRow[] = isPending || isError
    ? []
    : [
        ...history.data.map((activity): TimelineRow => ({
          kind: "activity",
          id: activity.id,
          createdAt: activity.createdAt,
          activity,
        })),
        ...comments.data.map((comment): TimelineRow => ({
          kind: "comment",
          id: comment.id,
          createdAt: comment.createdAt,
          comment,
        })),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <View style={{ gap: spacing.md }}>
      <AppText size="caption" weight="semibold" color={colors.muted}>
        السجل والتعليقات
      </AppText>

      {isPending ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={14} width="80%" />
          <Skeleton height={14} width="60%" />
        </View>
      ) : isError ? (
        <AppText size="small" color={colors.muted}>
          تعذّر تحميل السجل.
        </AppText>
      ) : rows.length === 0 ? (
        <AppText size="small" color={colors.muted}>
          لا يوجد سجل بعد.
        </AppText>
      ) : (
        <View style={{ gap: spacing.md }}>
          {rows.map((row) =>
            row.kind === "activity" ? (
              <ActivityRow key={row.id} activity={row.activity} />
            ) : (
              <CommentBubble
                key={row.id}
                comment={row.comment}
                isMine={row.comment.author.id === user?.id}
                onLongPress={() => {
                  if (row.comment.author.id === user?.id) setDeletingComment(row.comment);
                }}
              />
            ),
          )}
        </View>
      )}

      {failedDraft ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const body = failedDraft;
            setFailedDraft(null);
            post.mutate(body);
          }}
          style={{ backgroundColor: colors.alertSoft, borderRadius: radii.field, padding: spacing.sm }}
        >
          <AppText size="small" color={colors.alert}>
            لم يُرسل — إعادة المحاولة
          </AppText>
        </Pressable>
      ) : null}

      {!readOnly ? (
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.sm }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="اكتب تعليقاً…"
          placeholderTextColor={colors.muted}
          multiline
          style={{
            flex: 1,
            minHeight: MIN_TOUCH_TARGET,
            maxHeight: 120,
            backgroundColor: colors.canvas,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radii.field,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            fontFamily: fonts.regular,
            fontSize: fontSizes.body,
            color: colors.ink,
            textAlign: "right",
            writingDirection: "rtl",
          }}
        />
        {draft.trim().length > 0 ? (
          <Pressable
            accessibilityRole="button"
            disabled={post.isPending}
            onPress={send}
            style={{
              minHeight: MIN_TOUCH_TARGET,
              paddingHorizontal: spacing.lg,
              borderRadius: radii.field,
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AppText weight="semibold" color={colors.surface}>
              إرسال
            </AppText>
          </Pressable>
        ) : null}
      </View>
      ) : null}

      <ConfirmSheet
        visible={!!deletingComment}
        onClose={() => setDeletingComment(null)}
        title="حذف التعليق"
        consequence="لا يمكن التراجع عن حذف هذا التعليق."
        confirmLabel="حذف"
        confirming={remove.isPending}
        onConfirm={() => {
          if (deletingComment) remove.mutate(deletingComment.id);
        }}
      />
    </View>
  );
}

function ActivityRow({ activity }: { activity: CardActivity }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: colors.line, marginTop: 7 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText size="small" style={{ lineHeight: 22 }}>
          <AppText size="small" weight="bold">
            {activity.actor.displayName}
          </AppText>{" "}
          {describeActivity(activity)}
        </AppText>
        <AppText size="caption" color={colors.muted}>
          {formatTimestamp(activity.createdAt)}
        </AppText>
      </View>
    </View>
  );
}

function CommentBubble({
  comment,
  isMine,
  onLongPress,
}: {
  comment: Comment;
  isMine: boolean;
  onLongPress: () => void;
}) {
  const palette = avatarColorFor(comment.author.id);
  return (
    <Pressable onLongPress={onLongPress} style={{ flexDirection: "row", gap: spacing.sm }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          backgroundColor: palette.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AppText size="caption" weight="bold" color={palette.fg} style={{ fontSize: 10 }}>
          {initials(comment.author.displayName)}
        </AppText>
      </View>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.canvas,
          borderRadius: radii.card,
          padding: spacing.md,
          gap: 2,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <AppText size="small" weight="bold">
            {comment.author.displayName}
            {isMine ? " (أنت)" : ""}
          </AppText>
          <AppText size="caption" color={colors.muted}>
            {formatTimestamp(comment.createdAt)}
          </AppText>
        </View>
        <AppText size="small" style={{ lineHeight: 22 }}>
          {comment.body}
        </AppText>
      </View>
    </Pressable>
  );
}

/** Arabic, human-readable description of a single history event — ported from `CardDetailModal.tsx`. */
function describeActivity(activity: CardActivity): string {
  switch (activity.type) {
    case "CREATED":
      return activity.toValue ? `أنشأ البطاقة في «${activity.toValue}»` : "أنشأ البطاقة";
    case "MOVED":
      return `نقل البطاقة من «${activity.fromValue ?? "؟"}» إلى «${activity.toValue ?? "؟"}»`;
    case "RENAMED":
      return `غيّر العنوان من «${activity.fromValue ?? ""}» إلى «${activity.toValue ?? ""}»`;
    case "DESCRIPTION_UPDATED":
      return "حدّث الوصف";
    case "DUE_DATE_CHANGED":
      return activity.toValue
        ? `عيّن تاريخ الاستحقاق إلى ${formatDate(activity.toValue)}`
        : "أزال تاريخ الاستحقاق";
    case "ARCHIVED":
      return "أرشف البطاقة";
    case "UNARCHIVED":
      return "أعاد البطاقة من الأرشيف";
    case "ASSIGNED":
      return activity.toValue ? `أسند المهمة إلى ${activity.toValue}` : "أسند المهمة";
    case "UNASSIGNED":
      return "أزال إسناد المهمة";
    case "COST_UPDATED":
      return activity.toValue ? `حدّث التكلفة إلى ${activity.toValue}` : "أزال التكلفة";
    default:
      return "حدّث البطاقة";
  }
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ar", { dateStyle: "medium" });
}
