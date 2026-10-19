import { describe, expect, it } from "vitest";

import { mapRawJobToOffer } from "./agent-connector-fallback.js";

const raw = (over: Record<string, unknown> = {}) => ({
  sourceJobId: "abc123",
  url: "https://boards.greenhouse.io/acme/jobs/123",
  title: "Développeur Full Stack",
  locationLabel: "Paris",
  descriptionHtml: "<p>offre en alternance</p>",
  publishedAt: new Date("2026-10-01T00:00:00.000Z"),
  companyName: "Acme",
  rawContent: "{}",
  contentType: "application/json",
  ...over,
});

describe("mapRawJobToOffer", () => {
  it("cartographie une offre brute sans rien inventer", () => {
    const offer = mapRawJobToOffer(raw(), "repli");

    expect(offer).toEqual({
      title: "Développeur Full Stack",
      company: "Acme",
      location: "Paris",
      description: "<p>offre en alternance</p>",
      technologies: [],
      publishedAt: "2026-10-01T00:00:00.000Z",
      applicationUrl: "https://boards.greenhouse.io/acme/jobs/123",
      sourceUrl: "https://boards.greenhouse.io/acme/jobs/123",
      sourceDomain: "boards.greenhouse.io",
    });
  });

  it("retombe sur le jeton d'ATS quand l'offre ne porte pas d'entreprise ni de date", () => {
    const offer = mapRawJobToOffer(
      raw({ companyName: null, locationLabel: null, descriptionHtml: null, publishedAt: null }),
      "acme",
    );

    expect(offer.company).toBe("acme");
    expect(offer.location).toBeUndefined();
    expect(offer.description).toBeUndefined();
    expect(offer.publishedAt).toBeUndefined();
  });
});
