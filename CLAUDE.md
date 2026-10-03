# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Self-hosted photo-hosting platform: a protected admin area where a photographer manages albums, and a public, optionally password-protected guest gallery per album. German is the UI language and the language used in code comments.

## Commands

```bash
npm run dev          # Next.js dev server (localhost:3000)
npm run build        # production build (also the CI/Docker build gate)
npm run lint         # next lint
npm run db:migrate   # prisma migrate dev  (creates + applies a migration locally)
npm run db:generate  # prisma generate     (regenerate client after schema edits)
npm run db:seed      # tsx prisma/seed.ts  (creates first admin from ADMIN_* env)
npm run db:studio    # prisma studio
```

There is **no test suite**. Verify changes with `npm run build` (Next does type-checking + prerender) and, when a database isn't available locally, `DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma validate` for schema-only checks. `next lint` currently prompts for interactive ESLint setup and is not wired up — rely on `build` for type safety.

Requires a running PostgreSQL (see `.env.example`; `docker-compose up db`). Copy `.env.example` to `.env` first.

## Migrations without a local DB

`prisma migrate dev` needs a live database. When none is available, hand-write the migration: add the field to `prisma/schema.prisma`, create `prisma/migrations/<timestamp>_<name>/migration.sql` (timestamp must sort after the latest folder), then run `npx prisma generate` so the client types update. `prisma migrate deploy` applies pending migrations on deploy (it runs in `docker-entrypoint.sh` before the app starts).

## Architecture

Next.js 15 App Router. Route groups under `src/app`:

- `admin/(protected)/*` — photographer UI. Protected by `src/middleware.ts` (matcher `/admin/:path*`) which runs the **edge-safe** `auth.config.ts` (no Prisma in the middleware bundle). Server Components/Actions additionally call `requireAdmin()` (`src/server/current-admin.ts`).
- `(public)/a/[shareToken]/*` — guest gallery. `shareToken` resolves via `albumByIdentifier()` (`src/lib/share-lookup.ts`) by either the crypto token or a readable slug. Only published albums resolve; otherwise 404 (existence is not leaked).
- `page.tsx` (root `/`) + `(public)/[slug]` — the public portfolio website (see *Public website & Startseite* below).
- `api/*` — media serving, uploads, downloads, NextAuth.

### Auth & identity — three distinct mechanisms

1. **Admin**: Auth.js Credentials + bcrypt. `src/auth.ts` (full config, Prisma) vs `src/auth.config.ts` (edge-safe, used by middleware). Keep Prisma out of `auth.config.ts`.
2. **Album password gate**: not a session. `src/lib/album-access.ts` sets a per-album cookie whose value is an HMAC-SHA256 of the album id (keyed by `AUTH_SECRET`). `hasAccess(albumId)` verifies it. The share page skips loading photos entirely until access is granted, and `api/media/[...key]` re-checks it per file (see below). All `AUTH_SECRET`-derived secrets go through `appSecret()` (`src/lib/app-secret.ts`), which **throws in production** when the variable is unset — the old hardcoded fallback made album cookies forgeable.
3. **Guests**: anonymous `guest_id` cookie (`src/server/guest.ts`), used to attribute likes/comments without accounts.

### Data model (`prisma/schema.prisma`)

Admin → Album → Photo → Comment/Reaction (cascade deletes). Key `Photo` fields:
- `sortOrder` — manual drag-drop order; **this is what the gallery renders by**. Auto-sort features compute an order client-side and persist it via the `reorderPhotos` action.
- `deletedAt` — **soft delete** (trash for undo). Delete actions set it and keep the files; a purge in `photos.ts` removes files+rows for entries older than 1h. **Every query that lists photos for display/download must filter `deletedAt: null`** (share page, download route, admin album page + `_count`, albums list `_count`, RAW matching, interactions).
- `storageKey` — base key; variants derive as `<key>.webp` and `<key>_thumb.webp`. `originalKey`/`rawKey` are the downloadable source and optional RAW companion.
- `demoSource`/`demoCredit` — placeholder photos pulled from Unsplash to fill empty albums or the start page (`src/lib/unsplash.ts`, `src/server/actions/demo.ts`). They run through the same `processImage()` pipeline as real uploads, so they behave identically; `demoSource` is the only handle for finding them again (bulk hide/trash). Gated on `UNSPLASH_ACCESS_KEY` — unset hides the whole feature in the admin UI. `DEMO_SOURCE` lives in `unsplash.ts`, not the action file: `"use server"` modules may only export async functions. The import is **two-step** — `prepareDemoImport` (list + album) then one `importDemoPhoto` per image, driven by the client so `DemoPhotosPanel` can show real "Bild 7 von 12" progress; `finishDemoImport` revalidates once at the end. Because the photo metadata round-trips through the client, every fetch of a client-supplied URL goes through `assertUnsplashUrl()` (host allowlist, SSRF). Unsplash sends no reset timestamp, so `UnsplashRateLimitError.resetAt` is an estimate to the next full hour and is labelled as such in the UI; the mandatory `trackDownload` call also counts against the 50/h quota (N images ≈ N+1 requests).

### Storage abstraction (`src/lib/storage/`)

`getStorage()` returns a `StorageDriver` (`local.ts` filesystem or `s3.ts`) chosen by `STORAGE_DRIVER`. `get()` may return either bytes or a `redirect` (S3 presigned URL). All media is served through `api/media/[...key]` — never link storage directly; the route handles the redirect-vs-bytes distinction and path-traversal guarding. Build URLs with `mediaUrl()` (`src/lib/media.ts`).

The route also **enforces the album password per file**: it maps the key back to its photo (short in-memory cache, so a 100-thumbnail gallery is one query) and, for password-protected albums, requires the album cookie or an admin session — otherwise 404. Those responses are `Cache-Control: private` so no shared proxy retains them. Keys with no photo behind them (logo, branding) stay public.

### Fonts (`src/app/layout.tsx`)

The four families (Inter, Space Grotesk, Fraunces, Cormorant) are **local** variable fonts from `@fontsource-variable/*` via `next/font/local`, not `next/font/google`. The Google loader fetches at *build* time, and a hiccup at Google killed a deploy (`Cannot read properties of null (reading '1')` in `@next/font/.../google/loader.js`). The CSS variables (`--font-sans|display|serif|editorial`) are unchanged, so everything downstream (`color.ts`, `ThemeCard`, `ReelTheme`, Tailwind) is unaffected. To add a family: install its `@fontsource-variable/*` package and point `src` at its `*-latin-wght-normal.woff2`.

### Image pipeline (`src/lib/images.ts`)

`processImage()` runs on upload (`api/admin/albums/[id]/photos`): produces the WebP display image, thumbnail, a tiny blur placeholder, extracts selected EXIF, and **strips GPS**. `sharp` needs prebuilt platform binaries — see Docker notes below.

### Server Actions (`src/server/actions/`)

Mutations live here (`albums`, `photos`, `interactions`, `moderation`, `share`, `auth`), not in API routes. API routes are reserved for streaming/binary work (upload, media, zip download). Admin actions verify ownership via `requireAdmin()` + an `ownedPhoto`/`ownedAlbum` check, then `revalidatePath`.

### Public website & Startseite

The photographer's public site is separate from the guest galleries. Everything below is gated on `SiteSettings.portfolioEnabled` (off → a neutral "Bald verfügbar" placeholder).

- **Site owner resolution** (`getSiteOwnerId()`, `src/lib/portfolio.ts`): single-photographer app, but the public routes have no session so they must pick an owner deterministically. It picks the admin with the **most content** (albums + pages), tie-break oldest — **not** simply the oldest admin. Reason: `prisma/seed.ts` defaults to `admin@example.com` when `ADMIN_EMAIL` is unset, so setting the real email later creates a *second* admin; "oldest" would resolve to the empty ghost account and the public site would read blank settings. `scripts/admin-cleanup.ts` lists admins and can delete an empty ghost.
- **Startseite (root `/`)** is a fixed immersive WebGL theme, chosen by `SiteSettings.startTheme`: `reel` (FilmStrip) or `omnigrid`. `getStartPageData()` (`src/lib/start-page-data.ts`) assembles everything (curated items, colors, font, menu, per-theme `omni` options) from settings + branding. `StartThemeView` (`src/components/themes/StartThemeView.tsx`) renders the right theme and is shared by `/` **and** the admin preview `/admin/start-preview` so preview == live. The R3F themes load via `next/dynamic({ ssr:false })`; DOM↔canvas state goes through Zustand stores (`useThemeStore`, `useGridStore`). Curated content = `SiteSettings.startItems` (JSON, schema `src/lib/start-items.ts`), edited in `StartPageEditor`.
- **Subpages (`(public)/[slug]`)** use the block-builder (`src/themes/*`, single registered theme `immersive`; `BlockRenderer` applies theme tokens as scoped CSS vars). There is **no separate subpage theme picker** — subpages *derive* their palette/font from the Startseite via `deriveSubpageTokens()` (`src/lib/color.ts`) passed as `tokenOverrides` to `BlockRenderer`.
- **Navigation is global**: one burger menu for the whole site, top right. `src/lib/site-menu.ts` is the single source for all three consumers: the WebGL themes (via `getStartPageData`), the subpages (`SiteMenu` in `PortfolioView`), and the `MenuCard` editor on `/admin/pages`. Entries are **curated** in `SiteSettings.menuItems` (JSON, schema `src/lib/menu-items.ts` — a discriminated union of `page` refs and free `link`s, prisma-free so the client editor shares it). An **empty** list is a meaningful state: fall back to deriving from the published pages (order HOME, CUSTOM, CONTACT, IMPRINT, PRIVACY). A curated `page` ref whose page is unpublished drops out of the menu silently but stays stored and returns on republish. `getSiteNavigation()` returns menu + socials + visibility in one query; `buildSiteMenu()` is the menu-only variant. `setMenuSettings` takes a single JSON `payload` field — an ordered list of mixed entry types can't be expressed in FormData without index gymnastics — and normalizes hrefs (`example.com` → `https://example.com`, else a menu entry becomes a dead relative path). The on/off switch is global too; the column is still called `startMenuEnabled` from when the menu was Startseite-only. Anything global (theme, color, font, menu) belongs on `/admin/pages`, **not** in the Startseite editor — the only Startseite-local content setting is the filter bar, because its categories come from the curated selection.
- **Social links** are stored as **bare handles**, not URLs (`SOCIAL_PLATFORMS` in `src/lib/branding.ts` carries `host`/`path`/`at`/`placeholder`; `socialUrl()` builds the address, `normalizeSocialInput()` strips a pasted host when it matches the platform). Old rows holding a full URL still resolve — `socialUrl()` passes `http(s)://` through untouched. **Never render a stored social value as an href directly**; that is what `resolveSocials()` (site-menu) goes through. `menuSocialsMode` decides placement (`corner` | `menu` | `off`) and `menuSocialKeys` which channels show — `null` means "all maintained", so a channel added later appears automatically; `MenuCard` restores that `null` when every box is ticked.
- **Settings split** (both in `src/server/actions/pages.ts`): `setBaseSettings` = **global** appearance (contrast/color/font + `startTheme` choice), edited in `ThemeCard` on `/admin/pages` — that card only *shows* the active theme (as a scaled `ThemeMockup` SVG); everything editable lives behind "Theme anpassen" in a `Drawer`, with the theme choice itself presented as two placeholder mockups rendered in the currently selected color/font. `setStartAppearance` = **Startseite-only** OmniGrid layout (`omniCellSize`/`omniGap`/`omniAutoSpeed`/`omniShowGridLines`/`omniAlwaysColor`/`omniSubtitle`), edited in `StartAppearanceCard` inside the Startseite editor. `omniAlwaysColor` drives only the `uColor` uniform in `InfiniteGrid` (desaturation); `uHover` stays hover-driven so the planes keep reacting to pointing. Themes can be flagged `beta` in `src/lib/start-theme.ts` (`reel` currently is) — `ThemeCard` renders the chip. The OmniGrid layout preview embeds the real theme via a scaled `<iframe src="/admin/start-preview?embed=1&…">` (live query overrides render unsaved slider values 1:1; 16:9/9:16 toggle = device viewport). Site-settings actions write the **logged-in** admin's row; keep this aligned with `getSiteOwnerId` (i.e. one real admin) or the public site reads a different row.

### Site metadata & SEO

Edited under **Einstellungen → Auffindbarkeit** (`SeoCard` in the `/admin/settings` tab workspace; it used to sit on `/admin/pages` — the revalidations in `setSeoSettings` and `api/admin/site-image` point at `/admin/settings` accordingly). `src/lib/seo.ts` is the single source for title/description/favicon/OG image and the index switch; it reads `SiteSettings` of `getSiteOwnerId()` and is **wrapped in try/catch with a safe fallback** (`indexable: false`) — metadata must never take a page down. `buildSiteMetadata()` feeds `generateMetadata()` in the **root** `layout.tsx`, so it applies app-wide; that also means the previously-static routes now render dynamically (only `/_not-found` and `/admin/login` stay ○). A build without `DATABASE_URL` therefore logs a caught `prisma.admin.findMany()` / `Validation Error Count: 1` — harmless.

- **Always noindex, regardless of the switch**: `admin/(protected)/layout.tsx` and the share page `(public)/a/[shareToken]/page.tsx` export `metadata = NOINDEX`; `/admin`, `/a/` and `/api/` are disallowed in `robots.ts`, and `sitemap.ts` lists only published pages. Guest links are private and shared by link — they must never become findable.
- `seoIndexable` only counts **together with** `portfolioEnabled` (an unpublished placeholder site stays out of the index).
- `src/app/robots.ts` / `src/app/sitemap.ts` are `force-dynamic` (settings change at runtime). Both need `NEXT_PUBLIC_APP_URL` for absolute URLs; without it the sitemap stays empty instead of emitting wrong hosts.
- Favicon and OG image upload through `api/admin/site-image?kind=favicon|og` (one route, `KINDS` record with a fixed output format each: favicon → PNG 256 `fit:"contain"` transparent, OG → JPEG 1200×630 `fit:"cover"`). It replaces + deletes the old file and calls `revalidatePath("/", "layout")`, otherwise the tab keeps the old icon. Both are served through `/api/media/<key>` as photo-less (public) keys.

### Client gallery specifics

- Guest gallery: `src/components/share/Gallery.tsx` (PhotoSwipe lightbox via `react-photoswipe-gallery`; lightbox icons overridden with the outline set in `icons.tsx` + CSS in `globals.css`).
- Admin photo grid: `src/components/admin/PhotoManager.tsx` — dnd-kit drag reorder, marquee/paint selection, a client-side LIFO **undo stack** (reorder / category / soft-delete restore), and auto-sort.
- `src/components/admin/AlbumForm.tsx` — album settings as card tiles with a floating save button gated on a snapshot-based dirty check (segmented/button fields don't emit native change events, so dirty is derived by comparing a serialized snapshot to a baseline, not via form `onChange`).
- `src/components/admin/StartPageEditor.tsx` — the Startseite content grid: dnd-kit reorder and multi-select share the **same** tile surface (no separate drag handle), separated only by the 6 px `PointerSensor` activation distance — below that it stays a click and toggles selection (shift extends from the anchor). Removing entries is local state saved with the form; the bulk **category** action (`setStartSelectionCategory`) writes through immediately, because the category lives on the photo/album, not on the selection — hence the `router.refresh()` afterwards.

## Deploy: multiple instances

Several sites run from the same repo on one server, one folder per instance (one folder per domain; the concrete paths live in the `DEPLOY_PATH*` secrets, deliberately not in the repo). **The repo contains nothing instance-specific** — separation is entirely `.env`: `PM2_APP_NAME` (pm2 process), `PORT` (reverse proxy target), `DB_PORT`, `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `ADMIN_*`. `ecosystem.config.cjs` reads `PM2_APP_NAME`/`PORT` from the environment (`deploy-native.sh` sources `.env` before calling pm2) and falls back to `photo-hosting`/9000, so the pre-existing instance keeps working without touching its `.env`. Local storage is `./storage/uploads`, relative to the folder, so uploads separate on their own.

**Each instance gets its own Postgres container and its own volume**, not a second schema in a shared one: `docker compose up -d db` runs per folder, and the Compose *project name* — derived from the folder name unless `COMPOSE_PROJECT_NAME` overrides it — namespaces both the container and the `db_data` volume. Since the folders already differ, nothing extra is needed; only `DB_PORT` must differ, because two containers can't bind the same host port. **Do not set `COMPOSE_PROJECT_NAME` on an existing instance** unless it matches the name Compose already derived (`docker compose ls`) — a different value points at a *new, empty* volume, and the site comes up looking freshly installed while the old data sits in the orphaned volume.

`scripts/deploy-native.sh` resolves **node/npm itself** (`ensure_node`) before using it: the deploy arrives over a *non-interactive* SSH session, which reads neither `~/.bashrc` nor `~/.profile`, so a PATH set up by nvm/fnm/volta is invisible there. `docker` was never affected (system-wide), `npm` only as long as Node was installed system-wide — after a server rebuild the run died mid-way with `npm: command not found` (status 127). Order: `NODE_BIN_DIR` from the instance `.env`, then nvm (sourced, since its npm is a shell function), then fnm/volta/`/usr/local/bin`, then the newest `~/.nvm/versions/node/*/bin`. The fallback uses bash globbing, not `ls | sort -V | tail`, so it doesn't itself depend on coreutils being on the PATH.

`deploy-native.yml` runs a **matrix** over the instances with `max-parallel: 1` — two concurrent `next build` runs exhaust the server. The path comes from a per-instance secret (`DEPLOY_PATH`, `DEPLOY_PATH_2`) with **no in-repo default** — deploying into a guessed folder is the worse failure direction. How a missing secret is treated hangs off `required`: `"true"` fails loudly, `"false"` **skips** (`exit 0`). The same split applies to a missing `.env` in the target folder. Keep both guards keyed on `required` — hard-failing an unconfigured optional instance turns the whole matrix red and blocks the first site, which is exactly what the flag exists to prevent. Reverse-proxy config lives on the server and is not in this repo.

## Docker / deploy notes

Docker deploy is currently **inactive** (`deploy.yml` is `workflow_dispatch` only); the live path is native pm2 (above), with only the `db` service in Docker. The image builds **on the target server** (`docker compose up --build` over SSH in `.github/workflows/deploy.yml`), which is resource-constrained. The `Dockerfile` deps stage throttles this deliberately: `npm ci --foreground-scripts` with `UV_THREADPOOL_SIZE=1` and `NODE_OPTIONS=--v8-pool-size=1` to avoid `fork()`/thread-limit failures (esbuild `EAGAIN`, Prisma `SIGABRT`) when many install scripts run in parallel. `next build` is throttled the same way. Don't remove these without understanding the constraint. The runtime seed uses `prisma/seed.cjs` (plain node) — `tsx` is dev-only and must not be needed in the container.
