import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

const SEED_ADMIN_USERNAME = (process.env.SEED_ADMIN_USERNAME ?? "admin").trim().toLowerCase();
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "password123";
const SEED_ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? "Admin";
// Optional — the seed admin is identified by username; an address is contact
// information only and is left unset when not provided. Still read here because
// it is how this account was identified *before* username login, and adopting
// that row is what keeps a redeploy from minting a second admin (see below).
const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL?.trim() || null;

/**
 * Find the existing seed admin, tolerating the email→username migration.
 *
 * Before username login this account was keyed by `SEED_ADMIN_EMAIL`. The
 * migration derives a username from the email's local part, which only equals
 * `SEED_ADMIN_USERNAME` by coincidence — so a plain upsert on username would
 * miss the real admin and *create a second one*, with the default password.
 * Falling back to the email adopts the legacy row instead.
 */
async function findExistingAdmin() {
  const byUsername = await prisma.user.findUnique({ where: { username: SEED_ADMIN_USERNAME } });
  if (byUsername) return byUsername;
  if (!SEED_ADMIN_EMAIL) return null;
  return prisma.user.findUnique({ where: { email: SEED_ADMIN_EMAIL } });
}

async function main() {
  const existing = await findExistingAdmin();

  if (existing) {
    // Re-assert admin privileges on every boot so a demoted/deactivated seed
    // admin is repaired and there is always at least one usable admin login.
    // The password is deliberately NOT reset — that would silently undo a
    // rotation on every redeploy.
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: "ADMIN",
        isActive: true,
        // Adopt the configured username if this row still carries a migrated
        // one, but never collide with an account that already claimed it.
        ...(existing.username === SEED_ADMIN_USERNAME ? {} : { username: SEED_ADMIN_USERNAME }),
      },
    });
    console.log(`Seed admin present: ${user.username} (id: ${user.id}, role: ${user.role})`);
    return;
  }

  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.warn(
      "[seed] Creating the first admin with the built-in default password. " +
        "Set SEED_ADMIN_PASSWORD, or change it immediately after first login.",
    );
  }

  const passwordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, 12);
  const user = await prisma.user.create({
    data: {
      username: SEED_ADMIN_USERNAME,
      email: SEED_ADMIN_EMAIL,
      passwordHash,
      displayName: SEED_ADMIN_NAME,
      role: "ADMIN",
    },
  });

  console.log(`Seeded user ${user.username} (id: ${user.id}, role: ${user.role})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
