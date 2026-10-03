/**
 * Prisma-`where`-Fragment, um ein veröffentlichtes Album über seinen
 * kryptischen `shareToken` ODER — falls freigeschaltet — seinen lesbaren
 * `slug` zu finden. Der Token funktioniert immer; der Slug nur, wenn der
 * Admin die lesbare URL aktiviert hat (`readableUrl = true`).
 */
export function albumByIdentifier(identifier: string) {
  return {
    isPublished: true,
    OR: [
      { shareToken: identifier },
      { slug: identifier, readableUrl: true },
    ],
  };
}
