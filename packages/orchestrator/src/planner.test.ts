import { describe, expect, it } from "vitest";

import { createLlmQueryPlanner, deterministicQueryPlanner } from "./planner.js";
import type { PlannerModel } from "./planner.js";

const OBJECTIVE = "alternance et stage développeur en Île-de-France";

/** Un modèle qui rend exactement ce que le test lui donne. */
const modelReturning = (value: unknown): PlannerModel => ({
  generateStructured: <T>() => Promise.resolve(value as T),
});

describe("deterministicQueryPlanner", () => {
  it("borne le plan déterministe à maxQueries", async () => {
    const plan = await deterministicQueryPlanner.plan({ objective: OBJECTIVE, maxQueries: 5 });

    expect(plan.source).toBe("deterministic");
    expect(plan.queries.length).toBeGreaterThan(0);
    expect(plan.queries.length).toBeLessThanOrEqual(5);
  });
});

describe("createLlmQueryPlanner", () => {
  it("rend le plan du modèle, dédupliqué et borné", async () => {
    const planner = createLlmQueryPlanner({
      model: modelReturning({
        queries: [
          { query: "développeur alternance Île-de-France" },
          { query: "Développeur Alternance Île-de-France" },
          { query: "stage développeur Paris" },
          { query: "react alternance site:jobs.lever.co" },
        ],
      }),
    });

    const plan = await planner.plan({ objective: OBJECTIVE, maxQueries: 2 });

    expect(plan.source).toBe("llm");
    expect(plan.queries.map((query) => query.query)).toEqual([
      "développeur alternance Île-de-France",
      "stage développeur Paris",
    ]);
    expect(plan.queries.every((query) => query.engine === "brave")).toBe(true);
  });

  it("retombe sur le déterministe quand le modèle échoue", async () => {
    const model: PlannerModel = {
      generateStructured: () => Promise.reject(new Error("modèle indisponible")),
    };

    const plan = await createLlmQueryPlanner({ model }).plan({
      objective: OBJECTIVE,
      maxQueries: 4,
    });

    expect(plan.source).toBe("deterministic");
    expect(plan.queries.length).toBeGreaterThan(0);
  });

  it("retombe sur le déterministe quand la sortie est hors schéma", async () => {
    const plan = await createLlmQueryPlanner({
      model: modelReturning({ queries: [] }),
    }).plan({ objective: OBJECTIVE, maxQueries: 4 });

    expect(plan.source).toBe("deterministic");
  });

  it("retombe sur le déterministe quand le plan ne contient aucune requête exploitable", async () => {
    const plan = await createLlmQueryPlanner({
      model: modelReturning({ queries: [{ query: "   " }] }),
    }).plan({ objective: OBJECTIVE, maxQueries: 4 });

    expect(plan.source).toBe("deterministic");
  });

  it("laisse l'appelant remplacer le repli", async () => {
    const planner = createLlmQueryPlanner({
      model: {
        generateStructured: () => Promise.reject(new Error("panne")),
      },
      fallback: {
        plan: () => Promise.resolve({ queries: [], source: "deterministic" }),
      },
    });

    const plan = await planner.plan({ objective: OBJECTIVE, maxQueries: 4 });

    expect(plan.queries).toEqual([]);
  });
});

describe("createLlmQueryPlanner.refine", () => {
  const context = {
    objective: OBJECTIVE,
    maxQueries: 5,
    observation: {
      executedQueries: ["alternance développeur Île-de-France"],
      sources: [
        { url: "https://fr.linkedin.com/jobs/x", domain: "fr.linkedin.com", score: 85, kept: true },
      ],
      offers: [{ title: "Développeur", company: "Acme" }],
      pagesVisited: 3,
    },
  };

  it("propose un second tour de requêtes, sans répéter les précédentes", async () => {
    const planner = createLlmQueryPlanner({
      model: modelReturning({
        queries: [
          { query: "alternance développeur Île-de-France" },
          { query: "alternance développeur site:jobs.lever.co" },
        ],
      }),
    });

    const plan = await planner.refine?.(context);

    expect(plan).toEqual({
      queries: [{ query: "alternance développeur site:jobs.lever.co", engine: "brave" }],
      source: "llm",
    });
  });

  it("arrête quand le modèle rend une liste vide", async () => {
    const planner = createLlmQueryPlanner({ model: modelReturning({ queries: [] }) });

    await expect(planner.refine?.(context)).resolves.toBeNull();
  });

  it("arrête quand le modèle échoue, plutôt que de rejouer le même tour", async () => {
    const planner = createLlmQueryPlanner({
      model: { generateStructured: () => Promise.reject(new Error("panne")) },
    });

    await expect(planner.refine?.(context)).resolves.toBeNull();
  });

  it("arrête quand la sortie est hors schéma", async () => {
    const planner = createLlmQueryPlanner({ model: modelReturning({ queries: "non" }) });

    await expect(planner.refine?.(context)).resolves.toBeNull();
  });
});
