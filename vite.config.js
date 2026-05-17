import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { execSync } from "child_process";
import { readFileSync } from "fs";

const __dir = dirname(fileURLToPath(import.meta.url));

function safe(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

const pkg = safe(
  () => JSON.parse(readFileSync(resolve(__dir, "package.json"), "utf-8")),
  { version: "0.0.0" },
);

const commit = safe(
  () => execSync("git rev-parse --short HEAD", { cwd: __dir }).toString().trim(),
  "dev",
);

const buildTime = new Date().toISOString();

export default defineConfig({
  root: __dir,
  envDir: __dir,
  base: process.env.GITHUB_PAGES === "true" ? "/cuniworld-mvp/" : "./",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || "0.0.0"),
    __APP_COMMIT__:  JSON.stringify(commit),
    __APP_BUILD_TIME__: JSON.stringify(buildTime),
  },
  build: {
    rollupOptions: {
      output: {
        // Code-splitting des vendors lourds. Le SDK Supabase pèse ~100 kB
        // gzip à lui seul ; l'isoler dans son propre chunk allège le
        // bundle initial et donne un cache HTTP plus efficace (le SDK
        // change rarement, le code métier souvent).
        manualChunks: {
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
