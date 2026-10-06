import { describe, expect, it } from "vitest";

import type { CrawledPage } from "@findit/crawler";

import { ExtractError, extractJobsFromPage } from "./extract.js";
import type { ExtractModel } from "./extract.js";

const page = (overrides: Partial<CrawledPage> = {}): CrawledPage => ({
  url: "https://acme.example/jobs/1",
  depth: 0,
  html: "<html><body>Développeur full-stack chez Acme.</body></html>",
  text: "Développeur full-stack chez Acme.",
  status: 200,
  robotsDenied: false,
  ...overrides,
});

/**
 * Double du modèle : rend une réponse fixée, sans réseau et sans validation
 * réelle. C'est ce qui permet de tester le comportement de l'extraction
 * indépendamment de DeepSeek.
 */
const fakeModel = (offers: unknown): ExtractModel => ({
  generateStructured<T>(): Promise<T> {
    return Promise.resolve(offers as T);
  },
});

const validOffer = {
  title: "Développeur full-stack",
  company: "Acme",
  location: "Paris",
  technologies: ["TypeScript", "React"],
  applicationUrl: "https://acme.example/jobs/1/apply",
};

describe("extractJobsFromPage", () => {
  it("extrait une offre valide et l'enrichit des métadonnées de la page", async () => {
    const result = await extractJobsFromPage(page({}), fakeModel({ offers: [validOffer] }));

    expect(result.rejected).toHaveLength(0);
    expect(result.offers).toEqual([
      {
        title: "Développeur full-stack",
        company: "Acme",
        location: "Paris",
        technologies: ["TypeScript", "React"],
        applicationUrl: "https://acme.example/jobs/1/apply",
        sourceUrl: "https://acme.example/jobs/1",
        sourceDomain: "acme.example",
      },
    ]);
  });

  it("laisse un champ absent rester absent", async () => {
    const result = await extractJobsFromPage(
      page({}),
      fakeModel({
        offers: [
          {
            title: "Développeur",
            company: "Acme",
            technologies: [],
            applicationUrl: "https://acme.example/jobs/1",
          },
        ],
      }),
    );

    expect(result.offers).toEqual([
      {
        title: "Développeur",
        company: "Acme",
        technologies: [],
        applicationUrl: "https://acme.example/jobs/1",
        sourceUrl: "https://acme.example/jobs/1",
        sourceDomain: "acme.example",
      },
    ]);
  });

  it("retombe sur l'URL de la page quand le modèle n'a pas trouvé d'URL de candidature", async () => {
    const result = await extractJobsFromPage(
      page({}),
      fakeModel({
        offers: [
          {
            title: "Développeur",
            company: "Acme",
            technologies: [],
          },
        ],
      }),
    );

    expect(result.offers[0]?.applicationUrl).toBe("https://acme.example/jobs/1");
  });

  it("lève ExtractError quand la sortie est hors schéma", async () => {
    const model = fakeModel({ offers: [{ title: 42 }] });
    await expect(extractJobsFromPage(page({}), model)).rejects.toBeInstanceOf(ExtractError);
  });

  it("écarte une école avec un motif explicite", async () => {
    const result = await extractJobsFromPage(
      page({}),
      fakeModel({
        offers: [
          {
            title: "Formation développeur web",
            company: "Wild Code School",
            technologies: [],
            applicationUrl: "https://school.example/formation",
          },
        ],
      }),
    );

    expect(result.offers).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toContain("école");
  });

  it("signale une offre incomplète au lieu de l'inventer", async () => {
    const result = await extractJobsFromPage(
      page({}),
      fakeModel({
        offers: [
          {
            title: "",
            company: "Acme",
            technologies: [],
            applicationUrl: "https://acme.example/jobs/1",
          },
        ],
      }),
    );

    expect(result.offers).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toContain("titre absent");
  });

  it("rend une liste vide quand la page ne contient aucune offre", async () => {
    const result = await extractJobsFromPage(page({}), fakeModel({ offers: [] }));

    expect(result.offers).toHaveLength(0);
    expect(result.rejected).toHaveLength(0);
  });
});
