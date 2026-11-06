/**
 * The app's palette, type, radii and spacing, defined once.
 *
 * Source: the task page's theme — `Edit Task Prototype.dc.html`
 * (docs/app_design/proposals/tasks page new design) — applied to the whole
 * app at the user's request: a cool grey canvas, a
 * near-black ink, a strong blue and tighter corners. Layouts still follow
 * `Tasks Mobile Redesign.dc.html`; only the look changed. `task-tokens.ts`
 * holds the task screen's extra shades on the same palette.
 *
 * Components must reference these names — a raw hex literal anywhere else is
 * a bug, because it is what made the web app's colours drift in the first place.
 */

export const colors = {
  /** Primary text. */
  ink: "#0F1115",
  /** Secondary text, disabled states. */
  muted: "#5F6472",
  /** Hairline borders and separators. */
  line: "#E2E3E8",
  /** Cards, sheets, bars — anything raised above the canvas. */
  surface: "#FFFFFF",
  /** The page behind everything. */
  canvas: "#F3F4F6",

  accent: "#2155E5",
  accentSoft: "#E9EEFE",

  /** Something went wrong, or a due date has passed. */
  alert: "#D92D20",
  alertSoft: "#FDE4E1",

  /** Priority: عاجلة — the prototype's urgent flag, the same red as an alert. */
  urgent: "#D92D20",
  urgentSoft: "#FDE4E1",

  /** The dim behind a bottom sheet. */
  scrim: "rgba(15,17,21,0.48)",

  /** Quieter than `muted`: counts, «ضمن: …», «لا تُطوى», placeholders. */
  faint: "#8C909C",
  /** Icon/text on a neutral chip or a bordered icon button. */
  slate: "#3D424E",
  /** A neutral status chip's fill («جديد», «جاهز للتنفيذ»). */
  slateSoft: "#E7E8EC",
  /** A due-date chip's fill, and a person chip's. */
  chip: "#F3F4F6",
  /** An unticked tick box's border, chip and input borders. */
  lineStrong: "#D9DBE1",
  /** An overdue row's border, and the «متأخّرة» count beside its heading. */
  alertLine: "#F7C1BB",
  alertMuted: "#B42318",

  /** Secondary glyphs: the ✕/›/⋯ in headers, filter chips, notes. */
  subtle: "#5F6472",
  /** A name inside a timeline line; toolbar glyphs. */
  inkSoft: "#2B2F38",
  /** A link inside a description or comment, and its underline. */
  link: "#2155E5",
  linkUnderline: "#C9D6FA",
  /** The divider between rows inside one rounded group. */
  hairline: "#ECEDF1",
  /** An empty optional field's dashed chip, and the dashed «+» add circle. */
  dashed: "#D9DBE1",
  dashedStrong: "#B8BBC6",
  /** A ticked subtask, a progress bar, an active account. */
  done: "#0E9F6E",
  /** «✓ حُفظ»; the text on a «done»/«active» badge. */
  saved: "#0A7A52",
  /** The fill behind a «done»/«active» badge. */
  savedSoft: "#D3F0E2",
  /** «اليوم» / «أمس» day markers in a timeline. */
  dayMarker: "#E7E8EC",
  /** A formatting bar above the keyboard. */
  toolbar: "#F7F8FA",
} as const;

/** A status pill: a soft fill and a darker text per status (as `task-tokens.ts`). */
export const statusPillColors = {
  NEW: { bg: "#E7E8EC", fg: "#2B2F38" },
  READY: { bg: "#DCE5FD", fg: "#1A3FB0" },
  IN_PROGRESS: { bg: "#FDEBCB", fg: "#7A3E00" },
  REVIEW: { bg: "#DCE5FD", fg: "#1A3FB0" },
  DONE: { bg: "#D3F0E2", fg: "#0A5C3D" },
  CLOSED: { bg: "#E7E8EC", fg: "#3D424E" },
  UNCATEGORIZED: { bg: "#E7E8EC", fg: "#2B2F38" },
} as const;

/** A status chip's fill and text («قيد التنفيذ» is amber; the rest stay neutral). */
export const statusChipColors = {
  IN_PROGRESS: { bg: "#FDEBCB", fg: "#7A3E00" },
  default: { bg: colors.slateSoft, fg: colors.inkSoft },
} as const;

/** One colour per status category, keyed to `ListStatusCategory` — the prototype's status dots. */
export const statusColors = {
  NEW: "#6B7080",
  READY: "#2155E5",
  IN_PROGRESS: "#D97706",
  /** Retired from the board template but still carried by older lists. */
  REVIEW: "#2155E5",
  DONE: "#0E9F6E",
  CLOSED: "#8C909C",
  /** Manually created lists carry no category. */
  UNCATEGORIZED: "#6B7080",
} as const;

/** Rotating per-member avatars: the prototype's solid fills with white initials. */
export const avatarPalette = [
  { bg: "#2155E5", fg: "#FFFFFF" },
  { bg: "#B45309", fg: "#FFFFFF" },
  { bg: "#0E7A52", fg: "#FFFFFF" },
  { bg: "#C2352B", fg: "#FFFFFF" },
  { bg: "#3D424E", fg: "#FFFFFF" },
  { bg: "#0F7490", fg: "#FFFFFF" },
] as const;

export const radii = {
  card: 14,
  /** «مهامي»'s task rows. */
  row: 14,
  /** A 36px icon button such as a row's ← arrow. */
  iconButton: 10,
  chip: 999,
  field: 12,
  sheet: 24,
} as const;

/**
 * The page's side margin: the left/right padding of every screen's header,
 * scrolling content and bottom bar, and what the board's status columns are
 * inset by. Narrowed from 20 so lists use more of the phone's width. Padding
 * *inside* cards, rows and sheets stays on `spacing`.
 */
export const GUTTER = 12;

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

/** Noto Naskh Arabic, the user's pick over IBM Plex Sans Arabic (2026-11-07); loaded in `app/_layout.tsx`. */
export const fonts = {
  regular: "NotoNaskhArabic_400Regular",
  medium: "NotoNaskhArabic_500Medium",
  semibold: "NotoNaskhArabic_600SemiBold",
  bold: "NotoNaskhArabic_700Bold",
} as const;

export const fontSizes = {
  caption: 12,
  small: 13,
  body: 15,
  title: 17,
  heading: 22,
  display: 30,
} as const;

/**
 * Line height per font size. Noto Naskh's natural line is 1.70em; 1.55 still
 * clears its letters, and long text (descriptions, comments) sets taller lines.
 */
export const LINE_HEIGHT = 1.55;
