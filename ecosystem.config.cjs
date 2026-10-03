// pm2-Prozessdefinition für den NATIVEN Betrieb (Workaround ohne Docker-App).
// CommonJS (.cjs), weil package.json "type": "module" ist.
//
// Startet die Next.js-App per `next start`. Next lädt die .env aus dem cwd
// (APP_DIR) beim Start selbst; der Deploy exportiert sie zusätzlich in die
// Umgebung (siehe scripts/deploy-native.sh), damit pm2 sie an den Prozess
// weiterreicht.
//
// MEHRERE INSTANZEN auf einem Server: Prozessname und Port kommen aus der .env
// des jeweiligen Ordners (PM2_APP_NAME, PORT). Diese Datei ist damit für alle
// Instanzen identisch — nur die .env unterscheidet sich. Ohne die Variablen
// bleibt alles wie bisher (photo-hosting auf 9000), die bestehende Installation
// läuft also ohne Änderung an ihrer .env weiter.
//
// Die Datenbank läuft weiterhin im Docker-Container (nur `db`-Service) und ist
// über 127.0.0.1:${DB_PORT} erreichbar (DATABASE_URL aus der .env). Jede Instanz
// hat einen EIGENEN Container samt eigenem Volume — der Compose-Projektname
// leitet sich aus dem Ordner ab, nur DB_PORT muss je Instanz verschieden sein.
module.exports = {
  apps: [
    {
      name: process.env.PM2_APP_NAME || "photo-hosting",
      // Direkt das Next-CLI aufrufen (robuster als `npm start` unter pm2).
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1",
      instances: 1,
      exec_mode: "fork",
      // Port 9000: dieselbe Adresse, auf die im Docker-Betrieb der App-Container
      // gemappt wird — Domain/Reverse-Proxy müssen nicht angepasst werden.
      // Eine zweite Instanz setzt PORT in ihrer .env (z. B. 9001).
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 9000,
        HOSTNAME: "127.0.0.1",
        // Heap-Limit wie im Docker-Runtime.
        NODE_OPTIONS: "--max-old-space-size=512",
      },
      max_memory_restart: "1G",
      // Kein Auto-Restart-Sturm bei Fehlstart.
      min_uptime: "10s",
      max_restarts: 10,
    },
  ],
};
