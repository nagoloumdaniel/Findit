import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  test: {
    // Les tests Playwright vivent dans `e2e/` et sont lancés par `test:e2e`,
    // jamais par Vitest.
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
});
