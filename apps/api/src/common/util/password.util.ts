import * as bcrypt from "bcrypt";

/**
 * Single source of truth for password hashing across the API. Both the auth
 * flow (self change-password) and admin user provisioning/reset go through
 * this so the cost factor never diverges between call sites.
 */
export const PASSWORD_HASH_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
}
