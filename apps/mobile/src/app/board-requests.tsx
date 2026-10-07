import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@app/api-client";
import type { BoardShareRequest, BoardShareRequestStatus } from "@app/types";
import { PrimaryButton } from "@/components/button";
import { Screen } from "@/components/screen";
import { Skeleton } from "@/components/skeleton";
import { EmptyState, ErrorState } from "@/components/state-views";
import { AppText } from "@/components/text";
import { SimilarBoardRow } from "@/features/boards/board-sharing";
import { api } from "@/lib/api";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

const FILTERS: { status: BoardShareRequestStatus; label: string; empty: string }[] = [
  { status: "PENDING", label: "بانتظار القرار", empty: "لا طلبات بانتظار القرار." },
  { status: "APPROVED", label: "المقبولة", empty: "لم يُقبل أيّ طلب بعد." },
  { status: "REJECTED", label: "المرفوضة", empty: "لم يُرفض أيّ طلب بعد." },
];

const dateFormat = new Intl.DateTimeFormat("ar", { day: "numeric", month: "long" });

/**
 * `/board-requests` — «طلبات اللوحات المشتركة», the approver queue
 * (`docs/18-board-sharing.md`): for an ADMIN or a user granted
 * `canApproveBoards`, reached from the account tab and from a
 * `BOARD_SHARE_REQUESTED` notification. Each request comes with the boards
 * whose names resemble it; a rejection needs a reason, which reaches the
 * requester.
 */
export default function BoardRequestsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<BoardShareRequestStatus>("PENDING");
  const [notice, setNotice] = useState<string | null>(null);
  const requests = useQuery({
    queryKey: ["board-share-requests", status],
    queryFn: () => api.boardSharing.list(status),
  });

  function afterDecision() {
    void queryClient.invalidateQueries({ queryKey: ["board-share-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["similar-boards"] });
  }

  function onDecisionError(err: unknown) {
    setNotice(
      err instanceof ApiError && err.status === 409
        ? "قرّر موافِق آخر هذا الطلب للتوّ."
        : err instanceof ApiError
          ? err.message
          : "تعذّر حفظ القرار. أعد المحاولة.",
    );
    afterDecision();
  }

  const empty = FILTERS.find((f) => f.status === status)!.empty;

  return (
    <Screen edges={{ top: true, bottom: true }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="رجوع"
          onPress={() => router.back()}
          style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: "flex-start", justifyContent: "center" }}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.muted} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText size="title" weight="bold">
            طلبات اللوحات المشتركة
          </AppText>
          <AppText size="caption" color={colors.muted}>
            قارن كل طلب باللوحات الموجودة قبل أن تقرّر
          </AppText>
        </View>
      </View>

      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: "row",
          marginHorizontal: spacing.xl,
          marginVertical: spacing.md,
          padding: spacing.xs,
          borderRadius: radii.field,
          backgroundColor: colors.line,
        }}
      >
        {FILTERS.map((f) => {
          const selected = status === f.status;
          return (
            <Pressable
              key={f.status}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => {
                setStatus(f.status);
                setNotice(null);
              }}
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
                {f.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={requests.isRefetching} onRefresh={() => void requests.refetch()} />}
      >
        {notice ? (
          <View style={{ backgroundColor: colors.canvas, borderRadius: radii.field, padding: spacing.md }}>
            <AppText size="small" color={colors.muted}>
              {notice}
            </AppText>
          </View>
        ) : null}

        {requests.isPending ? (
          <>
            <Skeleton height={160} radius={radii.card} />
            <Skeleton height={160} radius={radii.card} />
          </>
        ) : requests.isError ? (
          <ErrorState onRetry={() => void requests.refetch()} />
        ) : requests.data.length === 0 ? (
          <EmptyState icon="albums-outline" title="لا طلبات" message={empty} />
        ) : (
          requests.data.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              onDecided={() => {
                setNotice(null);
                afterDecision();
              }}
              onError={onDecisionError}
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function RequestCard({
  request,
  onDecided,
  onError,
}: {
  request: BoardShareRequest;
  onDecided: () => void;
  onError: (err: unknown) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const approve = useMutation({ mutationFn: () => api.boardSharing.approve(request.id), onSuccess: onDecided, onError });
  const reject = useMutation({
    mutationFn: () => api.boardSharing.reject(request.id, reason.trim()),
    onSuccess: onDecided,
    onError,
  });
  const busy = approve.isPending || reject.isPending;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: colors.line,
        padding: spacing.xl,
        gap: spacing.md,
      }}
    >
      <View style={{ gap: spacing.xs }}>
        <AppText size="title" weight="semibold">
          {request.board.name}
        </AppText>
        {request.board.description ? (
          <AppText size="small" color={colors.ink}>
            {request.board.description}
          </AppText>
        ) : null}
        <View>
          <AppText size="caption" color={colors.muted}>
            طلبها {request.requestedBy.displayName} في {dateFormat.format(new Date(request.createdAt))}
          </AppText>
          <AppText size="caption" color={colors.muted}>
            {request.requestedBy.username}
          </AppText>
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <AppText size="caption" weight="semibold" color={colors.muted}>
          لوحات مشابهة
        </AppText>
        {request.similarBoards.length === 0 ? (
          <AppText size="small" color={colors.muted}>
            لا لوحات بأسماء مشابهة.
          </AppText>
        ) : (
          <View style={{ borderRadius: radii.field, backgroundColor: colors.canvas, overflow: "hidden" }}>
            {request.similarBoards.map((board, index) => (
              <SimilarBoardRow key={board.id} board={board} first={index === 0} />
            ))}
          </View>
        )}
      </View>

      {request.status === "PENDING" ? (
        rejecting ? (
          <View style={{ gap: spacing.sm }}>
            <AppText size="caption" weight="semibold" color={colors.muted}>
              سبب الرفض
            </AppText>
            {request.similarBoards.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {request.similarBoards.map((board) => {
                  const text = `توجد لوحة: ${board.name}`;
                  return (
                    <Pressable
                      key={board.id}
                      accessibilityRole="button"
                      onPress={() => setReason(text)}
                      style={{
                        minHeight: 32,
                        justifyContent: "center",
                        borderRadius: radii.chip,
                        borderWidth: 1,
                        borderColor: reason === text ? colors.accent : colors.line,
                        backgroundColor: reason === text ? colors.accentSoft : colors.surface,
                        paddingHorizontal: spacing.md,
                      }}
                    >
                      <AppText size="caption" weight="medium" color={reason === text ? colors.accent : colors.ink}>
                        {text}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <TextInput
              value={reason}
              onChangeText={setReason}
              multiline
              autoFocus
              placeholder="يصل السبب إلى صاحب الطلب"
              placeholderTextColor={colors.muted}
              accessibilityLabel="سبب الرفض"
              style={{
                minHeight: 64,
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
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Pressable
                accessibilityRole="button"
                disabled={reason.trim().length === 0 || busy}
                onPress={() => reject.mutate()}
                style={{
                  flex: 1,
                  minHeight: MIN_TOUCH_TARGET,
                  borderRadius: radii.field,
                  backgroundColor: reason.trim().length === 0 ? colors.line : colors.alert,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AppText weight="semibold" color={reason.trim().length === 0 ? colors.muted : colors.surface}>
                  {reject.isPending ? "جارٍ الرفض..." : "تأكيد الرفض"}
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setRejecting(false);
                  setReason("");
                }}
                style={{ minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.lg, justifyContent: "center" }}
              >
                <AppText color={colors.muted}>إلغاء</AppText>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <PrimaryButton label="موافقة" onPress={() => approve.mutate()} loading={approve.isPending} disabled={busy} style={{ flex: 1 }} />
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => setRejecting(true)}
              style={{
                flex: 1,
                minHeight: MIN_TOUCH_TARGET,
                borderRadius: radii.field,
                backgroundColor: colors.alertSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AppText weight="semibold" color={colors.alert}>
                رفض
              </AppText>
            </Pressable>
          </View>
        )
      ) : (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md, gap: 2 }}>
          <AppText size="small" weight="semibold" color={request.status === "REJECTED" ? colors.alert : colors.ink}>
            {request.status === "APPROVED" ? "وافق عليه" : "رفضه"} {request.decidedBy?.displayName ?? "موافِق سابق"}
            {request.decidedAt ? ` في ${dateFormat.format(new Date(request.decidedAt))}` : ""}
          </AppText>
          {request.reason ? (
            <AppText size="small" color={colors.muted}>
              {request.reason}
            </AppText>
          ) : null}
        </View>
      )}
    </View>
  );
}
