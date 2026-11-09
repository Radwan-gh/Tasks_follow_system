import type { CardPriority, ListStatusCategory } from "@app/types";

/**
 * The task screen's own look, from `Edit Task Prototype.dc.html`
 * (docs/app_design/proposals/tasks page new design). It deliberately differs
 * from the rest of the app (`tokens.ts`) only by a few extra shades: same
 * face (IBM Plex Sans Arabic), same palette, 14px corners. Only
 * `app/card/[id].tsx` and `features/task/*` use these; a hex literal in those
 * files is still a bug — add it here.
 */
export const t = {
  canvas: "#F3F4F6",
  surface: "#FFFFFF",
  /** Card and header borders. */
  line: "#E2E3E8",
  /** Chip and input borders. */
  lineStrong: "#D9DBE1",
  /** Rows inside a card. */
  hairline: "#ECEDF1",
  /** Skeleton bars, count badges, the read-only banner. */
  chip: "#E7E8EC",
  /** The open-field close button. */
  chipStrong: "#E2E3E8",
  handle: "#D5D7DE",

  ink: "#0F1115",
  ink2: "#2B2F38",
  ink3: "#3D424E",
  muted: "#5F6472",
  faint: "#8C909C",
  dim: "#9EA2AE",
  idle: "#B8BBC6",
  doneText: "#6B7080",

  accent: "#2155E5",
  accentSoft: "#E9EEFE",
  accentWash: "#F2F5FE",
  accentLine: "#C9D6FA",

  saved: "#0A7A52",
  done: "#0E9F6E",
  doneSoft: "#D3F0E2",
  doneInk: "#0A5C3D",

  danger: "#D92D20",
  dangerSoft: "#FDE4E1",
  dangerInk: "#9B1C13",
  dangerLine: "#F7C1BB",
  /** An overdue date in the read-only rows. */
  overdue: "#B42318",

  /** A due date that hasn't passed. */
  dueSoft: "#FDEFD5",
  dueInk: "#7A3E00",
  dueIcon: "#B45309",

  scrim: "rgba(15,17,21,0.48)",
  shadow: "rgba(15,17,21,0.28)",
} as const;

export const taskFonts = {
  regular: "IBMPlexSansArabic_400Regular",
  medium: "IBMPlexSansArabic_500Medium",
  semibold: "IBMPlexSansArabic_600SemiBold",
  bold: "IBMPlexSansArabic_700Bold",
} as const;

export const taskRadii = {
  card: 14,
  pill: 10,
  chip: 8,
  sheet: 24,
  dialog: 20,
} as const;

export interface Swatch {
  bg: string;
  fg: string;
  dot: string;
}

/**
 * Status pill colours. The prototype draws four statuses (انتظار · تنفيذ ·
 * مراجعة · مكتمل); a board's lists map onto them by category.
 */
export const taskStatusColors: Record<ListStatusCategory | "UNCATEGORIZED", Swatch> = {
  NEW: { bg: "#E7E8EC", fg: "#2B2F38", dot: "#6B7080" },
  READY: { bg: "#DCE5FD", fg: "#1A3FB0", dot: "#2155E5" },
  IN_PROGRESS: { bg: "#FDEBCB", fg: "#7A3E00", dot: "#D97706" },
  REVIEW: { bg: "#DCE5FD", fg: "#1A3FB0", dot: "#2155E5" },
  DONE: { bg: "#D3F0E2", fg: "#0A5C3D", dot: "#0E9F6E" },
  CLOSED: { bg: "#D3F0E2", fg: "#0A5C3D", dot: "#0E9F6E" },
  UNCATEGORIZED: { bg: "#E7E8EC", fg: "#2B2F38", dot: "#6B7080" },
};

/** Priority flag colours; «عادية» (`NORMAL`) is "no priority" and has none. */
export const taskPriorityColors: Partial<Record<CardPriority, Swatch>> = {
  URGENT: { dot: "#D92D20", bg: "#FDE4E1", fg: "#9B1C13" },
  HIGH: { dot: "#D97706", bg: "#FDEBCB", fg: "#7A3E00" },
  MEDIUM: { dot: "#2155E5", bg: "#DCE5FD", fg: "#1A3FB0" },
  LOW: { dot: "#6B7080", bg: "#E7E8EC", fg: "#2B2F38" },
};

/** Solid avatar fills with white initials, rotated by user id. */
export const taskAvatarFills = ["#2155E5", "#B45309", "#0E7A52", "#C2352B", "#3D424E", "#0F7490"] as const;
