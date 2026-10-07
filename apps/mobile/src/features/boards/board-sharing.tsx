import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@app/api-client";
import type { BoardKind, SimilarBoard } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { PrimaryButton } from "@/components/button";
import { AppText } from "@/components/text";
import { api } from "@/lib/api";
import { avatarColorFor } from "@/lib/avatar";
import type { ShareNotice } from "@/lib/board-sharing";
import { initials } from "@/lib/initials";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * Board sharing on mobile (`docs/18-board-sharing.md`): the personal/shared
 * choice when creating a board, the scope field a shared board needs, the
 * «لوحات بأسماء مشابهة» check that comes before any share request, and the
 * owner's request sheet and banner.
 */

/** Long enough that typing a name doesn't fire a lookup per letter. */
const SIMILAR_DEBOUNCE_MS = 400;
/** One letter matches too much to be a useful hint. */
const SIMILAR_MIN_CHARS = 2;

export function KindChoice({
  value,
  onChange,
  approver,
}: {
  value: BoardKind;
  onChange: (kind: BoardKind) => void;
  approver: boolean;
}) {
  const helper =
    value === "PERSONAL"
      ? "لك وحدك، بلا أعضاء."
      : approver
        ? "يشترك فيها آخرون، وتُنشأ مشتركة مباشرة."
        : "يشترك فيها آخرون، وتحتاج موافقة قبل إضافة الأعضاء.";
  return (
    <View style={{ gap: spacing.xs }}>
      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: "row", padding: spacing.xs, borderRadius: radii.field, backgroundColor: colors.line }}
      >
        {(["PERSONAL", "SHARED"] as const).map((kind) => {
          const selected = value === kind;
          return (
            <Pressable
              key={kind}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(kind)}
              style={{
                flex: 1,
                minHeight: 38,
                borderRadius: radii.field - 4,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: selected ? colors.surface : "transparent",
              }}
            >
              <AppText size="small" weight={selected ? "semibold" : "regular"} color={selected ? colors.ink : colors.muted}>
                {kind === "PERSONAL" ? "لوحة شخصية" : "لوحة مشتركة"}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <AppText size="caption" color={colors.muted}>
        {helper}
      </AppText>
    </View>
  );
}

export function ScopeField({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText size="caption" weight="semibold" color={colors.muted}>
        نطاق اللوحة
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline
        placeholder="ما الذي تتابعه هذه اللوحة، ولمن؟"
        placeholderTextColor={colors.muted}
        accessibilityLabel="نطاق اللوحة"
        style={{
          minHeight: 72,
          backgroundColor: colors.canvas,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radii.field,
          padding: spacing.md,
          fontFamily: fonts.regular,
          fontSize: fontSizes.body,
          color: colors.ink,
          textAlign: "right",
          textAlignVertical: "top",
          writingDirection: "rtl",
        }}
      />
    </View>
  );
}

/**
 * The duplicate check: shared boards (and ones waiting to become shared)
 * whose name resembles what is being typed. Silent until there is something
 * to show — a hint, not a gate.
 */
export function SimilarBoards({ name, excludeBoardId }: { name: string; excludeBoardId?: string }) {
  const [term, setTerm] = useState(name.trim());
  useEffect(() => {
    const timer = setTimeout(() => setTerm(name.trim()), SIMILAR_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [name]);

  const similar = useQuery({
    queryKey: ["similar-boards", term, excludeBoardId ?? null],
    queryFn: () => api.boardSharing.similar(term, excludeBoardId),
    enabled: term.length >= SIMILAR_MIN_CHARS,
    staleTime: 30_000,
  });

  const boards = term.length >= SIMILAR_MIN_CHARS ? (similar.data ?? []) : [];
  if (boards.length === 0) return null;

  return (
    <View
      accessibilityRole="summary"
      style={{
        borderRadius: radii.card,
        backgroundColor: colors.accentSoft,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
        <Ionicons name="albums-outline" size={18} color={colors.accent} style={{ marginTop: 3 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText weight="semibold" color={colors.accent}>
            لوحات بأسماء مشابهة
          </AppText>
          <AppText size="small" color={colors.ink}>
            لعلّ اللوحة التي تريدها موجودة: اطلب من صاحبها أن يضيفك بدل إنشاء لوحة جديدة.
          </AppText>
        </View>
      </View>
      <View style={{ borderRadius: radii.field, backgroundColor: colors.surface, overflow: "hidden" }}>
        {boards.map((board, index) => (
          <SimilarBoardRow key={board.id} board={board} first={index === 0} />
        ))}
      </View>
    </View>
  );
}

export function SimilarBoardRow({ board, first }: { board: SimilarBoard; first: boolean }) {
  const palette = avatarColorFor(board.owner.id);
  return (
    <View
      style={{
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.md,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.line,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{
          width: 32,
          height: 32,
          borderRadius: radii.chip,
          backgroundColor: palette.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AppText size="caption" weight="bold" color={palette.fg}>
          {initials(board.owner.displayName)}
        </AppText>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <AppText weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
            {board.name}
          </AppText>
          {board.pending ? (
            <View style={{ borderRadius: radii.chip, backgroundColor: colors.line, paddingHorizontal: spacing.sm }}>
              <AppText size="caption" weight="medium" color={colors.muted}>
                بانتظار الموافقة
              </AppText>
            </View>
          ) : null}
        </View>
        {board.description ? (
          <AppText size="small" color={colors.muted} numberOfLines={2}>
            {board.description}
          </AppText>
        ) : null}
        <AppText size="caption" color={colors.muted}>
          صاحبها {board.owner.displayName} · {memberCountLabel(board.memberCount)}
        </AppText>
      </View>
    </View>
  );
}

function memberCountLabel(n: number): string {
  if (n === 1) return "عضو واحد";
  if (n === 2) return "عضوان";
  const lastTwo = n % 100;
  return `${n} ${lastTwo >= 3 && lastTwo <= 10 ? "أعضاء" : "عضو"}`;
}

/** The owner's view of a personal board's share request, under the board header. */
export function ShareNoticeBanner({ notice, onRequestAgain }: { notice: ShareNotice; onRequestAgain: () => void }) {
  if (!notice) return null;
  const rejected = notice.kind === "rejected";
  return (
    <View
      style={{
        marginHorizontal: spacing.xl,
        marginBottom: spacing.md,
        backgroundColor: rejected ? colors.alertSoft : colors.canvas,
        borderRadius: radii.field,
        padding: spacing.md,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
      }}
    >
      <AppText size="small" color={rejected ? colors.alert : colors.muted} style={{ flex: 1 }}>
        {rejected
          ? notice.reason
            ? `رُفض طلب المشاركة: ${notice.reason}`
            : "رُفض طلب المشاركة."
          : "طلب المشاركة بانتظار الموافقة. تعمل اللوحة كلوحة شخصية حتى ذلك الحين."}
      </AppText>
      {rejected ? (
        <Pressable accessibilityRole="button" onPress={onRequestAgain} hitSlop={8} style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}>
          <AppText size="small" weight="semibold" color={colors.accent}>
            إعادة الطلب
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * «اطلب جعلها مشتركة» — the owner asks for a personal board (again) to become
 * shared: the scope, prefilled from the board's description, plus the same
 * duplicate check as creating one. An approver's own request shares at once.
 */
export function RequestShareSheet({
  visible,
  onClose,
  board,
  approver,
  onSent,
}: {
  visible: boolean;
  onClose: () => void;
  board: { id: string; name: string; description: string | null };
  approver: boolean;
  /** The scope as sent — it is now the board's description. */
  onSent?: (scope: string) => void;
}) {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState(board.description ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setScope(board.description ?? "");
      setError(null);
    }
  }, [visible, board.description]);

  const request = useMutation({
    mutationFn: () => api.boardSharing.request({ boardId: board.id, description: scope.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["board", board.id] });
      void queryClient.invalidateQueries({ queryKey: ["boards"] });
      onSent?.(scope.trim());
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "تعذّر إرسال الطلب. أعد المحاولة."),
  });

  const canSend = scope.trim().length > 0;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.lg, paddingBottom: spacing.sm }}>
        <View style={{ gap: spacing.xs }}>
          <AppText weight="bold" size="title">
            {approver ? "جعل اللوحة مشتركة" : "طلب جعل اللوحة مشتركة"}
          </AppText>
          <AppText size="small" color={colors.muted}>
            {approver
              ? "تصير مشتركة فورًا، فتضيف إليها الأعضاء."
              : "يراجع الطلبَ موافِقٌ ويقارنه باللوحات الموجودة. تبقى اللوحة شخصية حتى يوافق."}
          </AppText>
        </View>

        <ScopeField value={scope} onChange={setScope} />
        <SimilarBoards name={board.name} excludeBoardId={board.id} />

        {error ? (
          <AppText size="small" color={colors.alert}>
            {error}
          </AppText>
        ) : null}

        <PrimaryButton
          label={approver ? "جعلها مشتركة" : "إرسال الطلب"}
          onPress={() => request.mutate()}
          disabled={!canSend}
          loading={request.isPending}
        />
      </View>
    </BottomSheet>
  );
}
