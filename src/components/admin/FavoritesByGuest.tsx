import { mediaUrl } from "@/lib/media";

export type GuestFavorites = {
  guestId: string;
  name: string;
  photos: { id: string; storageKey: string; originalName: string }[];
};

/**
 * Zeigt pro (anonymem) Gast die von ihm favorisierten Bilder. Der Anzeigename
 * stammt aus den Kommentaren desselben Gasts; ohne Kommentar bleibt er anonym.
 */
export function FavoritesByGuest({ guests }: { guests: GuestFavorites[] }) {
  if (guests.length === 0) {
    return (
      <p className="text-sm text-muted">
        Noch keine Favoriten. Sobald Gäste Bilder mit ♥ markieren, erscheinen
        sie hier — gruppiert pro Person.
      </p>
    );
  }

  return (
    <ul className="space-y-5">
      {guests.map((g) => (
        <li key={g.guestId} className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-ink">{g.name}</span>
            <span className="text-xs text-muted">
              {g.photos.length}{" "}
              {g.photos.length === 1 ? "Favorit" : "Favoriten"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {g.photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.id}
                src={mediaUrl(p.storageKey, "thumb")}
                alt={p.originalName}
                title={p.originalName}
                loading="lazy"
                className="h-16 w-16 rounded-lg border object-cover"
              />
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
