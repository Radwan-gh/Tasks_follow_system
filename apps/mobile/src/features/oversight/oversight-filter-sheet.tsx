import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import type { ListStatusCategory, OversightBoard, OversightUser } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

export interface OversightFilter {
  assigneeId: string | null;
  boardId: string | null;
  statusCategory: ListStatusCategory | null;
  includeCompleted: boolean;
}

export const EMPTY_OVERSIGHT_FILTER: OversightFilter = {
  assigneeId: null,
  boardId: null,
  statusCategory: null,
  includeCompleted: false,
};

export function isOversightFilterActive(filter: OversightFilter): boolean {
  return !!filter.assigneeId || !!filter.boardId || !!filter.statusCategory || filter.includeCompleted;
}

export const STATUS_LABELS: Record<ListStatusCategory, string> = {
  NEW: "جديد",
  READY: "جاهز",
  IN_PROGRESS: "قيد التنفيذ",
  REVIEW: "مراجعة",
  DONE: "منجز",
  CLOSED: "انتهى",
};

const STATUSES: ListStatusCategory[] = ["NEW", "READY", "IN_PROGRESS", "DONE", "CLOSED"];

/** Above this many people, the chip wall needs a search box in front of it. */
const SEARCH_THRESHOLD = 6;

/**
 * «المتابعة» task filters — one pick each for assignee, board and status.
 * Applied live by the caller, like `BoardFilterSheet`.
 */
export function OversightFilterSheet({
  visible,
  onClose,
  value,
  onChange,
  users,
  boards,
}: {
  visible: boolean;
  onClose: () => void;
  value: OversightFilter;
  onChange: (next: OversightFilter) => void;
  users: OversightUser[];
  boards: OversightBoard[];
}) {
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  // The picked person always stays on screen, so a search never hides an active filter.
  const visibleUsers = useMemo(
    () =>
      term
        ? users.filter(
            (u) =>
              u.id === value.assigneeId ||
              u.displayName.toLowerCase().includes(term) ||
              u.username.toLowerCase().includes(term),
          )
        : users,
    [users, term, value.assigneeId],
  );

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.lg, paddingBottom: spacing.md }}>
        <AppText weight="bold" size="title">
          ترشيح المهام
        </AppText>

        <Section title="المسؤول">
          {users.length >= SEARCH_THRESHOLD ? (
            <TextInput
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="ابحث عن شخص"
              placeholderTextColor={colors.muted}
              accessibilityLabel="ابحث عن شخص"
              style={{
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
              }}
            />
          ) : null}
          <ChipRow>
            {visibleUsers.map((u) => (
              <Chip
                key={u.id}
                label={u.displayName}
                active={value.assigneeId === u.id}
                onPress={() => onChange({ ...value, assigneeId: value.assigneeId === u.id ? null : u.id })}
              />
            ))}
          </ChipRow>
        </Section>

        <Section title="اللوحة">
          <ChipRow>
            {boards.map((b) => (
              <Chip
                key={b.id}
                label={b.name}
                active={value.boardId === b.id}
                onPress={() => onChange({ ...value, boardId: value.boardId === b.id ? null : b.id })}
              />
            ))}
          </ChipRow>
        </Section>

        <Section title="الحالة">
          <ChipRow>
            {STATUSES.map((s) => (
              <Chip
                key={s}
                label={STATUS_LABELS[s]}
                active={value.statusCategory === s}
                onPress={() => onChange({ ...value, statusCategory: value.statusCategory === s ? null : s })}
              />
            ))}
          </ChipRow>
        </Section>

        {!value.statusCategory ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: value.includeCompleted }}
            onPress={() => onChange({ ...value, includeCompleted: !value.includeCompleted })}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: MIN_TOUCH_TARGET }}
          >
            <AppText weight="semibold">إظهار المكتملة</AppText>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                backgroundColor: value.includeCompleted ? colors.accent : "transparent",
                borderWidth: value.includeCompleted ? 0 : 1.5,
                borderColor: colors.line,
              }}
            />
          </Pressable>
        ) : null}

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          {isOversightFilterActive(value) ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onChange(EMPTY_OVERSIGHT_FILTER)}
              style={{
                flex: 1,
                minHeight: MIN_TOUCH_TARGET,
                borderRadius: radii.field,
                borderWidth: 1,
                borderColor: colors.line,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AppText weight="semibold">مسح التصفية</AppText>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={{
              flex: 1,
              minHeight: MIN_TOUCH_TARGET,
              borderRadius: radii.field,
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AppText weight="semibold" color={colors.surface}>
              تم
            </AppText>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText size="caption" weight="semibold" color={colors.muted}>
        {title}
      </AppText>
      {children}
    </View>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>{children}</View>;
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radii.chip,
        backgroundColor: active ? colors.accent : colors.canvas,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.line,
      }}
    >
      <AppText size="small" weight="semibold" color={active ? colors.surface : colors.ink}>
        {label}
      </AppText>
    </Pressable>
  );
}
