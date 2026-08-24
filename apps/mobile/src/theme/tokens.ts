/**
 * The design's palette, radii and spacing, defined once.
 *
 * Source: `Tasks Mobile Redesign.dc.html` and `v2-new-style.md` §2. Components
 * must reference these names — a raw hex literal anywhere else is a bug,
 * because it is what made the web app's colours drift in the first place.
 */

export const colors = {
  /** Primary text. */
  ink: "#23232A",
  /** Secondary text, disabled states, the «انتهى» status. */
  muted: "#8B8B95",
  /** Hairline borders and separators. */
  line: "#EAE8E3",
  /** Cards, sheets, bars — anything raised above the canvas. */
  surface: "#FFFFFF",
  /** The page behind everything. */
  canvas: "#F7F6F3",

  accent: "#4A6FD4",
  accentSoft: "#EAEFFB",

  /** Something went wrong, or a due date has passed. */
  alert: "#C0503C",
  alertSoft: "#FBE9E7",

  /** Priority: عاجل. Deliberately distinct from both `status.inProgress`
   *  (amber) and `alert` (red) — see `v2-new-style.md` §7.3. */
  urgent: "#C05A17",
  urgentSoft: "#FCEEDF",
} as const;

/** One colour per status category, keyed to `ListStatusCategory`. */
export const statusColors = {
  NEW: "#A9AEC0",
  READY: "#6E8AD8",
  IN_PROGRESS: "#E0A34A",
  /** Retired from the board template but still carried by older lists. */
  REVIEW: "#6E8AD8",
  DONE: "#59B08A",
  CLOSED: "#8B8B95",
  /** Manually created lists carry no category. */
  UNCATEGORIZED: "#A9AEC0",
} as const;

export const radii = {
  card: 22,
  chip: 999,
  field: 16,
  sheet: 30,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

/**
 * Minimum size for anything tappable. The design's own note; enforced by
 * giving every pressable a `minHeight`/`minWidth` of this value rather than
 * relying on the visual size of its icon.
 */
export const MIN_TOUCH_TARGET = 44;

export const fonts = {
  regular: "Cairo_400Regular",
  medium: "Cairo_500Medium",
  semibold: "Cairo_600SemiBold",
  bold: "Cairo_700Bold",
} as const;

export const fontSizes = {
  caption: 12,
  small: 13,
  body: 15,
  title: 17,
  heading: 22,
  display: 30,
} as const;
