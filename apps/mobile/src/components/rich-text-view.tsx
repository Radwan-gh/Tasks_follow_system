import { useMemo, useState } from "react";
import { Linking, Pressable, View, type TextStyle } from "react-native";
import * as Clipboard from "expo-clipboard";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { displayUrl, parseRichText } from "@/lib/rich-text";
import { MIN_TOUCH_TARGET, colors, fonts, radii, spacing } from "@/theme/tokens";

/**
 * A description or comment as the task screen shows it (6b–6d): links found
 * automatically and opened in the browser with one tap, `@mentions` of the
 * task's people highlighted, `**bold**` bold. A long press on a link offers
 * «نسخ» and, where the text is editable, «تعديل» (6b's note).
 */
export function RichTextView({
  text,
  mentionNames = [],
  fontSize,
  lineHeight,
  color = colors.ink,
  onEditLink,
}: {
  text: string;
  mentionNames?: readonly string[];
  fontSize: number;
  lineHeight: number;
  color?: string;
  /** Offered from a link's long press — the screen opens its editor there. Omit when read-only. */
  onEditLink?: () => void;
}) {
  const segments = useMemo(() => parseRichText(text, mentionNames), [text, mentionNames]);
  const [menuFor, setMenuFor] = useState<{ url: string; label: string } | null>(null);
  const base: TextStyle = { fontFamily: fonts.regular, fontSize, lineHeight, color };

  return (
    <>
      <AppText style={base}>
        {segments.map((segment, i) => {
          if (segment.kind === "link") {
            return (
              <AppText
                key={i}
                accessibilityRole="link"
                onPress={() => void Linking.openURL(segment.url)}
                onLongPress={() => setMenuFor({ url: segment.url, label: segment.label })}
                weight="semibold"
                color={colors.link}
                style={{
                  fontSize,
                  lineHeight,
                  textDecorationLine: "underline",
                  textDecorationColor: colors.linkUnderline,
                }}
              >
                {segment.label} ↗
              </AppText>
            );
          }
          if (segment.kind === "mention") {
            return (
              <AppText
                key={i}
                weight="semibold"
                color={colors.link}
                style={{ fontSize, lineHeight, backgroundColor: colors.accentSoft }}
              >
                {segment.text}
              </AppText>
            );
          }
          return (
            <AppText key={i} weight={segment.bold ? "bold" : "regular"} color={color} style={{ fontSize, lineHeight }}>
              {segment.text}
            </AppText>
          );
        })}
      </AppText>

      <BottomSheet visible={!!menuFor} onClose={() => setMenuFor(null)}>
        <View style={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}>
          <AppText size="small" color={colors.muted} numberOfLines={1}>
            {menuFor ? displayUrl(menuFor.url) : ""}
          </AppText>
          <SheetAction
            label="↗ فتح في المتصفح"
            onPress={() => {
              if (menuFor) void Linking.openURL(menuFor.url);
              setMenuFor(null);
            }}
          />
          <SheetAction
            label="⧉ نسخ الرابط"
            onPress={() => {
              if (menuFor) void Clipboard.setStringAsync(menuFor.url);
              setMenuFor(null);
            }}
          />
          {onEditLink ? (
            <SheetAction
              label="✎ تعديل"
              onPress={() => {
                setMenuFor(null);
                onEditLink();
              }}
            />
          ) : null}
        </View>
      </BottomSheet>
    </>
  );
}

export function SheetAction({ label, onPress, destructive }: { label: string; onPress: () => void; destructive?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET + 4,
        justifyContent: "center",
        paddingHorizontal: spacing.lg,
        borderRadius: radii.field,
        backgroundColor: destructive ? colors.alertSoft : pressed ? colors.canvas : colors.surface,
        borderWidth: destructive ? 0 : 1,
        borderColor: colors.line,
      })}
    >
      <AppText weight="semibold" color={destructive ? colors.alert : colors.ink}>
        {label}
      </AppText>
    </Pressable>
  );
}
