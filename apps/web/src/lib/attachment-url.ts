const API_BASE = import.meta.env.VITE_API_URL as string | undefined;

/**
 * `Attachment.url` is server-relative (`/uploads/<file>`), served by the API
 * itself, not by the web app. In dev, `/uploads` is proxied to the API (see
 * `vite.config.ts`) so a relative path resolves correctly; in prod, resolve
 * it against the configured API origin instead of the web app's own origin.
 */
export function attachmentUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  if (!API_BASE || API_BASE === "/api") return path;
  return `${API_BASE.replace(/\/$/, "")}${path}`;
}

/** Mirrors `MAX_ATTACHMENT_BYTES` in `apps/api/src/cards/attachments.service.ts` — checked before uploading so an oversized file fails fast. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const PREVIEWABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Only these render as a thumbnail; every other attachment (including other image types) is a file row. */
export function isPreviewableImage(mimeType: string): boolean {
  return PREVIEWABLE_IMAGE_TYPES.has(mimeType);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
