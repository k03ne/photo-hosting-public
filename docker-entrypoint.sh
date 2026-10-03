#!/bin/sh
set -e

# Migrationen anwenden, bevor die App startet.
# Prisma-CLI direkt per node (kein npx/.bin im schlanken Standalone-Image).
echo "→ Wende Datenbank-Migrationen an..."
node node_modules/prisma/build/index.js migrate deploy

# Ersten Admin idempotent anlegen (nur wenn ADMIN_* gesetzt).
echo "→ Stelle Admin-Konto sicher..."
node prisma/seed.cjs

echo "→ Starte App..."
exec "$@"
