import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@app/api-client";
import type { BoardCategory } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { api } from "@/lib/api";
import { avatarColorFor } from "@/lib/avatar";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/*
 * Board categories («التصنيفات», `docs/17-board-categories.md`): the picker
 * the new-board sheet and board settings share, the create/rename sheet, and
 * the long-press actions on a section header of the boards list.
 */

export const BOARD_CATEGORIES_KEY = ["board-categories"] as const;

export function useBoardCategories() {
  return useQuery({ queryKey: BOARD_CATEGORIES_KEY, queryFn: () => api.boardCategories.list() });
}

/** Each category keeps one dot colour everywhere — the design's «● الجامع». */
export function categoryColor(categoryId: string): string {
  return avatarColorFor(categoryId).fg;
}

function categoryError(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) return "يوجد تصنيف بهذا الاسم.";
  if (err instanceof ApiError && err.status === 403) return "يعدّل التصنيفَ منشئُه أو المشرف فقط.";
  return "تعذّر الحفظ. تحقّق من اتصالك ثم أعد المحاولة.";
}

const fieldStyle = {
  minHeight: MIN_TOUCH_TARGET,
  borderWidth: 1,
  borderColor: colors.line,
  borderRadius: radii.field,
  paddingHorizontal: spacing.lg,
  fontFamily: fonts.regular,
  fontSize: fontSizes.body,
  color: colors.ink,
  textAlign: "right",
  writingDirection: "rtl",
} as const;

/**
 * The «التصنيف» row of the design's new-board sheet: the current choice with
 * its dot and «تغيير ▾», over the hint. Opens `CategoryPickerSheet`.
 */
export function CategoryField({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (categoryId: string | null) => void;
  disabled?: boolean;
}) {
  const categories = useBoardCategories();
  const [picking, setPicking] = useState(false);
  const current = value ? categories.data?.find((c) => c.id === value) : undefined;

  return (
    <View style={{ gap: spacing.sm }}>
      <AppText size="caption" weight="semibold" color={colors.muted}>
        التصنيف
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`التصنيف: ${current?.name ?? "بلا تصنيف"} — تغيير`}
        disabled={disabled}
        onPress={() => setPicking(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: MIN_TOUCH_TARGET,
          backgroundColor: colors.canvas,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radii.field,
          paddingHorizontal: spacing.lg,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          {current ? <Dot color={categoryColor(current.id)} /> : null}
          <AppText weight="semibold" color={current ? colors.ink : colors.muted}>
            {current?.name ?? "بلا تصنيف"}
          </AppText>
        </View>
        {disabled ? null : (
          <AppText size="small" color={colors.muted}>
            تغيير ▾
          </AppText>
        )}
      </Pressable>
      <AppText size="caption" color={colors.muted}>
        اختياري — يجمع اللوحات المتّصلة تحت عنوان واحد في قائمة اللوحات، كمشروع وأقسامه.
      </AppText>

      <CategoryPickerSheet
        visible={picking}
        value={value}
        onClose={() => setPicking(false)}
        onChange={(id) => {
          onChange(id);
          setPicking(false);
        }}
      />
    </View>
  );
}

/**
 * «بلا تصنيف», every category by name, and «تصنيف جديد» — which expands into
 * a name field in place, creates the category and picks it in one step.
 */
export function CategoryPickerSheet({
  visible,
  value,
  onClose,
  onChange,
}: {
  visible: boolean;
  value: string | null;
  onClose: () => void;
  onChange: (categoryId: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const categories = useBoardCategories();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) {
      setAdding(false);
      setName("");
      setError(null);
    }
  }, [visible]);

  const create = useMutation({
    mutationFn: (newName: string) => api.boardCategories.create({ name: newName }),
    onSuccess: (category) => {
      queryClient.setQueryData<BoardCategory[]>(BOARD_CATEGORIES_KEY, (old) =>
        old ? [...old, category].sort((a, b) => a.name.localeCompare(b.name, "ar")) : [category],
      );
      onChange(category.id);
    },
    onError: (err) => setError(categoryError(err)),
  });

  const trimmed = name.trim();
  function submit() {
    if (trimmed && !create.isPending) create.mutate(trimmed);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: spacing.xs }}>
        <AppText weight="bold" size="title" style={{ marginBottom: spacing.sm }}>
          التصنيف
        </AppText>

        <Option label="بلا تصنيف" selected={value === null} onPress={() => onChange(null)} />
        {(categories.data ?? []).map((category) => (
          <Option
            key={category.id}
            label={category.name}
            dotColor={categoryColor(category.id)}
            selected={value === category.id}
            onPress={() => onChange(category.id)}
          />
        ))}
        {categories.isError ? (
          <AppText size="small" color={colors.alert}>
            تعذّر تحميل التصنيفات.
          </AppText>
        ) : null}

        {adding ? (
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <TextInput
                ref={nameRef}
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  setError(null);
                }}
                onSubmitEditing={submit}
                returnKeyType="done"
                submitBehavior="submit"
                maxLength={60}
                placeholder="اسم التصنيف، مثل: الجامع"
                placeholderTextColor={colors.muted}
                style={[fieldStyle, { flex: 1 }]}
              />
              <Pressable
                accessibilityRole="button"
                disabled={!trimmed || create.isPending}
                onPress={submit}
                style={{
                  minHeight: MIN_TOUCH_TARGET,
                  paddingHorizontal: spacing.lg,
                  borderRadius: radii.field,
                  backgroundColor: trimmed ? colors.accent : colors.line,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AppText weight="semibold" color={trimmed ? colors.surface : colors.muted}>
                  {create.isPending ? "..." : "إضافة"}
                </AppText>
              </Pressable>
            </View>
            {error ? (
              <AppText size="small" color={colors.alert}>
                {error}
              </AppText>
            ) : null}
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setAdding(true);
              setTimeout(() => nameRef.current?.focus(), 50);
            }}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: MIN_TOUCH_TARGET }}
          >
            <AppText weight="semibold" color={colors.accent}>
              + تصنيف جديد
            </AppText>
          </Pressable>
        )}
      </View>
    </BottomSheet>
  );
}

/** Create («تصنيف جديد» at the foot of the boards list) or rename. */
export function CategoryNameSheet({
  visible,
  category,
  onClose,
}: {
  visible: boolean;
  /** Renames this one; omitted, the sheet creates a new category. */
  category?: { id: string; name: string };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setName(category?.name ?? "");
      setError(null);
    }
  }, [visible, category]);

  const save = useMutation({
    mutationFn: (newName: string) =>
      category ? api.boardCategories.rename(category.id, { name: newName }) : api.boardCategories.create({ name: newName }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BOARD_CATEGORIES_KEY });
      // Every board summary embeds its category's name.
      if (category) void queryClient.invalidateQueries({ queryKey: ["boards"] });
      onClose();
    },
    onError: (err) => setError(categoryError(err)),
  });

  const trimmed = name.trim();
  const canSave = !!trimmed && trimmed !== category?.name && !save.isPending;
  function submit() {
    if (canSave) save.mutate(trimmed);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} onShow={() => setTimeout(() => nameRef.current?.focus(), 250)}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.lg, paddingBottom: spacing.sm }}>
        <View style={{ gap: spacing.xs }}>
          <AppText weight="bold" size="title">
            {category ? "إعادة تسمية التصنيف" : "تصنيف جديد"}
          </AppText>
          {category ? null : (
            <AppText size="small" color={colors.muted}>
              يظهر عنوانًا في قائمة اللوحات، وتضع اللوحات تحته من «إعدادات اللوحة» أو عند إنشائها.
            </AppText>
          )}
        </View>
        <TextInput
          ref={nameRef}
          value={name}
          onChangeText={(text) => {
            setName(text);
            setError(null);
          }}
          onSubmitEditing={submit}
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          maxLength={60}
          placeholder="اسم التصنيف، مثل: الجامع"
          placeholderTextColor={colors.muted}
          style={fieldStyle}
        />
        {error ? (
          <AppText size="small" color={colors.alert}>
            {error}
          </AppText>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={!canSave}
          onPress={submit}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: radii.field,
            backgroundColor: canSave ? colors.accent : colors.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText weight="semibold" color={canSave ? colors.surface : colors.muted}>
            {save.isPending ? "جارٍ الحفظ..." : category ? "حفظ الاسم" : "إنشاء التصنيف"}
          </AppText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

/** Long-press on a section header: rename or delete, for the creator or an admin. */
export function CategoryActionsSheet({
  visible,
  category,
  boardCount,
  onClose,
  onRename,
  onDelete,
}: {
  visible: boolean;
  category: { id: string; name: string } | null;
  boardCount: number;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: spacing.xs }}>
        <AppText weight="bold" size="title" style={{ marginBottom: spacing.sm }}>
          {category?.name ?? ""}
        </AppText>
        <ActionRow icon="create-outline" label="إعادة التسمية" onPress={onRename} />
        <ActionRow
          icon="trash-outline"
          label="حذف التصنيف"
          hint={boardCount > 0 ? "تبقى لوحاته كما هي، وتنتقل إلى «بلا تصنيف»." : undefined}
          destructive
          onPress={onDelete}
        />
      </View>
    </BottomSheet>
  );
}

function ActionRow({
  icon,
  label,
  hint,
  destructive,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  hint?: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  const color = destructive ? colors.alert : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: MIN_TOUCH_TARGET + 4 }}
    >
      <Ionicons name={icon} size={20} color={color} />
      <View style={{ flex: 1 }}>
        <AppText weight="semibold" color={color}>
          {label}
        </AppText>
        {hint ? (
          <AppText size="caption" color={colors.muted}>
            {hint}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

function Option({
  label,
  dotColor,
  selected,
  onPress,
}: {
  label: string;
  dotColor?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: MIN_TOUCH_TARGET + 4,
        paddingHorizontal: spacing.lg,
        borderRadius: radii.field,
        backgroundColor: selected ? colors.accentSoft : "transparent",
      }}
    >
      {dotColor ? <Dot color={dotColor} /> : <Dot color={colors.line} />}
      <AppText weight={selected ? "bold" : "regular"} style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </AppText>
      {selected ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
    </Pressable>
  );
}

export function Dot({ color }: { color: string }) {
  return <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: color }} />;
}
