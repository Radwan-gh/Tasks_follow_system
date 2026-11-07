import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Modal, Pressable, Text, View, type TextProps, type TextStyle, type ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { initials } from "@/lib/initials";
import { t, taskAvatarFills, taskFonts, taskRadii } from "@/theme/task-tokens";
import { fs } from "@/theme/tokens";

/**
 * The task screen's building blocks, drawn from `Edit Task Prototype.dc.html`.
 * Everything here uses `theme/task-tokens.ts` and Noto Naskh Arabic, the same
 * face and text scale as the rest of the app (`tokens.ts`).
 */

export type TIcon = ComponentProps<typeof Ionicons>["name"];

type Weight = keyof typeof taskFonts;

/** Text in the task screen's face. React Native inherits no font, so every label goes through here. */
export function TText({
  size = 14,
  weight = "regular",
  color = t.ink,
  lineHeight,
  style,
  ...rest
}: TextProps & { size?: number; weight?: Weight; color?: string; lineHeight?: number }) {
  // `size`/`lineHeight` are design sizes, set at the app's text scale (`fs`).
  const base: TextStyle = {
    fontFamily: taskFonts[weight],
    fontSize: fs(size),
    lineHeight: fs(lineHeight ?? Math.round(size * 1.55)),
    color,
    writingDirection: "rtl",
  };
  return <Text {...rest} style={[base, style]} />;
}

function fillFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return taskAvatarFills[hash % taskAvatarFills.length]!;
}

export interface TPerson {
  userId: string;
  user: { displayName: string; firstName?: string; lastName?: string; isActive?: boolean };
}

/** A solid round avatar with white initials. */
export function TAvatar({ person, size = 24, dim = false }: { person: TPerson; size?: number; dim?: boolean }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: fillFor(person.userId),
        alignItems: "center",
        justifyContent: "center",
        opacity: dim || person.user.isActive === false ? 0.55 : 1,
      }}
    >
      <TText size={size >= 30 ? 11 : 10} weight="bold" color={t.surface} lineHeight={size * 0.6}>
        {initials(person.user)}
      </TText>
    </View>
  );
}

/** The white rounded box everything sits in. */
export function TCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: taskRadii.card }, style]}>
      {children}
    </View>
  );
}

/** The 30px box an icon sits in at the start of a card's header. */
export function IconBox({ icon, color = t.ink3, size = 17 }: { icon: TIcon; color?: string; size?: number }) {
  return (
    <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={icon} size={size} color={color} />
    </View>
  );
}

/** The small round ✕. `filled` for a section's close, plain for a row's delete. */
export function CloseButton({
  onPress,
  accessibilityLabel,
  filled = true,
  size = 28,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  filled?: boolean;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: filled ? t.canvas : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="close" size={14} color={filled ? t.ink3 : t.faint} />
    </Pressable>
  );
}

/** A section's header row: icon, title (and an optional note under it), something at the end, ✕. */
export function SectionHeader({
  icon,
  title,
  note,
  end,
  onClose,
  closeLabel,
}: {
  icon: TIcon;
  title: string;
  note?: string;
  end?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <IconBox icon={icon} />
      <View style={{ flex: 1 }}>
        <TText size={14} weight="semibold">
          {title}
        </TText>
        {note ? (
          <TText size={12} color={t.muted}>
            {note}
          </TText>
        ) : null}
      </View>
      {end}
      {onClose ? <CloseButton onPress={onClose} accessibilityLabel={closeLabel ?? `إغلاق ${title}`} /> : null}
    </View>
  );
}

/** An unopened optional section («مهام فرعية», «مرفق», «تقييد الوصول»). */
export function SectionChip({ icon, label, onPress }: { icon: TIcon; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`إضافة ${label}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        height: 38,
        paddingStart: 7,
        paddingEnd: 12,
        borderRadius: taskRadii.pill,
        borderWidth: 1,
        borderColor: pressed ? t.dim : t.lineStrong,
        backgroundColor: t.surface,
      })}
    >
      <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={15} color={t.ink3} />
      </View>
      <TText size={13} weight="medium">
        {label}
      </TText>
    </Pressable>
  );
}

export interface PillColors {
  fg: string;
  bg: string;
  border: string;
  icon: string;
}

export const NEUTRAL_PILL: PillColors = { fg: t.ink3, bg: t.surface, border: t.lineStrong, icon: t.ink3 };

/** A value you can tap to change — the due date, the priority, the status. */
export function TPill({
  label,
  colors,
  icon,
  dot,
  chevron = false,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  colors: PillColors;
  icon?: TIcon;
  /** A coloured dot instead of an icon (the status). */
  dot?: string;
  chevron?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const content = (
    <>
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: dot }} /> : null}
      {icon ? <Ionicons name={icon} size={15} color={colors.icon} /> : null}
      <TText size={13} weight="semibold" color={colors.fg} lineHeight={18}>
        {label}
      </TText>
      {chevron ? <Ionicons name="chevron-down" size={12} color={colors.fg} /> : null}
    </>
  );
  const style: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: 11,
    borderRadius: taskRadii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  };
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress} style={style}>
      {content}
    </Pressable>
  );
}

/** The top-of-screen notice: «نُسخ رابط المهمة», «أُنشئت نسخة من المهمة»… */
export function TopToast({ message, onDone, top = 60 }: { message: string | null; onDone: () => void; /** From the screen's top edge — just under its header. */ top?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!message) return;
    AccessibilityInfo.announceForAccessibility(message);
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => onDone());
    }, 1700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per message
  }, [message]);
  if (!message) return null;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{ position: "absolute", top, start: 0, end: 0, alignItems: "center", opacity, zIndex: 40 }}
    >
      <View style={{ backgroundColor: t.ink, borderRadius: taskRadii.pill, paddingVertical: 10, paddingHorizontal: 16 }}>
        <TText size={13} weight="medium" color={t.surface}>
          {message}
        </TText>
      </View>
    </Animated.View>
  );
}

/** A centred dialog (the delete confirmation). */
export function TDialog({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="إغلاق"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: t.scrim, alignItems: "center", justifyContent: "center", padding: 24 }}
      >
        <Pressable
          // Taps inside the dialog stay inside it.
          onPress={() => undefined}
          style={{ width: "100%", backgroundColor: t.surface, borderRadius: taskRadii.dialog, padding: 20, gap: 14 }}
        >
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A 52px row in one of the screen's bottom sheets: content, then ✓ when it is the current value. */
export function SheetOption({
  children,
  selected,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 52,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: pressed ? t.canvas : "transparent",
        opacity: disabled ? 0.5 : 1,
      })}
    >
      {children}
      <Ionicons name="checkmark" size={18} color={t.accent} style={{ opacity: selected ? 1 : 0 }} />
    </Pressable>
  );
}

/** A sheet's title. */
export function SheetTitle({ children }: { children: string }) {
  return (
    <TText size={16} weight="bold" style={{ paddingTop: 6, paddingBottom: 8, paddingHorizontal: 12 }}>
      {children}
    </TText>
  );
}
