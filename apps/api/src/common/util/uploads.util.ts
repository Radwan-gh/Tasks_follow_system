import { randomUUID } from "node:crypto";
import * as path from "node:path";

/*
 * Naming and serving rules for card attachments. Where the bytes live (a
 * Railway bucket in production, local disk in dev) is `AttachmentStorageService`'s
 * concern; both use the stored filename built here as the object key.
 */

const NAME_SEPARATOR = "__";
const MAX_BASE_CHARS = 80;
/** Keeps the whole on-disk name well under the 255-byte filesystem limit even for multi-byte scripts. */
const MAX_BASE_BYTES = 150;

/** multer/busboy decode `originalname` as latin1 by default, which garbles UTF-8 (e.g. Arabic) names. */
function decodeOriginalName(originalname: string): string {
  // A code unit above 0xFF can't have come from latin1 decoding — already proper text.
  if (/[^\u0000-ÿ]/.test(originalname)) return originalname;
  const decoded = Buffer.from(originalname, "latin1").toString("utf8");
  return decoded.includes("\uFFFD") ? originalname : decoded;
}

function sanitizeBase(base: string): string {
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*%#]+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  let out = "";
  for (const ch of Array.from(cleaned).slice(0, MAX_BASE_CHARS)) {
    if (Buffer.byteLength(out + ch) > MAX_BASE_BYTES) break;
    out += ch;
  }
  return out || "file";
}

/**
 * `<uuid>__<original base name><.ext>`. The original name rides along in the
 * on-disk name so the UI can show it and downloads can be named after it
 * (`setUploadHeaders`) without a separate column. The UUID keeps the URL
 * unguessable; the extension is reduced to `[a-z0-9]` so an odd suffix can't
 * change how the file is served.
 */
export function buildStoredFilename(originalname: string): string {
  const parsed = path.parse(decodeOriginalName(originalname).replace(/\\/g, "/").split("/").pop() ?? "");
  const ext = parsed.ext.toLowerCase();
  return `${randomUUID()}${NAME_SEPARATOR}${sanitizeBase(parsed.name)}${/^\.[a-z0-9]{1,10}$/.test(ext) ? ext : ""}`;
}

/** Inverse of `buildStoredFilename`. Legacy rows (`<uuid>.<ext>`, no separator) fall back to the stored name. */
export function displayNameFromStored(stored: string): string {
  const i = stored.indexOf(NAME_SEPARATOR);
  return i === -1 ? stored : stored.slice(i + NAME_SEPARATOR.length);
}

/** Only these render inline in a browser (extension → served type); every other type is forced to download. */
const INLINE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** The `Content-Type` to serve a stored file inline with, or `null` if it must be downloaded instead. */
export function inlineContentType(stored: string): string | null {
  return INLINE_TYPES[path.extname(stored).toLowerCase()] ?? null;
}

/** `Content-Disposition: attachment`, named after the original upload (ASCII fallback + RFC 5987 UTF-8 name). */
export function downloadDisposition(stored: string): string {
  const name = displayNameFromStored(path.basename(stored));
  const asciiFallback = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeRfc5987(name)}`;
}

/**
 * Uploads are public (unguessable names, no auth) and any file type may be
 * attached — so anything that isn't a plain raster image is sent as a download
 * (an uploaded `.html`/`.svg` must never execute in the browser) and `nosniff`
 * stops a mislabelled file being reinterpreted as something else. Used when
 * serving from disk; the bucket gets the same headers baked into its signed URL.
 */
export function setUploadHeaders(res: { setHeader(name: string, value: string): unknown }, filePath: string): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (inlineContentType(filePath)) return;
  res.setHeader("Content-Disposition", downloadDisposition(filePath));
}
