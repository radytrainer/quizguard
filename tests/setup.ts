import { loadEnvConfig } from "@next/env";

import "@testing-library/jest-dom/vitest";

// Loads .env.local the same way Next.js does, so integration tests that import lib/env,
// lib/db, or lib/redis see real connection strings instead of failing validation.
loadEnvConfig(process.cwd());
