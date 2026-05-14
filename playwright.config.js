import { defineConfig } from "@playwright/test";

// Les tests e2e tournent contre le BUILD de production servi par `vite preview`,
// et non le dev-server. Raison : en mode dev, Vite peut re-optimiser ses
// dépendances à la volée (ex. après un changement de lockfile) et déclenche
// alors un rechargement complet de la page EN PLEIN TEST — ce qui faisait
// échouer smoke / status-blocking de façon non déterministe. Le build preview
// est statique : pas de HMR, pas de re-optimisation, pas de reload surprise.
export default defineConfig({
  testDir: "e2e",
  timeout: 60000,
  use: {
    channel: "chrome",
    headless: true,
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    // Le build peut prendre un peu de temps (Vite + define + git rev-parse).
    timeout: 180000,
  },
});
