/**
 * The task screen's light text markup (`Tasks Mobile Redesign.dc.html` 6b–6d):
 * a description or comment stays plain text on the server, and these few
 * conventions are what the screens render on top of it —
 *
 * - `https://…` anywhere becomes a tappable link, shown without its scheme;
 * - `[label](https://…)` is a link with a custom label («+ رابط» in 6c);
 * - `**text**` is bold («B» in 6c);
 * - `@Name` is a mention when `Name` is one of the people passed in.
 *
 * List lines («• », «1. », «☐ ») need no markup: they are ordinary characters,
 * so they read the same in the web app, which shows the text as-is.
 */

export type RichSegment =
  | { kind: "text"; text: string; bold?: boolean }
  | { kind: "link"; label: string; url: string; start: number; end: number }
  | { kind: "mention"; text: string };

export interface Selection {
  start: number;
  end: number;
}

export interface Edit {
  text: string;
  selection: Selection;
}

/** Characters a bare URL never ends on — trailing punctuation belongs to the sentence. */
const URL_TRAILING = /[.,،؛:!?؟'"»)\]]+$/;

const TOKEN = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|(https?:\/\/[^\s<>]+)/g;

/** A URL as people read it: no scheme, no trailing slash. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

/**
 * Splits `text` into segments to render. `mentionNames` are the names an
 * `@` may introduce (display names and first names); longer names win, so
 * «@عبد الله» is not cut short at «@عبد».
 */
export function parseRichText(text: string, mentionNames: readonly string[] = []): RichSegment[] {
  const segments: RichSegment[] = [];
  const names = [...new Set(mentionNames.filter((n) => n.trim().length > 0))].sort((a, b) => b.length - a.length);

  function pushText(value: string, bold?: boolean) {
    if (!value) return;
    for (const part of splitMentions(value, names)) {
      if (part.mention) segments.push({ kind: "mention", text: part.text });
      else if (bold) segments.push({ kind: "text", text: part.text, bold: true });
      else segments.push({ kind: "text", text: part.text });
    }
  }

  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    let raw = match[0];
    if (match[4]) {
      // A bare URL: give trailing punctuation back to the sentence.
      raw = raw.replace(URL_TRAILING, "");
      if (raw.length < "https://x".length) continue;
    }
    pushText(text.slice(last, at));
    if (match[1] && match[2]) {
      segments.push({ kind: "link", label: match[1], url: match[2], start: at, end: at + raw.length });
    } else if (match[3]) {
      pushText(match[3], true);
    } else {
      segments.push({ kind: "link", label: displayUrl(raw), url: raw, start: at, end: at + raw.length });
    }
    last = at + raw.length;
  }
  pushText(text.slice(last));
  return segments;
}

function splitMentions(text: string, names: readonly string[]): { text: string; mention: boolean }[] {
  if (names.length === 0 || !text.includes("@")) return [{ text, mention: false }];
  const out: { text: string; mention: boolean }[] = [];
  let plainFrom = 0;
  let i = 0;
  while (i < text.length) {
    // An «@» starts a mention only at the start of a word.
    if (text[i] === "@" && (i === 0 || /\s/.test(text[i - 1]!))) {
      const name = names.find((n) => text.startsWith(n, i + 1) && !isWordChar(text[i + 1 + n.length]));
      if (name) {
        if (i > plainFrom) out.push({ text: text.slice(plainFrom, i), mention: false });
        out.push({ text: `@${name}`, mention: true });
        i += 1 + name.length;
        plainFrom = i;
        continue;
      }
    }
    i++;
  }
  if (plainFrom < text.length) out.push({ text: text.slice(plainFrom), mention: false });
  return out;
}

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[\p{L}\p{N}_]/u.test(ch);
}

/** The link (custom-label or bare) the cursor sits in, if any — for 6c's فتح/تعديل/نسخ/إزالة bar. */
export function linkAt(text: string, cursor: number): Extract<RichSegment, { kind: "link" }> | null {
  for (const segment of parseRichText(text)) {
    if (segment.kind === "link" && cursor >= segment.start && cursor <= segment.end) return segment;
  }
  return null;
}

/** «إزالة»: a labelled link keeps its label as plain text; a bare URL goes entirely. */
export function removeLink(text: string, link: { start: number; end: number; label: string; url: string }): Edit {
  const raw = text.slice(link.start, link.end);
  const keep = raw.startsWith("[") ? link.label : "";
  return {
    text: text.slice(0, link.start) + keep + text.slice(link.end),
    selection: { start: link.start + keep.length, end: link.start + keep.length },
  };
}

/** Replaces `range` with `insert` and puts the cursor after it. */
export function replaceRange(text: string, range: Selection, insert: string): Edit {
  const at = range.start + insert.length;
  return { text: text.slice(0, range.start) + insert + text.slice(range.end), selection: { start: at, end: at } };
}

/** «+ رابط»: `[label](url)`, or the bare URL when no label was given. */
export function linkMarkup(label: string, url: string): string {
  const href = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  const name = label.trim();
  return name ? `[${name}](${href})` : href;
}

/** «B»: wraps the selection in `**`, or unwraps it when it already is; with no selection, opens an empty pair. */
export function toggleBold(text: string, selection: Selection): Edit {
  const { start, end } = selection;
  if (start === end) {
    return { text: `${text.slice(0, start)}****${text.slice(end)}`, selection: { start: start + 2, end: start + 2 } };
  }
  if (text.slice(start - 2, start) === "**" && text.slice(end, end + 2) === "**") {
    return {
      text: text.slice(0, start - 2) + text.slice(start, end) + text.slice(end + 2),
      selection: { start: start - 2, end: end - 2 },
    };
  }
  return {
    text: `${text.slice(0, start)}**${text.slice(start, end)}**${text.slice(end)}`,
    selection: { start: start + 2, end: end + 2 },
  };
}

export type LineStyle = "bullet" | "number" | "check";

const LINE_PREFIX: Record<LineStyle, RegExp> = {
  bullet: /^• /,
  number: /^\d+\. /,
  check: /^[☐☑] /,
};

/**
 * «•», «1.», «☐»: prefixes every line the selection touches, or strips the
 * prefix when all of them already carry it. Numbered lines count from 1.
 */
export function toggleLineStyle(text: string, selection: Selection, style: LineStyle): Edit {
  const lineStart = text.lastIndexOf("\n", selection.start - 1) + 1;
  const nextBreak = text.indexOf("\n", selection.end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const lines = text.slice(lineStart, lineEnd).split("\n");
  const all = lines.every((line) => LINE_PREFIX[style].test(line));
  const next = lines.map((line, i) => {
    // Swapping one list style for another replaces the old prefix.
    const bare = line.replace(LINE_PREFIX.bullet, "").replace(LINE_PREFIX.number, "").replace(LINE_PREFIX.check, "");
    if (all) return bare;
    const prefix = style === "bullet" ? "• " : style === "number" ? `${i + 1}. ` : "☐ ";
    return prefix + bare;
  });
  const replaced = next.join("\n");
  const end = lineStart + replaced.length;
  return { text: text.slice(0, lineStart) + replaced + text.slice(lineEnd), selection: { start: end, end } };
}

/**
 * The partial name after an «@» the cursor is typing, or null — drives the
 * comment composer's member suggestions.
 */
export function activeMention(text: string, cursor: number): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  // A mention is a name: a line break or two spaces in a row ends it.
  if (/\n| {2}/.test(query) || query.length > 30) return null;
  return { start: at, query };
}
