import { useEffect, useRef, useState } from "react";
import { I18nManager, Image, Linking, Modal, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { File } from "expo-file-system";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ApiError } from "@app/api-client";
import type { Attachment } from "@app/types";
import { useAuth } from "@/features/auth/auth-context";
import { API_BASE_URL, api } from "@/lib/api";
import { OVERSIZE_MESSAGE, pickAttachment } from "@/lib/pick-attachment";
import { indexFromOffset, resolveColumnOffsets } from "@/lib/status-pager";
import { t } from "@/theme/task-tokens";
import { AttachActionSheet } from "./task-sheets";
import { CloseButton, SectionHeader, TCard, TDialog, TText } from "./task-ui";

export const attachmentsKey = (cardId: string) => ["cardAttachments", cardId] as const;

const MAX_FILES = 10;
const PREVIEWABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const isImage = (a: Attachment) => PREVIEWABLE.has(a.mimeType);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1, dot + 5).toUpperCase() : "FILE";
}

/**
 * «المرفقات» (`Edit Task Prototype.dc.html`): one row per file — a badge with
 * its extension (a thumbnail for an image), name, size, ✕ — and «إرفاق ملف»,
 * which opens مكتبة الصور · التقاط صورة · اختيار ملف. An image opens the
 * full-screen viewer; any other file opens in the browser. Every member may
 * attach; the uploader or the task's owner deletes (`AttachmentsService`).
 * The section's ✕ only closes it while it is empty — the prototype's ✕ also
 * deleted every file, which here would take other people's files with it.
 */
export function TaskAttachments({
  cardId,
  readOnly,
  canManage,
  pickRequest,
  onCloseSection,
  onMutating,
}: {
  cardId: string;
  readOnly: boolean;
  canManage: boolean;
  /** Bumped when the section is opened from its chip — opens the picker. */
  pickRequest: number;
  onCloseSection: () => void;
  onMutating: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const attachments = useQuery({ queryKey: attachmentsKey(cardId), queryFn: () => api.attachments.list(cardId) });
  const [picking, setPicking] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Attachment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pickRequest > 0) setPicking(true);
  }, [pickRequest]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: attachmentsKey(cardId) });
    void queryClient.invalidateQueries({ queryKey: ["cardHistory", cardId] });
  }

  const upload = useMutation({
    // `expo/fetch` can't upload a `{ uri }` part — hand it the file's bytes.
    mutationFn: (file: { uri: string; name: string; type: string }) =>
      api.attachments.upload(cardId, { name: file.name, type: file.type, bytes: () => new File(file.uri).bytes() }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError && err.status === 413 ? OVERSIZE_MESSAGE : "تعذّر رفع الملف — حاول مرة أخرى"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.attachments.remove(cardId, id),
    onSuccess: () => {
      setDeleting(null);
      setViewerIndex(null);
      invalidate();
    },
  });

  const busy = upload.isPending || remove.isPending;
  useEffect(() => onMutating(busy), [busy, onMutating]);

  async function pick(source: "library" | "camera" | "file") {
    setPicking(false);
    const picked = await pickAttachment(source);
    if (picked === "oversize") setError(OVERSIZE_MESSAGE);
    else if (picked) upload.mutate(picked);
  }

  const items = attachments.data ?? [];
  const images = items.filter(isImage);
  const canDelete = (a: Attachment) => !readOnly && (a.uploader.id === user?.id || canManage);
  const viewed = viewerIndex !== null ? images[viewerIndex] : undefined;

  return (
    <TCard style={{ paddingTop: 12, paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
      <SectionHeader
        icon="attach"
        title="المرفقات"
        onClose={!readOnly && items.length === 0 && !upload.isPending ? onCloseSection : undefined}
        closeLabel="إغلاق المرفقات"
      />

      {items.map((attachment) => (
        <Pressable
          key={attachment.id}
          accessibilityRole="button"
          accessibilityLabel={attachment.fileName}
          onPress={() =>
            isImage(attachment)
              ? setViewerIndex(images.findIndex((i) => i.id === attachment.id))
              : void Linking.openURL(`${API_BASE_URL}${attachment.url}`)
          }
          style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderWidth: 1, borderColor: t.line, borderRadius: 10 }}
        >
          {isImage(attachment) ? (
            <Image source={{ uri: `${API_BASE_URL}${attachment.url}` }} style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: t.chip }} />
          ) : (
            <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: t.ink, alignItems: "center", justifyContent: "center" }}>
              <TText size={10} weight="bold" color={t.surface} lineHeight={14}>
                {extension(attachment.fileName)}
              </TText>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <TText size={13} weight="semibold" numberOfLines={1}>
              {attachment.fileName}
            </TText>
            <TText size={12} color={t.muted}>
              {formatSize(attachment.sizeBytes)}
            </TText>
          </View>
          {canDelete(attachment) ? (
            <CloseButton filled={false} onPress={() => setDeleting(attachment)} accessibilityLabel={`حذف ${attachment.fileName}`} />
          ) : null}
        </Pressable>
      ))}

      {upload.isPending ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderWidth: 1, borderColor: t.hairline, borderRadius: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: t.chip }} />
          <TText size={13} color={t.muted}>
            جارٍ رفع الملف…
          </TText>
        </View>
      ) : null}

      {error ? (
        <TText size={12} color={t.danger}>
          {error}
        </TText>
      ) : null}

      {!readOnly && items.length < MAX_FILES ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setPicking(true)}
          disabled={upload.isPending}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 42, borderRadius: 10, borderWidth: 1, borderColor: t.accentLine, backgroundColor: t.accentWash }}
        >
          <Ionicons name="add" size={16} color={t.accent} />
          <TText size={13} weight="semibold" color={t.accent}>
            إرفاق ملف
          </TText>
        </Pressable>
      ) : null}

      <AttachActionSheet visible={picking} onClose={() => setPicking(false)} onPick={(source) => void pick(source)} />

      <Modal visible={viewed !== undefined} transparent animationType="fade" onRequestClose={() => setViewerIndex(null)}>
        <View style={{ flex: 1, backgroundColor: t.ink }}>
          {viewed ? (
            <>
              <ImagePager images={images} index={viewerIndex!} onIndexChange={setViewerIndex} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20 }}>
                <TText size={13} color={t.surface}>
                  {viewed.uploader.displayName} · {new Date(viewed.createdAt).toLocaleDateString("ar-u-nu-latn", { day: "numeric", month: "long" })}
                </TText>
                {canDelete(viewed) ? (
                  <Pressable accessibilityRole="button" onPress={() => setDeleting(viewed)}>
                    <TText size={14} weight="semibold" color={t.dangerLine}>
                      حذف
                    </TText>
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="إغلاق"
                onPress={() => setViewerIndex(null)}
                style={{ position: "absolute", top: 50, start: 20, width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="close" size={26} color={t.surface} />
              </Pressable>
            </>
          ) : null}
        </View>
      </Modal>

      <TDialog visible={!!deleting} onClose={() => setDeleting(null)}>
        <TText size={18} weight="bold">
          حذف المرفق؟
        </TText>
        <TText size={14} color={t.ink3} lineHeight={24}>
          سيُحذف «{deleting?.fileName}» نهائيًا.
        </TText>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable accessibilityRole="button" onPress={() => setDeleting(null)} style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: t.canvas, alignItems: "center", justifyContent: "center" }}>
            <TText size={15} weight="semibold">
              إلغاء
            </TText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={remove.isPending}
            onPress={() => deleting && remove.mutate(deleting.id)}
            style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: t.danger, alignItems: "center", justifyContent: "center" }}
          >
            <TText size={15} weight="semibold" color={t.surface}>
              حذف
            </TText>
          </Pressable>
        </View>
      </TDialog>
    </TCard>
  );
}

/**
 * The viewer's horizontal pager: one full-width page per image. Offsets are
 * measured and resolved through `lib/status-pager.ts` — in RTL
 * `contentOffset.x` is not mirrored, so `index * width` would read the images
 * in reverse. Hidden until it has scrolled to the tapped image.
 */
function ImagePager({ images, index, onIndexChange }: { images: Attachment[]; index: number; onIndexChange: (index: number) => void }) {
  const { width } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);
  const measured = useRef<number[]>([]);
  const [offsets, setOffsets] = useState<number[]>([]);
  const positioned = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (positioned.current || offsets.length === 0) return;
    positioned.current = true;
    const x = offsets[index];
    if (x != null) pagerRef.current?.scrollTo({ x, animated: false });
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on the first resolved offsets
  }, [offsets]);

  return (
    <ScrollView
      ref={pagerRef}
      horizontal
      pagingEnabled
      style={{ flex: 1, opacity: ready ? 1 : 0 }}
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={(e) => {
        if (!positioned.current) return;
        const next = indexFromOffset(offsets, e.nativeEvent.contentOffset.x, index);
        if (next !== index) onIndexChange(next);
      }}
    >
      {images.map((attachment, pageIndex) => (
        <View
          key={attachment.id}
          style={{ width }}
          onLayout={(e) => {
            if (measured.current[pageIndex] === e.nativeEvent.layout.x) return;
            measured.current[pageIndex] = e.nativeEvent.layout.x;
            const resolved = resolveColumnOffsets(measured.current, images.length, width, I18nManager.isRTL);
            if (resolved) setOffsets(resolved);
          }}
        >
          <Image source={{ uri: `${API_BASE_URL}${attachment.url}` }} style={{ flex: 1 }} resizeMode="contain" />
        </View>
      ))}
    </ScrollView>
  );
}
