"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { InfoHint } from "@/components/admin/InfoHint";
import { isExternalHref, type MenuItem, type SocialsMode } from "@/lib/menu-items";
import { setMenuSettings, setSiteMenu } from "@/server/actions/pages";

export type MenuPageOption = { id: string; title: string; href: string };
/** Ein gepflegter Social-Kanal — `href` nur zur Anzeige im Editor. */
export type MenuSocialOption = { key: string; label: string; href: string };

const SOCIALS_LABELS: Record<SocialsMode, string> = {
  corner: "In der Ecke",
  menu: "Im Menü",
  off: "Aus",
};

/**
 * Das Menü der Website: Einträge kuratieren (Reihenfolge, eigene und externe
 * Links) und festlegen, wo die Social-Kanäle auftauchen.
 *
 * Solange nichts gespeichert wurde, leitet die Website das Menü automatisch aus
 * den veröffentlichten Seiten ab. Der Editor startet mit genau dieser Liste —
 * wer speichert, übernimmt sie als feste Auswahl; neue Seiten tauchen dann nicht
 * mehr von selbst auf. Das steht so auch in der UI, sonst ist der Wechsel von
 * „automatisch" zu „kuratiert" unsichtbar.
 */
export function MenuCard({
  enabled,
  initialItems,
  autoItems,
  curated,
  pages,
  socials,
  socialsMode: initialMode,
  socialKeys: initialKeys,
}: {
  enabled: boolean;
  /** Startzustand des Editors (kuratiert, sonst die automatische Ableitung). */
  initialItems: MenuItem[];
  /** Die automatische Ableitung — für „Automatisch aufbauen". */
  autoItems: MenuItem[];
  /** Ist bereits kuratiert? Nur für den Hinweistext. */
  curated: boolean;
  pages: MenuPageOption[];
  socials: MenuSocialOption[];
  socialsMode: SocialsMode;
  /** Ausgewählte Kanäle; `null` = alle gepflegten (auch künftige). */
  socialKeys: string[] | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState<MenuItem[]>(initialItems);
  const [mode, setMode] = useState<SocialsMode>(initialMode);
  const [keys, setKeys] = useState<string[] | null>(initialKeys);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, start] = useTransition();

  const pageById = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);
  const usedPageIds = new Set(items.filter((i) => i.t === "page").map((i) => i.id));
  const addablePages = pages.filter((p) => !usedPageIds.has(p.id));

  // Schnappschuss-Vergleich statt Änderungs-Flags: die Einträge werden an vielen
  // Stellen angefasst (verschieben, tippen, entfernen).
  const snapshot = JSON.stringify({ items, mode, keys });
  const baseline = useMemo(
    () => JSON.stringify({ items: initialItems, mode: initialMode, keys: initialKeys }),
    [initialItems, initialMode, initialKeys],
  );
  const dirty = snapshot !== baseline;

  function update(next: MenuItem[]) {
    setItems(next);
    setSaved(false);
    setError(null);
  }

  function move(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[index], next[to]] = [next[to], next[index]];
    update(next);
  }

  function remove(index: number) {
    update(items.filter((_, i) => i !== index));
  }

  function patchLink(index: number, patch: Partial<Extract<MenuItem, { t: "link" }>>) {
    update(
      items.map((it, i) => (i === index && it.t === "link" ? { ...it, ...patch } : it)),
    );
  }

  function addPage(id: string) {
    if (!id) return;
    update([...items, { t: "page", id }]);
  }

  function addLink() {
    update([...items, { t: "link", label: "", href: "", blank: true }]);
  }

  function toggleKey(key: string) {
    // `null` heißt „alle" — für die Auswahl wird daraus zuerst die konkrete Liste.
    const current = keys ?? socials.map((s) => s.key);
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    setKeys(next);
    setSaved(false);
  }

  const activeKeys = keys ?? socials.map((s) => s.key);

  function save() {
    setError(null);
    const bad = items.some((it) => it.t === "link" && (!it.label.trim() || !it.href.trim()));
    if (bad) {
      setError("Jeder freie Link braucht Beschriftung und Ziel.");
      return;
    }
    const payload = {
      items,
      socialsMode: mode,
      // Sind alle gepflegten Kanäle gewählt, wieder auf „alle" zurückfallen —
      // sonst bliebe ein später ergänzter Kanal unsichtbar.
      socialKeys:
        socials.length > 0 && activeKeys.length === socials.length ? null : activeKeys,
    };
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));
    start(async () => {
      try {
        await setMenuSettings(fd);
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
      }
    });
  }

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            Menü
            <InfoHint text="Burger-Menü oben rechts — auf jeder Seite der Website, auch auf der Startseite. Einträge, Reihenfolge und externe Links legst du hier fest." />
          </h2>
          <p className="mt-1 text-sm text-muted">
            {enabled
              ? "Erscheint oben rechts auf allen Seiten."
              : "Ausgeblendet — Besucher haben keine Navigation."}
          </p>
        </div>
        {/* Ein klarer Schalter: sendet immer den GEGEN-Zustand. */}
        <form action={setSiteMenu} className="shrink-0">
          <button
            type="submit"
            name="enabled"
            value={enabled ? "off" : "on"}
            role="switch"
            aria-checked={enabled}
            aria-label="Menü anzeigen"
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
              enabled ? "bg-accent" : "bg-neutral-300 dark:bg-neutral-600"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </form>
      </div>

      {/* ── Einträge ─────────────────────────────────────────────────────── */}
      <div className="mt-4 border-t pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-muted">Einträge</p>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => update(autoItems)}
              className="text-xs text-muted underline transition hover:text-ink"
              title="Reihenfolge aus den veröffentlichten Seiten neu aufbauen — freie Links gehen dabei verloren."
            >
              Automatisch aufbauen
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Leeres Menü — es wird auf der Website nicht angezeigt.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {items.map((it, i) => (
              <li key={it.t === "page" ? `p-${it.id}` : `l-${i}`} className="rounded-lg border p-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {it.t === "page" ? (
                      <PageRow page={pageById.get(it.id)} />
                    ) : (
                      <LinkRow
                        item={it}
                        onChange={(patch) => patchLink(i, patch)}
                      />
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <RowButton
                      label="Nach oben"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </RowButton>
                    <RowButton
                      label="Nach unten"
                      disabled={i === items.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </RowButton>
                    <RowButton label="Entfernen" onClick={() => remove(i)}>
                      ✕
                    </RowButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value=""
            onChange={(e) => {
              addPage(e.target.value);
              e.target.value = "";
            }}
            disabled={addablePages.length === 0}
            className="input py-1.5 text-sm disabled:opacity-50"
            aria-label="Seite zum Menü hinzufügen"
          >
            <option value="">
              {addablePages.length === 0 ? "Alle Seiten im Menü" : "Seite hinzufügen …"}
            </option>
            {addablePages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addLink}
            className="chip border px-3 py-1.5 transition hover:border-ink"
          >
            Link hinzufügen
          </button>
        </div>

        {!curated && (
          <p className="mt-2 text-xs text-muted">
            Aktuell folgt das Menü automatisch deinen veröffentlichten Seiten. Sobald du
            speicherst, gilt die Liste oben fest — neue Seiten musst du dann selbst
            hinzufügen.
          </p>
        )}
      </div>

      {/* ── Social-Links ─────────────────────────────────────────────────── */}
      <div className="mt-4 border-t pt-4">
        <p className="text-xs uppercase tracking-wide text-muted">Social-Links</p>
        {socials.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Noch keine Kanäle gepflegt — unter Einstellungen → Marke.
          </p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Platzierung">
              {(Object.keys(SOCIALS_LABELS) as SocialsMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setSaved(false);
                  }}
                  aria-pressed={mode === m}
                  className={`chip px-3 py-1.5 transition ${
                    mode === m
                      ? "bg-accent text-[hsl(var(--accent-ink))]"
                      : "border hover:border-ink"
                  }`}
                >
                  {SOCIALS_LABELS[m]}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {mode === "corner"
                ? "Stehen unten in der Ecke der Startseite."
                : mode === "menu"
                  ? "Stehen als eigene Gruppe unten im Burger-Menü."
                  : "Werden nirgends angezeigt."}
            </p>

            {mode !== "off" && (
              <ul className="mt-3 space-y-1">
                {socials.map((s) => (
                  <li key={s.key}>
                    <label className="flex items-center gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={activeKeys.includes(s.key)}
                        onChange={() => toggleKey(s.key)}
                        className="h-4 w-4"
                      />
                      <span className="font-medium">{s.label}</span>
                      <span className="truncate text-xs text-muted">{s.href}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      <div className="mt-4 flex items-center justify-end gap-3">
        {saved && !dirty && <span className="text-xs text-muted">Gespeichert.</span>}
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="btn-accent disabled:opacity-50"
        >
          {busy ? "Speichert …" : "Speichern"}
        </button>
      </div>
    </section>
  );
}

/** Verweis auf eine eigene Seite — Beschriftung folgt der Seite. */
function PageRow({ page }: { page: MenuPageOption | undefined }) {
  if (!page) {
    return (
      <p className="py-1 text-sm text-amber-600">
        Seite nicht mehr veröffentlicht — der Eintrag bleibt gespeichert und kehrt zurück,
        sobald sie wieder live ist.
      </p>
    );
  }
  return (
    <p className="flex min-w-0 items-baseline gap-2 py-1">
      <span className="truncate text-sm font-medium">{page.title}</span>
      <span className="shrink-0 text-xs text-muted">{page.href}</span>
    </p>
  );
}

/** Freier Link: Beschriftung, Ziel und ob er einen neuen Tab öffnet. */
function LinkRow({
  item,
  onChange,
}: {
  item: Extract<MenuItem, { t: "link" }>;
  onChange: (patch: Partial<Extract<MenuItem, { t: "link" }>>) => void;
}) {
  const external = isExternalHref(item.href);
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <input
          value={item.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Beschriftung"
          maxLength={60}
          className="input w-1/3 py-1.5 text-sm"
          aria-label="Beschriftung"
        />
        <input
          value={item.href}
          onChange={(e) => onChange({ href: e.target.value })}
          placeholder="https://… oder /seite"
          maxLength={400}
          className="input min-w-0 flex-1 py-1.5 text-sm"
          aria-label="Ziel"
        />
      </div>
      {/* Nur bei fremden Zielen sinnvoll — die eigene Website im neuen Tab zu
          öffnen ist fast immer ein Versehen. */}
      {external && (
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={item.blank ?? true}
            onChange={(e) => onChange({ blank: e.target.checked })}
            className="h-3.5 w-3.5"
          />
          In neuem Tab öffnen
        </label>
      )}
    </div>
  );
}

function RowButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="grid h-7 w-7 place-items-center rounded-md border text-xs transition hover:border-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}
