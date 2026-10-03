import Link from "next/link";

import { requireAdmin } from "@/server/current-admin";
import { getStorageUsage } from "@/lib/storage-usage";
import { StorageBar } from "@/components/admin/StorageBar";

export default async function AdminDashboard() {
  const admin = await requireAdmin();
  const usage = await getStorageUsage(admin.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Dashboard
        </h1>
        <p className="mt-1.5 text-muted">
          Willkommen zurück. Verwalte deine Alben, Portfolio-Seiten und Einstellungen.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DashboardCard
          href="/admin/albums"
          icon="▦"
          title="Alben"
          description="Alben erstellen, Bilder hochladen und Freigaben verwalten."
        />
        <DashboardCard
          href="/admin/bilder"
          icon="▨"
          title="Bilder"
          description="Mediathek filtern, Portfolio-Kategorien vergeben und Fotos für die Seiten freigeben."
        />
        <DashboardCard
          href="/admin/pages"
          icon="▤"
          title="Seiten"
          description="Portfolio-Seiten bauen, Theme wählen, Website & Seiten veröffentlichen."
        />
        <DashboardCard
          href="/admin/settings"
          icon="⚙"
          title="Einstellungen"
          description="Person, Marke, Social-Links und E-Mail-Versand (SMTP)."
        />

        {/* Dezente Status-Kachel — bewusst ohne Icon-Block, damit sie neben den
            Navigations-Kacheln nicht wie ein weiterer Bereich wirkt. */}
        <Link
          href="/admin/settings"
          className="card flex flex-col justify-between p-6 transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <p className="text-[11px] uppercase tracking-[0.15em] text-muted">
            Speicherplatz
          </p>
          <div className="mt-6">
            <StorageBar
              usedBytes={usage.usedBytes}
              limitBytes={usage.limitBytes}
              compact
            />
          </div>
        </Link>
      </div>
    </div>
  );
}

function DashboardCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="card group p-6 transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
        {icon}
      </div>
      <h2 className="font-medium">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <span className="mt-4 inline-block text-sm font-medium text-accent">Öffnen →</span>
    </Link>
  );
}
