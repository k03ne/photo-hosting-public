import "server-only";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Lädt den aktuell angemeldeten Admin. Wirft, wenn keine gültige Session
 * vorliegt — als zusätzliche Absicherung neben der Middleware für Mutationen.
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) {
    throw new Error("Nicht authentifiziert.");
  }

  const admin = await prisma.admin.findUnique({
    where: { email: session.user.email },
  });
  if (!admin) {
    throw new Error("Admin-Konto nicht gefunden.");
  }

  return admin;
}
