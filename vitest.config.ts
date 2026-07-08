import { defineConfig } from "vitest/config";

export default defineConfig({
  // DB test files share one database and truncate between tests — never run files in parallel.
  test: { include: ["tests/**/*.test.ts"], fileParallelism: false },
});
