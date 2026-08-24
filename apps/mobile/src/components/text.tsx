import { Text, type TextProps, type TextStyle } from "react-native";
import { colors, fonts, fontSizes } from "@/theme/tokens";

type Weight = keyof typeof fonts;
type Size = keyof typeof fontSizes;

export interface AppTextProps extends TextProps {
  weight?: Weight;
  size?: Size;
  color?: string;
}

/**
 * Every piece of text in the app goes through here, so Cairo and the palette
 * are applied in exactly one place. React Native has no inherited font: a bare
 * `<Text>` silently falls back to the system face, which in Arabic looks
 * obviously wrong next to the rest of the UI.
 */
export function AppText({ weight = "regular", size = "body", color, style, ...rest }: AppTextProps) {
  const base: TextStyle = {
    fontFamily: fonts[weight],
    fontSize: fontSizes[size],
    color: color ?? colors.ink,
    // Arabic needs more leading than Latin at the same size, and Cairo's
    // ascenders/descenders clip at RN's default line height.
    lineHeight: fontSizes[size] * 1.7,
    writingDirection: "rtl",
  };
  return <Text {...rest} style={[base, style]} />;
}
