import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Template } from "@app/types";
import { AppText } from "@/components/text";
import { BottomSheet } from "@/components/bottom-sheet";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { api } from "@/lib/api";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/** §3c-3 "إعدادات اللوحة: قسم «قوالب المهام»" — owner-only rename/delete list. Creating a template happens from card detail's «حفظ كقالب». */
export function TemplatesSection({ boardId }: { boardId: string }) {
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: ["templates", boardId], queryFn: () => api.templates.list(boardId) });

  const [renaming, setRenaming] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["templates", boardId] });
  }

  const rename = useMutation({
    mutationFn: (input: { id: string; name: string }) => api.templates.update(boardId, input.id, { name: input.name }),
    onSuccess: () => {
      setRenaming(null);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (templateId: string) => api.templates.remove(boardId, templateId),
    onSuccess: () => {
      setDeleting(null);
      invalidate();
    },
  });

  const list = templates.data ?? [];

  return (
    <View style={{ gap: spacing.sm }}>
      <AppText size="caption" weight="semibold" color={colors.muted}>
        قوالب المهام
      </AppText>

      {list.length === 0 ? (
        <AppText size="small" color={colors.muted}>
          لا قوالب — احفظ أي مهمة كقالب من تفاصيلها.
        </AppText>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {list.map((template) => (
            <View
              key={template.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                padding: spacing.md,
                backgroundColor: colors.canvas,
                borderRadius: radii.card,
              }}
            >
              <View style={{ flex: 1 }}>
                <AppText weight="semibold" size="small">
                  {template.name}
                </AppText>
                <AppText size="caption" color={colors.muted}>
                  {template.subtaskTitles.length} مهام فرعية
                </AppText>
              </View>
              <Pressable accessibilityRole="button" onPress={() => setRenaming(template)} hitSlop={8}>
                <AppText size="caption" weight="semibold" color={colors.accent}>
                  إعادة تسمية
                </AppText>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setDeleting(template)} hitSlop={8}>
                <AppText size="caption" weight="semibold" color={colors.alert}>
                  حذف
                </AppText>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <RenameTemplateSheet
        visible={!!renaming}
        initialName={renaming?.name ?? ""}
        saving={rename.isPending}
        onClose={() => setRenaming(null)}
        onSave={(name) => {
          if (renaming) rename.mutate({ id: renaming.id, name });
        }}
      />

      <ConfirmSheet
        visible={!!deleting}
        onClose={() => setDeleting(null)}
        title="حذف القالب"
        consequence={deleting ? `سيتم حذف قالب «${deleting.name}» نهائيًا. لا يمكن التراجع.` : ""}
        confirmLabel="حذف"
        confirming={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </View>
  );
}

function RenameTemplateSheet({
  visible,
  initialName,
  saving,
  onClose,
  onSave,
}: {
  visible: boolean;
  initialName: string;
  saving?: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (visible) setName(initialName);
  }, [visible, initialName]);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.sm }}>
        <AppText weight="bold" size="title">
          إعادة تسمية القالب
        </AppText>
        <TextInput
          value={name}
          onChangeText={setName}
          autoFocus
          style={{
            minHeight: MIN_TOUCH_TARGET,
            backgroundColor: colors.canvas,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radii.field,
            paddingHorizontal: spacing.md,
            fontFamily: fonts.regular,
            fontSize: fontSizes.body,
            color: colors.ink,
            textAlign: "right",
            writingDirection: "rtl",
          }}
        />
        <Pressable
          accessibilityRole="button"
          disabled={name.trim().length === 0 || saving}
          onPress={() => onSave(name.trim())}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: radii.field,
            backgroundColor: name.trim().length === 0 ? colors.line : colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText weight="semibold" color={colors.surface}>
            {saving ? "جارٍ الحفظ..." : "حفظ"}
          </AppText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
