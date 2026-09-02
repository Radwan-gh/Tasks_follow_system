import { useState } from "react";
import { Image, Modal, Pressable, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import type { Attachment } from "@app/types";
import { AppText } from "@/components/text";
import { BottomSheet } from "@/components/bottom-sheet";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { Skeleton } from "@/components/skeleton";
import { API_BASE_URL, api } from "@/lib/api";
import { MIN_TOUCH_TARGET, colors, radii, spacing } from "@/theme/tokens";

const COLUMNS = 3;
const GAP = spacing.sm;

/**
 * "المرفقات" (`design-prompt-group-3.md` §3a-4): a 3-column thumbnail grid +
 * "+" tile (camera/library choice), a full-screen viewer, and the
 * صور فقط · حتى 10 · 5MB caption. Deleting is long-press → `ConfirmSheet`.
 */
export function AttachmentsSection({ cardId }: { cardId: string }) {
  const queryClient = useQueryClient();
  const attachments = useQuery({
    queryKey: ["cardAttachments", cardId],
    queryFn: () => api.attachments.list(cardId),
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Attachment | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["cardAttachments", cardId] });
  }

  const upload = useMutation({
    mutationFn: (file: { uri: string; name: string; type: string }) => api.attachments.upload(cardId, file),
    onSuccess: () => {
      setUploadError(null);
      invalidate();
    },
    onError: () => setUploadError("تعذّر رفع الصورة — إعادة المحاولة"),
  });

  const remove = useMutation({
    mutationFn: (attachmentId: string) => api.attachments.remove(cardId, attachmentId),
    onSuccess: () => {
      setDeleting(null);
      setViewerIndex(null);
      invalidate();
    },
  });

  async function pickFrom(source: "camera" | "library") {
    setPickerOpen(false);
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled) return;

    const asset = result.assets[0]!;
    upload.mutate({
      uri: asset.uri,
      name: asset.fileName ?? "photo.jpg",
      type: asset.mimeType ?? "image/jpeg",
    });
  }

  const items = attachments.data ?? [];
  const atLimit = items.length >= 10;
  const thumbSize = `${100 / COLUMNS}%` as const;

  return (
    <View style={{ gap: spacing.sm }}>
      <AppText size="caption" weight="semibold" color={colors.muted}>
        المرفقات
      </AppText>

      {attachments.isPending ? (
        <View style={{ flexDirection: "row", gap: GAP }}>
          <Skeleton height={90} style={{ flex: 1 }} radius={radii.card} />
          <Skeleton height={90} style={{ flex: 1 }} radius={radii.card} />
          <Skeleton height={90} style={{ flex: 1 }} radius={radii.card} />
        </View>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -GAP / 2 }}>
          {items.map((attachment, index) => (
            <View key={attachment.id} style={{ width: thumbSize, padding: GAP / 2 }}>
              <Pressable
                onPress={() => setViewerIndex(index)}
                style={{ aspectRatio: 1, borderRadius: radii.card, overflow: "hidden", backgroundColor: colors.canvas }}
              >
                <Image source={{ uri: `${API_BASE_URL}${attachment.url}` }} style={{ width: "100%", height: "100%" }} />
              </Pressable>
            </View>
          ))}
          {!atLimit ? (
            <View style={{ width: thumbSize, padding: GAP / 2 }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPickerOpen(true)}
                disabled={upload.isPending}
                style={{
                  aspectRatio: 1,
                  borderRadius: radii.card,
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: colors.line,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AppText size="title" color={colors.muted}>
                  {upload.isPending ? "…" : "+"}
                </AppText>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}

      {uploadError ? (
        <Pressable onPress={() => setUploadError(null)}>
          <AppText size="small" color={colors.alert}>
            {uploadError}
          </AppText>
        </Pressable>
      ) : null}

      <AppText size="caption" color={colors.muted}>
        صور فقط · حتى 10 · 5MB للصورة
      </AppText>

      <BottomSheet visible={pickerOpen} onClose={() => setPickerOpen(false)}>
        <View style={{ paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.sm }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => pickFrom("camera")}
            style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
          >
            <AppText weight="semibold">الكاميرا</AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => pickFrom("library")}
            style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
          >
            <AppText weight="semibold">المعرض</AppText>
          </Pressable>
        </View>
      </BottomSheet>

      <Modal visible={viewerIndex !== null} transparent animationType="fade" onRequestClose={() => setViewerIndex(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)" }}>
          {viewerIndex !== null && items[viewerIndex] ? (
            <>
              <Image
                source={{ uri: `${API_BASE_URL}${items[viewerIndex]!.url}` }}
                style={{ flex: 1 }}
                resizeMode="contain"
              />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: spacing.xl,
                }}
              >
                <AppText color={colors.surface} size="small">
                  {items[viewerIndex]!.uploader.displayName} ·{" "}
                  {new Date(items[viewerIndex]!.createdAt).toLocaleDateString("ar", { dateStyle: "medium" })}
                </AppText>
                <Pressable accessibilityRole="button" onPress={() => setDeleting(items[viewerIndex]!)}>
                  <AppText color={colors.alert} weight="semibold">
                    حذف
                  </AppText>
                </Pressable>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setViewerIndex(null)}
                style={{ position: "absolute", top: 50, left: spacing.xl }}
              >
                <AppText color={colors.surface} size="title">
                  ✕
                </AppText>
              </Pressable>
            </>
          ) : null}
        </View>
      </Modal>

      <ConfirmSheet
        visible={!!deleting}
        onClose={() => setDeleting(null)}
        title="حذف المرفق"
        consequence="سيتم حذف هذه الصورة نهائيًا."
        confirmLabel="حذف"
        confirming={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </View>
  );
}
