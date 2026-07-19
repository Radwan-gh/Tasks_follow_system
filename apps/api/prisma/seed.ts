import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "password123";
const SEED_ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? "Admin";

async function main() {
  const passwordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, 12);

  const user = await prisma.user.upsert({
    where: { email: SEED_ADMIN_EMAIL },
    // Re-assert admin privileges on every boot so a demoted/deactivated seed
    // admin is repaired and there is always at least one usable admin login.
    update: { role: "ADMIN", isActive: true },
    create: {
      email: SEED_ADMIN_EMAIL,
      passwordHash,
      displayName: SEED_ADMIN_NAME,
      role: "ADMIN",
    },
  });

  console.log(`Seeded user ${user.email} (id: ${user.id}, role: ${user.role})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
