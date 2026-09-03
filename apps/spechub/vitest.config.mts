import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests for the pure modules only — the layout maths, the gap scanner,
 * the spec pairer, the chunkers. They take plain objects and return plain
 * objects, so they need no database, no network and no mocks.
 *
 * Anything that reaches for Supabase or Next is deliberately out of scope
 * here: a test that has to mock the client mostly asserts that the mock was
 * written to match the code, which is the one thing it cannot check.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // The shared packages are covered from here rather than getting their own
    // runner: they are plain TypeScript with relative imports, and one test
    // command is one thing to remember.
    include: ["src/**/*.test.ts", "../../packages/*/src/**/*.test.ts"],
    environment: "node",
  },
});
