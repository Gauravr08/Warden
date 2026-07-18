import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: process.env.E2E ? ["node_modules/**"] : ["tests/e2e/**", "node_modules/**"],
    testTimeout: 15000,
  },
});
