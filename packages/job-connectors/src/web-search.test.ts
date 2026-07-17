import { describe, expect, it, vi } from "vitest";

import { FINDIT_USER_AGENT } from "./http.js";
import { BraveSearchProvider, WebSearchError } from "./web-search.js";

/*
 * Forme relevée sur https://api.search.brave.com/res/v1/web/search le
 * 2026-07-17. Seuls url, title et description sont retenus — le reste est jeté,
 * et surtout rien de tout cela ne doit finir en base : les CGU de Brave
 * interdisent de conserver ses résultats.
 */
const bravePayload = {
  web: {
    results: [
      {
        title: "Développeur React Alternance, Paris (75)",
        url: "https://fr.indeed.com/q-developpeur-react-alternance",
        description: "Offres d'alternance développeur React à Paris.",
        is_source_local: false,
        extra_snippets: ["…"],
      },
      {
        title: "Alternance Développeur - Acme",
        url: "https://acme.com/careers/alternance-dev",
        description: "Rejoignez Acme en alternance.",
      },
    ],
  },
};

const respondWith = (payload: unknown, status = 200) =>
  vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(new Response(JSON.stringify(payload), { status })),
  );

const provider = (fetchStub: typeof globalThis.fetch) =>
  new BraveSearchProvider({ apiKey: "BSAK-secret", fetch: fetchStub });

const query = {
  query: "alternance développeur react Paris",
  country: "fr",
  language: "fr",
  count: 10,
};

/* Le fournisseur demande une URL en chaîne ; l'affirmer plutôt que la forcer. */
const urlOf = (call: readonly unknown[] | undefined): string => {
  const input = call?.[0];
  if (typeof input !== "string") {
    throw new Error("Le fournisseur doit demander une URL en chaîne.");
  }

  return input;
};

describe("BraveSearchProvider", () => {
  it("keeps only the transient fields, and the host to judge the domain", async () => {
    const fetchStub = respondWith(bravePayload);

    const results = await provider(fetchStub).search(query);

    expect(results).toEqual([
      {
        url: "https://fr.indeed.com/q-developpeur-react-alternance",
        title: "Développeur React Alternance, Paris (75)",
        description: "Offres d'alternance développeur React à Paris.",
        host: "fr.indeed.com",
      },
      {
        url: "https://acme.com/careers/alternance-dev",
        title: "Alternance Développeur - Acme",
        description: "Rejoignez Acme en alternance.",
        host: "acme.com",
      },
    ]);
  });

  it("carries the key in the header Brave expects, and announces Findit", async () => {
    const fetchStub = respondWith(bravePayload);

    await provider(fetchStub).search(query);

    const [, init] = fetchStub.mock.calls[0] ?? [];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["x-subscription-token"]).toBe("BSAK-secret");
    expect(headers["user-agent"]).toBe(FINDIT_USER_AGENT);
  });

  it("asks the documented endpoint with the query it was given", async () => {
    const fetchStub = respondWith(bravePayload);

    await provider(fetchStub).search(query);

    const url = urlOf(fetchStub.mock.calls[0]);
    expect(url).toContain("https://api.search.brave.com/res/v1/web/search?");
    expect(url).toContain("q=alternance+d%C3%A9veloppeur+react+Paris");
    expect(url).toContain("country=fr");
    expect(url).toContain("search_lang=fr");
  });

  it("never asks Brave for more than it will return", async () => {
    const fetchStub = respondWith(bravePayload);

    await provider(fetchStub).search({ ...query, count: 100 });

    expect(urlOf(fetchStub.mock.calls[0])).toContain("count=20");
  });

  it("raises on an error status instead of returning an empty list", async () => {
    const fetchStub = respondWith({ error: "quota" }, 429);

    await expect(provider(fetchStub).search(query)).rejects.toBeInstanceOf(WebSearchError);
  });

  it("never puts the key in the error it raises", async () => {
    const fetchStub = respondWith({ message: "rate limited" }, 429);

    const error = await provider(fetchStub)
      .search(query)
      .catch((caught: unknown) => caught);

    expect(String(error)).not.toContain("BSAK-secret");
  });

  it("returns nothing rather than crashing when the envelope changed shape", async () => {
    for (const payload of [{}, { web: null }, { web: { results: "nope" } }, { results: [] }]) {
      const results = await provider(respondWith(payload)).search(query);
      expect(results).toEqual([]);
    }
  });

  it("reports health from a real round-trip", async () => {
    const healthy = await provider(respondWith(bravePayload)).healthCheck();
    expect(healthy).toMatchObject({ healthy: true });

    const broken = await provider(respondWith({ error: "bad key" }, 401)).healthCheck();
    expect(broken).toMatchObject({ healthy: false });
  });
});
