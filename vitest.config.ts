import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    globals: false,
    clearMocks: true,
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
