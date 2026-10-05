import { useEffect, useRef, useState } from "react";
import { I18nManager, Image, Linking, Modal, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { ApiError } from "@app/api-client";
import type { Attachment } from "@app/types";
import { AppText } from "@/components/text";
import { BottomSheet } from "@/components/bottom-sheet";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { Skeleton } from "@/components/skeleton";
import { API_BASE_URL, api } from "@/lib/api";
import { indexFromOffset, resolveColumnOffsets } from "@/lib/status-pager";
import { MIN_TOUCH_TARGET, colors, radii, spacing } from "@/theme/tokens";

const COLUMNS = 3;
const GAP = spacing.sm;

/** Mirrors `MAX_ATTACHMENT_BYTES` in `apps/api/src/cards/attachments.service.ts`. */
const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;
const OVERSIZE_MESSAGE = "حجم الملف يتجاوز 30MB";

/** Only these render as a thumbnail/viewer; every other attachment is a file row that opens externally. */
const PREVIEWABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const isPreviewableImage = (attachment: Attachment) => PREVIEWABLE_IMAGE_TYPES.has(attachment.mimeType);

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * "المرفقات" (`design-prompt-group-3.md` §3a-4), extended to any file type: a
 * 3-column thumbnail grid for images + a "+" tile (camera / library / any
 * file), a full-screen image viewer that swipes between a card's images, file rows for everything else (tap opens
 * it in the system browser, which downloads it), and the
 * أي نوع ملف · حتى 10 · 30MB caption. Deleting an image is the viewer's
 * «حذف»; a file row has its own ✕ — both go through `ConfirmSheet`.
 */
export function AttachmentsSection({ cardId, readOnly = false }: { cardId: string; readOnly?: boolean }) {
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
    // `expo/fetch` (the global fetch since SDK 57) can't upload a `{ uri }`
    // part — hand it the bytes read from the picked file instead.
    mutationFn: ({ uri, name, type }: { uri: string; name: string; type: string }) =>
      api.attachments.upload(cardId, { name, type, bytes: () => new File(uri).bytes() }),
    onSuccess: () => {
      setUploadError(null);
      invalidate();
    },
    onError: (err) =>
      setUploadError(
        err instanceof ApiError && err.status === 413 ? OVERSIZE_MESSAGE : "تعذّر رفع الملف — إعادة المحاولة",
      ),
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

  async function pickFile() {
    setPickerOpen(false);
    // Copied into the cache dir so React Native's FormData can read it (a raw
    // `content://` URI from the system picker is not reliably uploadable).
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return;

    const asset = result.assets[0]!;
    if (asset.size != null && asset.size > MAX_ATTACHMENT_BYTES) {
      setUploadError(OVERSIZE_MESSAGE);
      return;
    }
    upload.mutate({
      uri: asset.uri,
      name: asset.name,
      type: asset.mimeType ?? "application/octet-stream",
    });
  }

  const items = attachments.data ?? [];
  const images = items.filter(isPreviewableImage);
  const files = items.filter((attachment) => !isPreviewableImage(attachment));
  const atLimit = items.length >= 10;
  const thumbSize = `${100 / COLUMNS}%` as const;
  const viewed = viewerIndex !== null ? images[viewerIndex] : undefined;

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
        <>
          {files.length > 0 ? (
            <View style={{ gap: GAP }}>
              {files.map((attachment) => (
                <Pressable
                  key={attachment.id}
                  accessibilityRole="button"
                  onPress={() => void Linking.openURL(`${API_BASE_URL}${attachment.url}`)}
                  style={{
                    minHeight: MIN_TOUCH_TARGET,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    paddingHorizontal: spacing.md,
                    borderRadius: radii.field,
                    backgroundColor: colors.canvas,
                  }}
                >
                  <AppText>📄</AppText>
                  <View style={{ flex: 1 }}>
                    <AppText size="small" weight="semibold" numberOfLines={1}>
                      {attachment.fileName}
                    </AppText>
                    <AppText size="caption" color={colors.muted}>
                      {formatFileSize(attachment.sizeBytes)} · {attachment.uploader.displayName}
                    </AppText>
                  </View>
                  {!readOnly ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="حذف المرفق"
                      hitSlop={spacing.md}
                      onPress={() => setDeleting(attachment)}
                    >
                      <AppText color={colors.alert}>✕</AppText>
                    </Pressable>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -GAP / 2 }}>
            {images.map((attachment, index) => (
              <View key={attachment.id} style={{ width: thumbSize, padding: GAP / 2 }}>
                <Pressable
                  onPress={() => setViewerIndex(index)}
                  style={{ aspectRatio: 1, borderRadius: radii.card, overflow: "hidden", backgroundColor: colors.canvas }}
                >
                  <Image source={{ uri: `${API_BASE_URL}${attachment.url}` }} style={{ width: "100%", height: "100%" }} />
                </Pressable>
              </View>
            ))}
            {!atLimit && !readOnly ? (
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
        </>
      )}

      {uploadError ? (
        <Pressable onPress={() => setUploadError(null)}>
          <AppText size="small" color={colors.alert}>
            {uploadError}
          </AppText>
        </Pressable>
      ) : null}

      <AppText size="caption" color={colors.muted}>
        أي نوع ملف · حتى 10 · 30MB للملف
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
          <Pressable
            accessibilityRole="button"
            onPress={pickFile}
            style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
          >
            <AppText weight="semibold">ملف</AppText>
          </Pressable>
        </View>
      </BottomSheet>

      <Modal visible={viewed !== undefined} transparent animationType="fade" onRequestClose={() => setViewerIndex(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)" }}>
          {viewed ? (
            <>
              <ImagePager images={images} index={viewerIndex!} onIndexChange={setViewerIndex} />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: spacing.xl,
                }}
              >
                <AppText color={colors.surface} size="small">
                  {viewed.uploader.displayName} ·{" "}
                  {new Date(viewed.createdAt).toLocaleDateString("ar", { dateStyle: "medium" })}
                </AppText>
                {!readOnly ? (
                  <Pressable accessibilityRole="button" onPress={() => setDeleting(viewed)}>
                    <AppText color={colors.alert} weight="semibold">
                      حذف
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
              {images.length > 1 ? (
                <View pointerEvents="none" style={{ position: "absolute", top: 50, right: spacing.xl }}>
                  <AppText color={colors.surface} size="small" weight="semibold">
                    {viewerIndex! + 1} من {images.length}
                  </AppText>
                </View>
              ) : null}
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
        consequence="سيتم حذف هذا المرفق نهائيًا."
        confirmLabel="حذف"
        confirming={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </View>
  );
}

/**
 * The viewer's horizontal pager: one full-width page per image, swiped with
 * `pagingEnabled`. Page offsets are *measured* and resolved through
 * `lib/status-pager.ts`, like the board's status pager — in RTL
 * `contentOffset.x` is not mirrored, so `index * width` would read the images
 * in reverse. Mounted per opening, so it starts on the tapped image; hidden
 * until it has scrolled there, so the first image never flashes first.
 */
function ImagePager({
  images,
  index,
  onIndexChange,
}: {
  images: Attachment[];
  index: number;
  onIndexChange: (index: number) => void;
}) {
  const { width } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);
  const measuredOffsets = useRef<number[]>([]);
  const [pageOffsets, setPageOffsets] = useState<number[]>([]);
  const positioned = useRef(false);
  const [ready, setReady] = useState(false);

  function handlePageLayout(pageIndex: number, x: number) {
    if (measuredOffsets.current[pageIndex] === x) return;
    measuredOffsets.current[pageIndex] = x;
    const resolved = resolveColumnOffsets(measuredOffsets.current, images.length, width, I18nManager.isRTL);
    if (resolved) setPageOffsets(resolved);
  }

  useEffect(() => {
    if (positioned.current || pageOffsets.length === 0) return;
    positioned.current = true;
    const x = pageOffsets[index];
    if (x != null) pagerRef.current?.scrollTo({ x, animated: false });
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on the first resolved offsets
  }, [pageOffsets]);

  return (
    <ScrollView
      ref={pagerRef}
      horizontal
      pagingEnabled
      style={{ flex: 1, opacity: ready ? 1 : 0 }}
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={(e) => {
        // Ignore the scroll events from before the jump to the tapped image.
        if (!positioned.current) return;
        const next = indexFromOffset(pageOffsets, e.nativeEvent.contentOffset.x, index);
        if (next !== index) onIndexChange(next);
      }}
    >
      {images.map((attachment, pageIndex) => (
        <View
          key={attachment.id}
          style={{ width }}
          onLayout={(e) => handlePageLayout(pageIndex, e.nativeEvent.layout.x)}
        >
          <Image source={{ uri: `${API_BASE_URL}${attachment.url}` }} style={{ flex: 1 }} resizeMode="contain" />
        </View>
      ))}
    </ScrollView>
  );
}
