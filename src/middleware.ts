import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

// Nur die edge-sichere Config -> kein Prisma im Middleware-Bundle.
export default NextAuth(authConfig).auth;

export const config = {
  // Schützt alle /admin-Routen (inkl. /admin/login, dort greift der
  // authorized-Callback und leitet Angemeldete weiter).
  matcher: ["/admin/:path*"],
};
