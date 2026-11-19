import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests for the pure domain layer (src/lib).
 *
 * Kept separate from vite.config.ts so tests do not load the React/Tailwind
 * plugins or the build-only HTML transforms. Only src/ is searched: the repo
 * contains other checkouts (e.g. .kilo/worktrees) whose Hardhat tests would
 * otherwise be picked up.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
