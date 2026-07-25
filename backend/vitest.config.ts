import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const src = fileURLToPath(new URL("./src", import.meta.url))

export default defineConfig({
  resolve: {
    alias: { "@": src },
  },
  test: {
    globals: true,
    projects: [
      {
        resolve: { alias: { "@": src } },
        test: {
          name: "unit",
          environment: "node",
          globals: true,
          include: ["src/**/*.test.ts"],
          exclude: ["src/tests/**"],
        },
      },
      {
        resolve: { alias: { "@": src } },
        test: {
          name: "integration",
          environment: "node",
          globals: true,
          include: ["src/tests/**/*.test.ts"],
          globalSetup: ["./src/tests/global-setup.ts"],
          setupFiles: ["./src/tests/setup.ts"],
          // One Postgres, one worker: parallel workers sharing a database make
          // truncation racy and every gate flaky (plan risk R5).
          pool: "threads",
          poolOptions: { threads: { singleThread: true } },
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/tests/**",
        "src/types/**",
        "src/server.ts",
        "src/docs/**",
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        "src/modules/risk-engine/**": {
          lines: 90,
          branches: 90,
          functions: 90,
          statements: 90,
        },
        "src/modules/priority-engine/**": {
          lines: 90,
          branches: 90,
          functions: 90,
          statements: 90,
        },
        "src/modules/ingestion/**": {
          lines: 80,
          branches: 75,
          functions: 80,
          statements: 80,
        },
        "src/modules/incidents/**": {
          lines: 80,
          branches: 70,
          functions: 80,
          statements: 80,
        },
        "src/modules/acknowledgments/**": {
          lines: 80,
          branches: 70,
          functions: 80,
          statements: 80,
        },
        "src/modules/actuation/**": {
          lines: 80,
          branches: 70,
          functions: 80,
          statements: 80,
        },
      },
    },
  },
})
