import { defineConfig } from "vitest/config";

// Les tests rendent de vrais PDF ; le premier rendu charge le moteur et les
// polices, et sous la charge parallèle de turbo il dépasse les 5 s par défaut.
export default defineConfig({
  test: { testTimeout: 20000 },
});
