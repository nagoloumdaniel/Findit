import { describe, expect, it } from "vitest";

import type { PlannerModel } from "./planner.js";
import { createLlmSourceSelector, scoreOrderSelector } from "./selector.js";
import type { SourceCandidate } from "./selector.js";

const CONTEXT = {
  objective: "alternance et stage développeur en Île-de-France",
  candidates: [
    {
      url: "https://fr.linkedin.com/jobs/x",
      domain: "fr.linkedin.com",
      score: 85,
      title: "Offres alternance",
    },
    {
      url: "https://boards.greenhouse.io/acme",
      domain: "boards.greenhouse.io",
      score: 65,
      title: "Acme jobs",
    },
    {
      url: "https://boards.greenhouse.io/acme/jobs/123",
      domain: "boards.greenhouse.io",
      score: 90,
      title: "Alternance développeur",
    },
  ] satisfies readonly SourceCandidate[],
  maxSources: 2,
};

/** Un modèle qui rend exactement ce que le test lui donne. */
const modelReturning = (value: unknown): PlannerModel => ({
  generateStructured: <T>() => Promise.resolve(value as T),
});

describe("plafond nul", () => {
  it("ne rend rien, des deux côtés, quand il n'y a pas de place", async () => {
    // Contre-exemple trouvé en revue : `slice(0, -1)` rend tout sauf le dernier.
    for (const maxSources of [0, -1]) {
      const context = { ...CONTEXT, maxSources };
      await expect(scoreOrderSelector.select(context)).resolves.toEqual({
        urls: [],
        source: "score",
      });
      const selector = createLlmSourceSelector({
        model: modelReturning({ urls: [CONTEXT.candidates[2]!.url] }),
      });
      await expect(selector.select(context)).resolves.toEqual({ urls: [], source: "score" });
    }
  });
});

describe("scoreOrderSelector", () => {
  it("rend les meilleurs scores, tronqués au plafond", async () => {
    const selection = await scoreOrderSelector.select(CONTEXT);

    expect(selection.source).toBe("score");
    expect(selection.urls).toEqual([
      "https://boards.greenhouse.io/acme/jobs/123",
      "https://fr.linkedin.com/jobs/x",
    ]);
  });
});

describe("createLlmSourceSelector", () => {
  it("suit l'ordre du modèle parmi les candidates", async () => {
    const selector = createLlmSourceSelector({
      model: modelReturning({
        urls: ["https://boards.greenhouse.io/acme/jobs/123", "https://fr.linkedin.com/jobs/x"],
      }),
    });

    const selection = await selector.select(CONTEXT);

    expect(selection).toEqual({
      urls: ["https://boards.greenhouse.io/acme/jobs/123", "https://fr.linkedin.com/jobs/x"],
      source: "llm",
    });
  });

  it("ignore une URL qui n'était pas candidate : le modèle ne fait pas visiter n'importe quoi", async () => {
    const selector = createLlmSourceSelector({
      model: modelReturning({
        urls: ["https://exemple-inconnu.test/page", "https://boards.greenhouse.io/acme/jobs/123"],
      }),
    });

    const selection = await selector.select(CONTEXT);

    expect(selection.urls).toEqual(["https://boards.greenhouse.io/acme/jobs/123"]);
    expect(selection.source).toBe("llm");
  });

  it("retombe sur l'ordre du score quand le modèle échoue", async () => {
    const selector = createLlmSourceSelector({
      model: { generateStructured: () => Promise.reject(new Error("panne")) },
    });

    const selection = await selector.select(CONTEXT);

    expect(selection.source).toBe("score");
    expect(selection.urls).toHaveLength(2);
  });

  it("retombe sur l'ordre du score quand la sortie est vide ou hors schéma", async () => {
    for (const output of [{ urls: [] }, { urls: "non" }, {}]) {
      const selector = createLlmSourceSelector({ model: modelReturning(output) });
      await expect(selector.select(CONTEXT)).resolves.toMatchObject({ source: "score" });
    }
  });

  it("n'appelle pas le modèle pour une seule candidate", async () => {
    let calls = 0;
    const selector = createLlmSourceSelector({
      model: {
        generateStructured: <T>() => {
          calls += 1;
          return Promise.resolve({ urls: [] } as T);
        },
      },
    });

    const selection = await selector.select({ ...CONTEXT, candidates: [CONTEXT.candidates[2]!] });

    expect(calls).toBe(0);
    expect(selection.source).toBe("score");
  });
});
