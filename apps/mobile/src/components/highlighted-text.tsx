import type { TextStyle } from "react-native";
import { findSearchMatch } from "@app/types";
import { AppText, type AppTextProps } from "./text";
import { colors } from "@/theme/tokens";

/**
 * `text` with the first match of `query` marked the way the design's search
 * results mark it (§3b-2): the blue on its soft fill. Matching is the API's —
 * `findSearchMatch` ignores case, tashkeel and أ/ا-style letter forms — so
 * whatever the server matched is also what lights up here.
 *
 * Render it *inside* an `AppText`; the marked part is its own `AppText`, so
 * give it the parent's `size`, or the parent's design `fontSize`/`lineHeight`
 * through `style`.
 */
export function HighlightedText({
  text,
  query,
  size,
  style,
}: {
  text: string;
  query?: string;
  size?: AppTextProps["size"];
  style?: TextStyle;
}) {
  const match = query ? findSearchMatch(text, query) : null;
  if (!match) return <>{text}</>;
  return (
    <>
      {text.slice(0, match.start)}
      <AppText size={size} weight="semibold" color={colors.accent} style={[{ backgroundColor: colors.accentSoft }, style]}>
        {text.slice(match.start, match.end)}
      </AppText>
      {text.slice(match.end)}
    </>
  );
}
