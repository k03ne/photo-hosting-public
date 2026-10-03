// Container-tauglicher Seed (reines CommonJS, kein tsx nötig).
// Idempotent: legt den ersten Admin aus ADMIN_EMAIL/ADMIN_PASSWORD an.
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("→ Kein ADMIN_EMAIL/ADMIN_PASSWORD gesetzt — Seed übersprungen.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.admin.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, name: "Admin" },
  });
  console.log(`✓ Admin bereit: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
