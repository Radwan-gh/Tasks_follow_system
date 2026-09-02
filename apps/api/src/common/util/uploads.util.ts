import { mkdirSync } from "node:fs";
import * as path from "node:path";

/**
 * Local-disk storage root for card image attachments (`design-prompt-group-3.md`
 * §3a-4) — no cloud storage assumed, same posture as `updates.service.ts`'s
 * `update-bundles` directory. Served publicly (unguessable UUID filenames,
 * no auth) via `ServeStaticModule` at `/uploads` — see `app.module.ts`.
 */
export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");

mkdirSync(UPLOADS_DIR, { recursive: true });
