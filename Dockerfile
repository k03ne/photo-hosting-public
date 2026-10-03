# syntax=docker/dockerfile:1

# ─── deps ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
# libc6-compat für sharp/prisma auf Alpine
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# Der Build läuft auf einem ressourcenarmen Server, dessen Prozess-/Thread-Limit
# (RLIMIT_NPROC) beim parallelen Abarbeiten der npm-Postinstall-Skripte gesprengt
# wird: esbuild (via tsx) scheitert dann beim fork() mit EAGAIN, Prisma bricht den
# Engine-Download mit SIGABRT ab (Node kann seine Worker-Threads nicht starten).
# Gegenmittel: pro Node-Prozess winzige Thread-Pools (libuv + V8) erzwingen und
# die Skripte nacheinander statt parallel ausführen (--foreground-scripts). So
# bleibt die Zahl gleichzeitiger Threads klar unter dem Limit; alle Postinstalls
# (Prisma-Engines-Download, sharp …) laufen dabei normal durch.
# Zusätzlich: maxsockets=1 senkt die gleichzeitigen Downloads/Extraktionen (weniger
# parallele Threads → hält das RLIMIT_NPROC-Limit sicher ein); fetch-retries fangen
# transiente Netz-/Ressourcen-Aussetzer ab, statt den ganzen Install abzubrechen.
ENV UV_THREADPOOL_SIZE=1 NODE_OPTIONS="--v8-pool-size=1" \
    NPM_CONFIG_MAXSOCKETS=1 \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
RUN npm ci --foreground-scripts --no-audit --no-fund

# ─── builder ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Gleiche Thread-Drosselung wie im deps-Stage: prisma generate startet die
# Query-Engine und würde sonst am Prozess-/Thread-Limit des Servers scheitern.
RUN UV_THREADPOOL_SIZE=1 NODE_OPTIONS="--v8-pool-size=1" npx prisma generate
# Speicher-/Worker-Limits für den Build auf ressourcenbeschränkten Servern.
# next build ist der schwerste Schritt und trifft dasselbe Prozess-/Thread-Limit
# wie zuvor die Installationsskripte. Daher nur EIN Build-Worker und minimale
# Thread-Pools (libuv + V8) erzwingen; der Heap bleibt großzügig, damit kein
# "JavaScript heap out of memory" entsteht. Telemetry aus (kein Netz-Roundtrip).
ENV NEXT_TELEMETRY_DISABLED=1
RUN NODE_OPTIONS="--max-old-space-size=4096 --v8-pool-size=1" \
    NEXT_PRIVATE_MAX_WORKERS=1 \
    UV_THREADPOOL_SIZE=1 \
    npm run build

# ─── runner ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone-Output von Next.js
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Vollständige node_modules aus dem Builder: enthält generierten Prisma-Client,
# die Prisma-CLI samt transitiver Deps (effect, @prisma/config, …), sharp (musl)
# und bcryptjs für den Entrypoint-Seed. Robuster als selektives Kopieren, da npm
# Abhängigkeiten ins Root-node_modules hebt.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Upload-Verzeichnis (wird per Volume gemountet)
RUN mkdir -p /app/storage/uploads && chown -R nextjs:nodejs /app/storage

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
