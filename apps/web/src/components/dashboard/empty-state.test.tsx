import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("annonce un état vide sans faire passer un zéro pour une donnée réelle", () => {
    const html = renderToStaticMarkup(<EmptyState />);

    expect(html).toContain("Aucune donnée pour l’instant.");
    expect(html).toContain("L’API sera branchée à l’étape d’intégration.");
  });
});
