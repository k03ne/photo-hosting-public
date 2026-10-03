import type { NextAuthConfig } from "next-auth";

// Edge-sichere Basiskonfiguration: KEIN Prisma/bcrypt hier, damit dieselbe
// Config in der Middleware (Edge Runtime) verwendet werden kann.
export const authConfig = {
  trustHost: true, // wichtig für Self-Hosting hinter Reverse-Proxy
  pages: {
    signIn: "/admin/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    // Von der Middleware für den Routen-Schutz genutzt.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname === "/admin/login";

      if (isOnLogin) {
        // Bereits angemeldet? -> weg vom Login, ins Dashboard.
        if (isLoggedIn) return Response.redirect(new URL("/admin", nextUrl));
        return true;
      }

      // Alle anderen /admin-Routen erfordern eine Anmeldung.
      // false => NextAuth leitet auf die signIn-Seite um.
      return isLoggedIn;
    },
  },
  providers: [], // in auth.ts ergänzt (Node-Runtime)
} satisfies NextAuthConfig;
