import { describe, expect, it } from "vitest";

import type { CrawledPage } from "@findit/crawler";

import { extractStructuredOffers } from "./structured.js";

const page = (head: string, overrides: Partial<CrawledPage> = {}): CrawledPage => ({
  url: "https://acme.example/jobs/1",
  depth: 0,
  html: `<html><head>${head}</head><body><p>Annonce</p></body></html>`,
  text: "Annonce",
  status: 200,
  robotsDenied: false,
  ...overrides,
});

/** Emballe une valeur JSON-LD dans la page, comme le ferait un vrai site. */
const withJsonLd = (value: unknown): string =>
  `<script type="application/ld+json">${JSON.stringify(value)}</script>`;

/** Le même emballage, mais avec un contenu brut volontairement invalide. */
const withRawJsonLd = (raw: string): string => `<script type="application/ld+json">${raw}</script>`;

const completePosting = {
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title: "Développeur full-stack",
  hiringOrganization: { "@type": "Organization", name: "Acme" },
  jobLocation: {
    "@type": "Place",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Paris",
      addressRegion: "Île-de-France",
      addressCountry: "France",
    },
  },
  employmentType: ["CDI", "Temps plein"],
  description: "<p>Rejoignez <strong>notre équipe</strong> produit.</p>",
  baseSalary: {
    "@type": "MonetaryAmount",
    currency: "EUR",
    value: { "@type": "QuantitativeValue", value: 60000, unitText: "YEAR" },
  },
  datePosted: "2024-03-15",
  url: "https://acme.example/apply",
  skills: ["TypeScript"],
};

describe("extractStructuredOffers", () => {
  it("mappe un JobPosting complet et l'enrichit comme une offre du modèle", () => {
    const result = extractStructuredOffers(page(withJsonLd(completePosting)));

    expect(result.rejected).toHaveLength(0);
    expect(result.offers).toEqual([
      {
        title: "Développeur full-stack",
        company: "Acme",
        location: "Paris, Île-de-France, France",
        contractType: "CDI",
        description: "Rejoignez notre équipe produit.",
        salary: "60000",
        publishedAt: "2024-03-15",
        applicationUrl: "https://acme.example/apply",
        technologies: ["TypeScript"],
        sourceUrl: "https://acme.example/jobs/1",
        sourceDomain: "acme.example",
      },
    ]);
  });

  it("accepte un tableau racine de nœuds", () => {
    const result = extractStructuredOffers(
      page(withJsonLd([{ "@type": "Organization", name: "Acme" }, completePosting])),
    );

    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]?.title).toBe("Développeur full-stack");
  });

  it("accepte une enveloppe @graph", () => {
    const result = extractStructuredOffers(
      page(withJsonLd({ "@context": "https://schema.org", "@graph": [completePosting] })),
    );

    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]?.company).toBe("Acme");
  });

  it("accepte un @type fourni sous forme de tableau", () => {
    const result = extractStructuredOffers(
      page(withJsonLd({ ...completePosting, "@type": ["JobPosting", "Thing"] })),
    );

    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]?.title).toBe("Développeur full-stack");
  });

  it("ignore un bloc JSON-LD malformé sans lever", () => {
    const result = extractStructuredOffers(page(withRawJsonLd("{ pas du json")));

    expect(result).toEqual({ offers: [], rejected: [] });
  });

  it("ignore les nœuds qui ne sont pas des JobPosting", () => {
    const result = extractStructuredOffers(
      page(withJsonLd({ "@type": "BreadcrumbList", itemListElement: [] })),
    );

    expect(result).toEqual({ offers: [], rejected: [] });
  });

  it("écarte une école déclarée en JobPosting", () => {
    const result = extractStructuredOffers(
      page(
        withJsonLd({
          "@type": "JobPosting",
          title: "Formation développeur web",
          hiringOrganization: { name: "Wild Code School" },
          url: "https://school.example/formation",
        }),
      ),
    );

    expect(result.offers).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toContain("école");
  });

  it("écarte un JobPosting sans titre au lieu de l'inventer", () => {
    const result = extractStructuredOffers(
      page(
        withJsonLd({
          "@type": "JobPosting",
          hiringOrganization: { name: "Acme" },
          url: "https://acme.example/apply",
        }),
      ),
    );

    expect(result.offers).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toContain("titre absent");
    expect(result.rejected[0]?.score).toBeLessThan(3);
  });

  it("laisse absents les champs non déclarés et retombe sur l'URL de la page", () => {
    const result = extractStructuredOffers(
      page(
        withJsonLd({
          "@type": "JobPosting",
          title: "Développeur",
          hiringOrganization: "Acme",
        }),
      ),
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

  it("rend un résultat vide quand la page n'a aucun JSON-LD", () => {
    const result = extractStructuredOffers(page(""));

    expect(result).toEqual({ offers: [], rejected: [] });
  });
});
