import Link from "next/link";

import { AlbumCreateForm } from "@/components/admin/AlbumCreateForm";
import { createAlbum } from "@/server/actions/albums";

export default function NewAlbumPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/albums"
          className="text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← Alben
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
          Neues Album
        </h1>
        <p className="mt-1.5 text-muted">
          Nur das Nötigste zum Start. Bilder, Cover &amp; Design folgen direkt danach im Album.
        </p>
      </div>

      <AlbumCreateForm action={createAlbum} />
    </div>
  );
}
