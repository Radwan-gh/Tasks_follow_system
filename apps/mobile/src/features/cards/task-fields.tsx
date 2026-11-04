import type { ComponentProps, ReactNode } from "react";
import { Pressable, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { BoardMember, CardPriority, ListStatusCategory } from "@app/types";
import { priorityLabel } from "@/components/priority-control";
import { AppText } from "@/components/text";
import { formatDueLong, isOverdue } from "@/lib/date";
import { avatarColorFor } from "@/lib/avatar";
import { initials } from "@/lib/initials";
import { MIN_TOUCH_TARGET, colors, radii, spacing, statusColors, statusPillColors } from "@/theme/tokens";

/**
 * The task screen's row kit (`Tasks Mobile Redesign.dc.html` 6a «إضافة مهمة»
 * and 6b «تعديل مهمة»). Both screens are built from the same pieces in the
 * same places — that sameness is the point of the redesign: no text label
 * above any field, an icon in a fixed column instead, and the value itself
 * saying what the field is.
 */

export type IconName = ComponentProps<typeof Ionicons>["name"];

/** The icon for each field — one place, so a field looks the same on both screens. */
export const FIELD_ICONS = {
  status: "radio-button-on-outline",
  assignees: "person-outline",
  due: "time-outline",
  priority: "flag-outline",
  subtasks: "checkbox-outline",
  attachments: "attach-outline",
  access: "lock-closed-outline",
  recurrence: "repeat-outline",
  cost: "cash-outline",
  boards: "albums-outline",
} as const satisfies Record<string, IconName>;

/** A rounded white group. 6a gives every row its own; 6b stacks rows in one with hairlines between. */
export function FieldCard({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 20,
        overflow: "hidden",
      }}
    >
      {children}
    </View>
  );
}

/** One field: the icon column, then its value. Tapping the row opens that field's own sheet. */
export function FieldRow({
  icon,
  children,
  onPress,
  divider = false,
  accessibilityLabel,
  minHeight = 54,
}: {
  icon: IconName | ReactNode;
  children: ReactNode;
  onPress?: () => void;
  /** A hairline under the row — every row but a group's last. */
  divider?: boolean;
  accessibilityLabel?: string;
  minHeight?: number;
}) {
  const content = (
    <>
      <View style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
        {typeof icon === "string" ? <Ionicons name={icon as IconName} size={18} color={colors.muted} /> : icon}
      </View>
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm }}>
        {children}
      </View>
    </>
  );
  const style = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.md,
    minHeight,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderBottomWidth: divider ? 1 : 0,
    borderBottomColor: colors.hairline,
  };
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [style, pressed ? { backgroundColor: colors.canvas } : null]}
    >
      {content}
    </Pressable>
  );
}

/** «قيد التنفيذ ▾» — the status pill, its colour from the status. */
export function StatusPill({
  name,
  category,
  editable,
}: {
  name: string;
  category: ListStatusCategory | null | undefined;
  editable: boolean;
}) {
  const key = category ?? "UNCATEGORIZED";
  const palette = statusPillColors[key];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: palette.bg,
        borderRadius: radii.chip,
        paddingVertical: 7,
        paddingHorizontal: spacing.md,
      }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: statusColors[key] }} />
      <AppText size="small" weight="semibold" color={palette.fg} style={{ lineHeight: 18 }}>
        {name}
        {editable ? " ▾" : ""}
      </AppText>
    </View>
  );
}

export type PillTone = "neutral" | "alert" | "urgent" | "accent";

const PILL_TONES: Record<PillTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.chip, fg: colors.ink },
  alert: { bg: colors.alertSoft, fg: colors.alert },
  urgent: { bg: colors.urgentSoft, fg: colors.urgent },
  accent: { bg: colors.accentSoft, fg: colors.link },
};

/** A field's value as a pill — «الثلاثاء 12 مايو · متأخرة», «! عاجل». */
export function ValuePill({ text, tone = "neutral" }: { text: string; tone?: PillTone }) {
  const palette = PILL_TONES[tone];
  return (
    <View style={{ backgroundColor: palette.bg, borderRadius: radii.chip, paddingVertical: 7, paddingHorizontal: spacing.md }}>
      <AppText size="small" weight="semibold" color={palette.fg} style={{ lineHeight: 18 }}>
        {text}
      </AppText>
    </View>
  );
}

export interface AvatarMember {
  userId: string;
  user: { displayName: string; firstName?: string; lastName?: string; isActive?: boolean };
}

export function MemberAvatar({ member, size = 26 }: { member: AvatarMember; size?: number }) {
  const palette = avatarColorFor(member.userId);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: palette.bg,
        alignItems: "center",
        justifyContent: "center",
        opacity: member.user.isActive === false ? 0.5 : 1,
      }}
    >
      <AppText weight="bold" color={palette.fg} style={{ fontSize: size >= 32 ? 11 : 10, lineHeight: size * 0.6 }}>
        {initials(member.user)}
      </AppText>
    </View>
  );
}

/** «ر.غ رضوان» — a picked person: avatar, then «أنت» or their first name. */
export function PersonPill({ member, isMe }: { member: BoardMember; isMe: boolean }) {
  const name = isMe ? "أنت" : member.user.firstName || member.user.displayName;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: colors.chip,
        borderRadius: radii.chip,
        paddingVertical: 4,
        paddingStart: spacing.md,
        paddingEnd: 4,
      }}
    >
      <MemberAvatar member={member} />
      <AppText size="small" weight="semibold" style={{ lineHeight: 18 }}>
        {name}
      </AppText>
      {!member.user.isActive ? (
        <AppText size="caption" weight="semibold" color={colors.alert} style={{ lineHeight: 16 }}>
          معطَّل
        </AppText>
      ) : null}
    </View>
  );
}

/** «الثلاثاء 12 مايو · متأخرة» — red once the day has passed. */
export function DuePill({ iso }: { iso: string }) {
  const overdue = isOverdue(iso);
  return <ValuePill text={overdue ? `${formatDueLong(iso)} · متأخرة` : formatDueLong(iso)} tone={overdue ? "alert" : "neutral"} />;
}

/** «! عاجل» in the urgent colour; «منخفض» plain. «عادي» is the default and has no row. */
export function PriorityPill({ priority }: { priority: CardPriority }) {
  return priority === "URGENT" ? <ValuePill text="! عاجل" tone="urgent" /> : <ValuePill text={priorityLabel(priority)} />;
}

/** The ✕ at the end of an optional row: clears the field and puts its chip back. */
export function RowRemove({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`إزالة ${label}`}
      onPress={onPress}
      hitSlop={6}
      style={{ marginStart: "auto", width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
    >
      <Ionicons name="close" size={16} color={colors.faint} />
    </Pressable>
  );
}

/** The dashed «+» at the end of a people row. */
export function AddCircle() {
  return (
    <View
      style={{
        width: 34,
        height: 34,
        borderRadius: 999,
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: colors.dashedStrong,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AppText color={colors.muted} style={{ fontSize: 16, lineHeight: 20 }}>
        +
      </AppText>
    </View>
  );
}

/** An empty optional field, waiting below the rows: tapping it turns it into a row (6a). */
export function OptionalChip({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`إضافة ${label}`}
      onPress={onPress}
      hitSlop={2}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        minHeight: 40,
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: colors.dashed,
        borderRadius: radii.chip,
        paddingHorizontal: 14,
        backgroundColor: pressed ? colors.surface : "transparent",
      })}
    >
      <Ionicons name={icon} size={16} color={colors.subtle} />
      <AppText size="small" color={colors.subtle} style={{ lineHeight: 18 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** The 36px square in a description card's corner that opens the full-screen editor (6c). */
export function ExpandButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="فتح الوصف بكامل الشاشة"
      onPress={onPress}
      hitSlop={4}
      style={{
        width: 36,
        height: 36,
        marginTop: -4,
        borderRadius: radii.iconButton,
        backgroundColor: colors.chip,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="expand-outline" size={16} color={colors.subtle} />
    </Pressable>
  );
}

/** A 44px header glyph button (✕, ›, ⋯). */
export function HeaderIconButton({
  icon,
  onPress,
  accessibilityLabel,
  disabled,
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      style={{ width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
    >
      <Ionicons name={icon} size={22} color={colors.subtle} />
    </Pressable>
  );
}
