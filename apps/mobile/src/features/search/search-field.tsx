import { Pressable, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { MIN_TOUCH_TARGET, colors, fonts, fs, radii, spacing } from "@/theme/tokens";

/**
 * The design's search box: a white field with ⌕, which turns blue (1.5px
 * border, blue ⌕) once something is typed and then offers ✕ to clear it —
 * the boards screen's «ابحث: لوحات، مهام، مهام فرعية» and the in-board search (§3b-2).
 */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  autoFocus = false,
  radius = radii.card,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  /** 14 on the boards screen, 12 inside a board — as each frame draws it. */
  radius?: number;
}) {
  const active = value.length > 0;
  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: colors.surface,
        borderWidth: active ? 1.5 : 1,
        borderColor: active ? colors.accent : colors.line,
        borderRadius: radius,
        paddingStart: spacing.lg,
        minHeight: MIN_TOUCH_TARGET + 4,
      }}
    >
      <Ionicons name="search" size={16} color={active ? colors.accent : colors.dashedStrong} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.dashedStrong}
        autoFocus={autoFocus}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={placeholder}
        style={{
          flex: 1,
          paddingVertical: spacing.md,
          paddingEnd: active ? 0 : spacing.lg,
          fontFamily: fonts.regular,
          fontSize: fs(14),
          color: colors.ink,
          textAlign: "right",
          writingDirection: "rtl",
        }}
      />
      {active ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="مسح البحث"
          onPress={() => onChangeText("")}
          style={{ width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="close" size={16} color={colors.dashedStrong} />
        </Pressable>
      ) : null}
    </View>
  );
}
