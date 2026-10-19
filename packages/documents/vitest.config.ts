import { defineConfig } from "vitest/config";

// Les tests rendent de vrais PDF ; le premier rendu charge le moteur et les
// polices, et sous la charge parallèle de turbo il dépasse les 5 s par défaut.
// Le runtime JSX automatique est déclaré pour que les sources .tsx compilent
// sans configuration implicite propre à un seul environnement.
export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  test: { testTimeout: 20000 },
});
