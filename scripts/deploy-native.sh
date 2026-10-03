#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Nativer Deploy per pm2 — WORKAROUND, solange der Docker-Build auf dem Server
# klemmt. Docker (docker-compose.yml + Dockerfile) bleibt das langfristige Ziel
# und wird von diesem Skript NICHT angefasst.
#
# Läuft AUF dem Server im Deploy-Verzeichnis (APP_DIR). Die Datenbank bleibt der
# bestehende Docker-Container — es wird nur der `db`-Service gestartet, die App
# läuft nativ per pm2 (Port 9000, sofern die .env nichts anderes sagt).
#
# MEHRERE INSTANZEN: dasselbe Skript, ein Ordner je Instanz. Prozessname, Port,
# Compose-Projekt und Datenbank kommen aus der .env des Ordners — hier steht
# nichts Instanzspezifisches.
#
# Aufruf:  bash scripts/deploy-native.sh [APP_DIR]
#          (APP_DIR default = aktuelles Verzeichnis)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="${1:-$PWD}"
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "  FEHLER: $APP_DIR/.env fehlt. Bitte anhand von .env.example anlegen." >&2
  exit 1
fi

# .env in die Umgebung laden: das Seed-Skript (prisma/seed.cjs) liest
# ADMIN_*/DATABASE_URL direkt aus process.env, und pm2 gibt die Umgebung per
# `--update-env` an die App weiter. (Next lädt .env beim build/start zusätzlich
# selbst — dies ist die zuverlässige Ergänzung für seed/migrate/pm2.)
set -a
# shellcheck disable=SC1091
. ./.env
set +a

# ─── node/npm auffindbar machen ──────────────────────────────────────────────
# Der Deploy kommt über eine NICHT-interaktive SSH-Session. Die liest weder
# ~/.bashrc noch ~/.profile — also auch nicht die PATH-Zeile, die nvm, fnm oder
# volta dort hinterlegen. `docker` lag immer systemweit und war deshalb nie ein
# Problem; `npm` nur so lange, wie Node systemweit installiert war. Nach einem
# Serverwechsel bricht der Deploy sonst mit „npm: command not found" (Status
# 127) ab — und zwar erst mitten im Lauf, was die Ursache gut versteckt.
#
# Reihenfolge: ausdrückliche Angabe aus der .env gewinnt, dann nvm (das npm
# erst beim Sourcen bereitstellt — es ist eine Shell-Funktion, kein Binary),
# dann die üblichen Installationsorte.
ensure_node() {
  command -v npm >/dev/null 2>&1 && return 0

  # Notausgang: NODE_BIN_DIR in der .env der Instanz.
  if [ -n "${NODE_BIN_DIR:-}" ] && [ -x "${NODE_BIN_DIR}/npm" ]; then
    PATH="${NODE_BIN_DIR}:$PATH"; export PATH
    return 0
  fi

  for nvm_sh in "${NVM_DIR:-$HOME/.nvm}/nvm.sh" /usr/local/nvm/nvm.sh /opt/nvm/nvm.sh; do
    if [ -s "$nvm_sh" ]; then
      # nvm.sh ist nicht auf `set -eu` ausgelegt.
      set +eu
      # shellcheck disable=SC1090
      . "$nvm_sh"
      set -eu
      command -v npm >/dev/null 2>&1 && return 0
    fi
  done

  for dir in "$HOME/.fnm/aliases/default/bin" \
             "$HOME/.local/share/fnm/aliases/default/bin" \
             "$HOME/.volta/bin" \
             "$HOME/.local/bin" \
             /usr/local/bin /opt/node/bin /snap/bin; do
    if [ -x "$dir/npm" ]; then
      PATH="$dir:$PATH"; export PATH
      return 0
    fi
  done

  # nvm vorhanden, aber nvm.sh fehlt: jüngste Version direkt nehmen. Bewusst
  # per Glob statt `ls | sort -V | tail` — die Auflösung soll nicht davon
  # abhängen, dass Coreutils im PATH liegen. Die Glob-Expansion sortiert
  # lexikografisch, was bei zweistelligen Major-Versionen (v18 und höher, und
  # darunter läuft dieses Projekt nicht) der Versionsordnung entspricht.
  local cand newest=""
  for cand in "${NVM_DIR:-$HOME/.nvm}"/versions/node/*/bin; do
    [ -x "$cand/npm" ] && newest="$cand"
  done
  if [ -n "$newest" ]; then
    PATH="$newest:$PATH"; export PATH
    return 0
  fi

  return 1
}

if ! ensure_node; then
  echo "  FEHLER: npm nicht gefunden." >&2
  echo "  Der Deploy läuft in einer nicht-interaktiven Shell — ein per nvm/fnm" >&2
  echo "  in ~/.bashrc eingerichteter PATH greift hier nicht. Abhilfe, eine davon:" >&2
  echo "    * NODE_BIN_DIR in der .env dieser Instanz auf das bin-Verzeichnis" >&2
  echo "      setzen (z.B. \$HOME/.nvm/versions/node/v22.x.y/bin) — am schnellsten," >&2
  echo "    * oder Node systemweit installieren (nodesource/Distributionspaket)," >&2
  echo "    * oder den PATH in /etc/profile.d/node.sh exportieren." >&2
  echo "  Gefunden werden automatisch: nvm, fnm, volta, /usr/local/bin." >&2
  exit 1
fi
NPM_PATH="$(command -v npm)"
echo "→ Node $(node -v) / npm $(npm -v) aus ${NPM_PATH%/*}"

# Ressourcen-Drosselung wie im Dockerfile: der ressourcenarme Server sprengt
# sonst sein Prozess-/Thread-Limit (RLIMIT_NPROC) — esbuild scheitert am fork()
# mit EAGAIN, Prisma bricht den Engine-Download mit SIGABRT ab.
export UV_THREADPOOL_SIZE=1
export NODE_OPTIONS="--v8-pool-size=1"
export NEXT_TELEMETRY_DISABLED=1

# Instanz-Kennung (aus der .env; Fallback = bisheriges Verhalten).
APP_NAME="${PM2_APP_NAME:-photo-hosting}"
APP_PORT="${PORT:-9000}"
echo "→ Instanz: $APP_NAME auf Port $APP_PORT (${COMPOSE_PROJECT_NAME:-Projektname aus Ordner})"

echo "→ Datenbank-Container sicherstellen (nur db)…"
# Eigener Container + eigenes Volume je Instanz: den Namensraum liefert der
# Compose-Projektname, der sich aus dem Ordner ableitet (bzw. aus dem oben
# exportierten COMPOSE_PROJECT_NAME). Geteilt wird nur der Docker-Daemon.
docker compose up -d db

echo "→ Dependencies installieren…"
NPM_CONFIG_MAXSOCKETS=1 \
NPM_CONFIG_FETCH_RETRIES=5 \
  npm ci --foreground-scripts --no-audit --no-fund

echo "→ Prisma-Client generieren…"
npx prisma generate

echo "→ Datenbank-Migrationen anwenden…"
npx prisma migrate deploy

echo "→ Admin-Konto sicherstellen (idempotent, nur wenn ADMIN_* gesetzt)…"
node prisma/seed.cjs

echo "→ App bauen (gedrosselt)…"
NODE_OPTIONS="--max-old-space-size=4096 --v8-pool-size=1" \
NEXT_PRIVATE_MAX_WORKERS=1 \
  npm run build

echo "→ pm2 sicherstellen…"
if ! command -v pm2 >/dev/null 2>&1; then
  echo "  pm2 nicht gefunden — installiere global…"
  npm install -g pm2
fi

# pm2 liest bei `reload`/`restart` nur Env und Args eines BESTEHENDEN Eintrags
# neu — das `script`-Feld aus der ecosystem.config.cjs ignoriert es. Genau daran
# ist der Deploy vom 03.10.2026 gescheitert: der Eintrag stammte noch aus der
# Zeit, als die App per `npm start` lief, bekam aber die inzwischen geänderten
# Args `start -H 127.0.0.1`. npm kennt `-H` nicht, druckte seine Usage und
# beendete sich — pm2 startete im Takt neu, nichts lauschte auf dem Port, und
# nginx lieferte folgerichtig 502. Weicht der hinterlegte Pfad ab, muss der
# Eintrag also verworfen und neu angelegt werden.
EXPECTED_EXEC="$(pwd)/node_modules/next/dist/bin/next"
CURRENT_EXEC="$(pm2 jlist 2>/dev/null | node -e '
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try {
      const app = JSON.parse(raw).find((a) => a.name === process.argv[1]);
      process.stdout.write(app?.pm2_env?.pm_exec_path ?? "");
    } catch {
      // Keine verwertbare Liste -> wie "Eintrag existiert nicht" behandeln.
    }
  });
' "$APP_NAME" 2>/dev/null || true)"

if [ -n "$CURRENT_EXEC" ] && [ "$CURRENT_EXEC" != "$EXPECTED_EXEC" ]; then
  echo "  pm2-Eintrag zeigt auf $CURRENT_EXEC statt $EXPECTED_EXEC."
  echo "  Eintrag verwerfen, damit das script-Feld neu greift…"
  pm2 delete "$APP_NAME" || true
fi

echo "→ App per pm2 starten/neu laden…"
# startOrReload: startet beim ersten Mal, danach Reload mit frischer Umgebung.
# Der Prozessname kommt aus PM2_APP_NAME (ecosystem.config.cjs) — mehrere
# Instanzen stehen so nebeneinander in `pm2 list`, statt sich zu überschreiben.
pm2 startOrReload ecosystem.config.cjs --update-env
# Prozessliste persistieren (für `pm2 resurrect` nach Server-Reboot, sofern
# `pm2 startup` einmalig eingerichtet wurde — siehe README/Deploy-Notizen).
pm2 save

echo "✓ Nativer Deploy abgeschlossen: $APP_NAME läuft per pm2 auf Port $APP_PORT."
