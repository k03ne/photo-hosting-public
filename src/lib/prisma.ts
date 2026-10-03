import { PrismaClient } from "@prisma/client";

// Singleton, damit in der Next.js-Dev-Umgebung (Hot Reload) nicht bei jedem
// Reload eine neue Verbindung aufgebaut wird.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
