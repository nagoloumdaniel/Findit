import { describe, expect, it, vi } from "vitest";

import { AiOutputError, createDeepSeekModel } from "@findit/ai";
import type { DeepSeekModel, FetchLike } from "@findit/ai";

import { SCORE_INDICATIF, computeMatch } from "./matching.js";
import type { JobOfferLite, MatchResult, StructuredCv } from "./types.js";

const cv = (overrides: Partial<StructuredCv> = {}): StructuredCv => ({
  identity: "Développeuse full-stack",
  experiences: ["Stage développeuse web chez Acme"],
  projects: ["Site vitrine en React"],
  skills: ["TypeScript", "React", "Node.js"],
  languages: ["français", "anglais courant"],
  certifications: ["Licence informatique"],
  location: "",
  ...overrides,
});

const offer = (overrides: Partial<JobOfferLite> = {}): JobOfferLite => ({
  title: "Développeur full-stack TypeScript",
  description: "Vous développerez une application Node.js avec React.",
  requiredSkills: ["TypeScript", "React", "Docker"],
  contract: "CDI",
  location: "Paris",
  ...overrides,
});

const emptyCv = (): StructuredCv =>
  cv({
    identity: "",
    experiences: [],
    projects: [],
    skills: [],
    languages: [],
    certifications: [],
  });

const emptyOffer = (): JobOfferLite =>
  offer({ title: "", description: "", requiredSkills: [], contract: "", location: "" });

/** Sortie valide d'un modèle, toutes compétences ancrées dans le CV ou l'offre. */
const validOutput = (): Omit<MatchResult, "skillMatch" | "locationMatch" | "contractMatch"> => ({
  score: 72,
  relevance: "Bon profil pour le poste",
  matchedSkills: ["TypeScript", "React"],
  missingSkills: ["Docker"],
  strengths: ["Maîtrise de TypeScript et React"],
  weaknesses: ["Docker absent du profil"],
  recommendation: "Postuler après un rapide apprentissage de Docker.",
});

/**
 * Faux modèle DeepSeek : un double nommé qui rend `output` sans réseau.
 *
 * Le POURQUOI : le matching ne dépend que de l'interface `DeepSeekModel`, pas
 * du transport HTTP. Le double est nommé via `mockName` pour que les échecs
 * d'assertion citent "generateStructured" plutôt qu'une fonction anonyme.
 */
const makeFakeModel = (output: unknown) => {
  const generateStructured = vi.fn(() => Promise.resolve(output)).mockName("generateStructured");
  const generateText = vi.fn(() => Promise.resolve("")).mockName("generateText");
  const usage = vi.fn(() => ({ inputTokens: 0, outputTokens: 0, calls: 1 })).mockName("usage");
  return {
    model: { generateStructured, generateText, usage } as DeepSeekModel,
    generateStructured,
  };
};

describe("computeMatch", () => {
  it("rend un score et des raisons quand le CV et l'offre ont de la matière", async () => {
    const { model } = makeFakeModel(validOutput());

    const result = await computeMatch(cv(), offer(), model);

    expect(result.score).toBe(72);
    expect(result.matchedSkills).toEqual(["TypeScript", "React"]);
    expect(result.missingSkills).toEqual(["Docker"]);
    expect(result.strengths).toContain("Maîtrise de TypeScript et React");
    expect(result.recommendation).toContain(SCORE_INDICATIF);
  });

  it("retire une compétence inventée absente du CV et de l'offre", async () => {
    const { model } = makeFakeModel({
      ...validOutput(),
      matchedSkills: ["TypeScript", "COBOL"],
      missingSkills: ["Docker", "Kafka"],
    });

    const result = await computeMatch(cv(), offer(), model);

    // "COBOL" et "Kafka" n'apparaissent ni dans le CV ni dans l'offre : retirés.
    expect(result.matchedSkills).toEqual(["TypeScript"]);
    expect(result.missingSkills).toEqual(["Docker"]);
  });

  it("rend un score bas avec avertissement quand le CV est sans matière", async () => {
    const { model, generateStructured } = makeFakeModel(validOutput());

    const result = await computeMatch(emptyCv(), offer(), model);

    expect(result.score).toBe(0);
    expect(result.matchedSkills).toEqual([]);
    expect(result.recommendation).toContain("matière");
    expect(result.recommendation).toContain(SCORE_INDICATIF);
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("rend un score bas avec avertissement quand l'offre est sans matière", async () => {
    const { model, generateStructured } = makeFakeModel(validOutput());

    const result = await computeMatch(cv(), emptyOffer(), model);

    expect(result.score).toBe(0);
    expect(result.recommendation).toContain("matière");
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("calcule des sous-scores déterministes indépendants du modèle", async () => {
    const { model } = makeFakeModel(validOutput());

    const result = await computeMatch(
      cv({
        identity: "Développeuse en alternance",
        location: "Paris",
        skills: ["TypeScript", "React"],
      }),
      offer({
        requiredSkills: ["TypeScript", "React", "Docker"],
        contract: "alternance",
        location: "Paris",
      }),
      model,
    );

    // 2 compétences sur 3 ; localisation identique ; « alternance » dans le CV.
    expect(result.skillMatch).toBe(67);
    expect(result.locationMatch).toBe(100);
    expect(result.contractMatch).toBe(100);
    // Le score LLM reste indépendant des sous-scores.
    expect(result.score).toBe(72);
  });

  it("rend 0 pour les sous-scores quand rien ne concorde", async () => {
    const { model } = makeFakeModel(validOutput());

    const result = await computeMatch(cv(), offer(), model);

    expect(result.locationMatch).toBe(0);
    expect(result.contractMatch).toBe(0);
  });

  it("propage l'erreur quand la sortie ne respecte pas le schéma", async () => {
    // Un score hors bornes (150 > 100) viole le schéma : `generateStructured`
    // lève AiOutputError, que `computeMatch` doit laisser remonter, pas avaler.
    const transport: FetchLike = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  score: 150,
                  relevance: "hors bornes",
                  matchedSkills: [],
                  missingSkills: [],
                  strengths: [],
                  weaknesses: [],
                  recommendation: "sans intérêt",
                }),
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const model = createDeepSeekModel({
      apiKey: "cle-de-test",
      model: "deepseek-flash",
      fetch: transport,
    });

    await expect(computeMatch(cv(), offer(), model)).rejects.toBeInstanceOf(AiOutputError);
  });
});
