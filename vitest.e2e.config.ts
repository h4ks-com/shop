import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/e2e/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
