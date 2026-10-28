import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // Replaces DATABASE_URL with a local/dev test database or removes it: tests never touch live.
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false, // database tests share one test database
  },
});
