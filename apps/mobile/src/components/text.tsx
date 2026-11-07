import { StyleSheet, Text, type TextProps, type TextStyle } from "react-native";
import { LINE_HEIGHT, colors, fonts, fontSizes, fs } from "@/theme/tokens";

type Weight = keyof typeof fonts;
type Size = keyof typeof fontSizes;

export interface AppTextProps extends TextProps {
  weight?: Weight;
  size?: Size;
  color?: string;
}

/**
 * Every piece of text in the app goes through here, so the face and the palette
 * are applied in exactly one place. React Native has no inherited font: a bare
 * `<Text>` silently falls back to the system face, which in Arabic looks
 * obviously wrong next to the rest of the UI.
 */
export function AppText({ weight = "regular", size = "body", color, style, ...rest }: AppTextProps) {
  const base: TextStyle = {
    fontFamily: fonts[weight],
    fontSize: fontSizes[size],
    color: color ?? colors.ink,
    // Arabic needs more leading than Latin at the same size, and RN's default
    // line height clips its ascenders/descenders.
    lineHeight: Math.round(fontSizes[size] * LINE_HEIGHT),
    writingDirection: "rtl",
  };
  // A `fontSize`/`lineHeight` given in `style` is a design size: bring it to
  // the app's text scale like the `size` tokens above (`FONT_SCALE`).
  const own = StyleSheet.flatten(style);
  const scaled: TextStyle | null =
    own && (own.fontSize != null || own.lineHeight != null)
      ? {
          ...(own.fontSize != null ? { fontSize: fs(own.fontSize) } : null),
          ...(own.lineHeight != null ? { lineHeight: fs(own.lineHeight) } : null),
        }
      : null;
  return <Text {...rest} style={[base, own, scaled]} />;
}
