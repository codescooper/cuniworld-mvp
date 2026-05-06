import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dir,
  envDir: __dir,
});
