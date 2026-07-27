import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";

// .env.test is loaded HERE, at config time, and injected via `test.env` so the
// values are already in process.env before any src/ module is imported.
// src/config/env.ts calls `import "dotenv/config"` at module load, and dotenv
// does not overwrite variables that are already set — so pre-seeding them this
// way is what keeps the real backend/.env (and the real Supabase project) out
// of the test run.
const testEnv = loadEnv({ path: ".env.test" }).parsed ?? {};

export default defineConfig({
  test: {
    environment: "node",
    env: testEnv,
    globalSetup: ["./tests/setup/globalSetup.ts"],
    // Integration tests share one Postgres database and truncate between
    // files, so they must not run concurrently. A single fork keeps that
    // simple and deterministic; the suite is small enough that the lost
    // parallelism costs little.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    // Tesseract OCR is genuinely slow on real images.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
