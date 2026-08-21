import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // Covers both suites; `pnpm test` / `pnpm test:integration` pass a path filter (see
    // package.json) so the default PR pipeline (Phase 14) only ever runs tests/unit, which
    // needs no external services. tests/integration expects `docker compose up` to be running.
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
      // See tests/stubs/server-only.ts for why this is scoped to just this one package.
      "server-only": path.resolve(dirname, "./tests/stubs/server-only.ts"),
    },
  },
});
