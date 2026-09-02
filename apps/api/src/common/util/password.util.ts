import * as bcrypt from "bcrypt";
import { randomInt } from "crypto";

/**
 * Single source of truth for password hashing across the API. Both the auth
 * flow (self change-password) and admin user provisioning/reset go through
 * this so the cost factor never diverges between call sites.
 */
export const PASSWORD_HASH_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
}

// Excludes visually-ambiguous characters (0/O, 1/l/I) — this is read off a
// screen and retyped by hand at the login prompt (`POST /admin/users/:id/reset-password`).
const TEMP_PASSWORD_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";

/** A 10-character random temporary password, shown to the admin exactly once. */
export function generateTemporaryPassword(length = 10): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
  }
  return out;
}
