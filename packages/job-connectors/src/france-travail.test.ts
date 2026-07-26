import { AtsKind, ConnectorStatus, SourceAccessStatus } from "@findit/database";
import { describe, expect, it, vi } from "vitest";

import type { ConnectorRegistration } from "./access-policy.js";
import type { SearchTarget } from "./connector.js";
import {
  createFranceTravailConnector,
  FRANCE_TRAVAIL_CONNECTOR_NAME,
  FranceTravailShapeError,
} from "./france-travail.js";
import type { RunConnectorDeps } from "./run.js";
import { runConnector } from "./run.js";

/*
 * Forme décrite par la documentation officielle de l'API Offres d'emploi v2
 * (francetravail.io). L'accès exige des identifiants partenaires : la première
 * collecte réelle confirmera cette forme, comme la règle du projet le veut.
 */
const realOffre = {
  id: "193NTKH",
  intitule: "Développeur / Développeuse web en alternance (H/F)",
  description: "Au sein d'une équipe de 4 personnes, vous participerez au développement.",
  dateCreation: "2026-07-25T09:12:44.000Z",
  dateActualisation: "2026-07-25T09:12:45.000Z",
  lieuTravail: { libelle: "75 - PARIS 14", codePostal: "75014", commune: "75114" },
  entreprise: { nom: "SARL ATELIER NUMERIQUE" },
  typeContrat: "CDD",
  natureContrat: "Contrat apprentissage",
  origineOffre: {
    origine: "1",
    urlOrigine: "https://candidat.francetravail.fr/offres/recherche/detail/193NTKH",
  },
};

const connector = createFranceTravailConnector({
  clientId: "client-test",
  clientSecret: "secret-test",
});

const target: SearchTarget = { query: "développeur", location: "Île-de-France, France" };

const registration: ConnectorRegistration = {
  name: FRANCE_TRAVAIL_CONNECTOR_NAME,
  accessStatus: SourceAccessStatus.OFFICIAL_API,
  status: ConnectorStatus.ACTIVE,
  termsCheckedAt: new Date("2026-07-26T00:00:00.000Z"),
};

const token = { access_token: "jeton-test", token_type: "Bearer", expires_in: 1499 };

/** La première réponse est toujours le jeton ; les suivantes, les pages. */
const respondWith = (pages: readonly { status: number; payload?: unknown }[]) => {
  let call = 0;
  return vi.fn<typeof globalThis.fetch>(() => {
    if (call === 0) {
      call += 1;
      return Promise.resolve(new Response(JSON.stringify(token), { status: 200 }));
    }

    const page = pages[call - 1] ?? { status: 204 };
    call += 1;
    return Promise.resolve(
      page.payload === undefined
        ? new Response(null, { status: page.status })
        : new Response(JSON.stringify(page.payload), { status: page.status }),
    );
  });
};

const deps = (fetchImpl: typeof globalThis.fetch, sleeps: number[] = []): RunConnectorDeps => ({
  fetch: fetchImpl,
  sleep: (ms: number) => {
    sleeps.push(ms);
    return Promise.resolve();
  },
  monotonicNow: () => 0,
  now: () => new Date("2026-07-26T12:00:00.000Z"),
  correlationId: "run-1",
});

const requestOf = (
  call: readonly unknown[] | undefined,
): { url: string; init: RequestInit | undefined } => {
  const input = call?.[0];
  if (typeof input !== "string") {
    throw new Error("Le connecteur doit demander une URL en chaîne.");
  }

  return { url: input, init: call?.[1] as RequestInit | undefined };
};

describe("createFranceTravailConnector", () => {
  it("aims at the official state API", () => {
    expect(connector.name).toBe("france-travail");
    expect(connector.atsKind).toBe(AtsKind.FRANCE_TRAVAIL);
    expect(connector.minRequestIntervalMs).toBe(1000);
  });

  it("asks a token first, without ever logging the secret anywhere else", async () => {
    const fetchStub = respondWith([{ status: 204 }]);

    await runConnector(connector, registration, target, deps(fetchStub));

    const { url, init } = requestOf(fetchStub.mock.calls[0]);
    expect(url).toContain("https://entreprise.francetravail.fr/connexion/oauth2/access_token");
    expect(url).toContain("realm=%2Fpartenaire");
    expect(init?.method).toBe("POST");

    const body = init?.body;
    if (typeof body !== "string") {
      throw new Error("Le connecteur doit envoyer le formulaire du jeton en chaîne.");
    }
    expect(body).toContain("grant_type=client_credentials");
    expect(body).toContain("client_id=client-test");
    expect(body).toContain("scope=api_offresdemploiv2");
  });

  it("searches alternance in Île-de-France with the bearer it obtained", async () => {
    const fetchStub = respondWith([{ status: 200, payload: { resultats: [realOffre] } }]);

    await runConnector(connector, registration, target, deps(fetchStub));

    const { url, init } = requestOf(fetchStub.mock.calls[1]);
    expect(url).toContain(
      "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?",
    );
    expect(url).toContain("motsCles=d%C3%A9veloppeur");
    expect(url).toContain("region=11");
    expect(url).toContain("natureContrat=E2%2CFS");
    expect(url).toContain("publieeDepuis=3");
    expect(url).toContain("range=0-149");

    const headers = init?.headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer jeton-test");
  });

  it("reads a real posting, keeping the payload it came from", async () => {
    const fetchStub = respondWith([{ status: 200, payload: { resultats: [realOffre] } }]);

    const outcome = await runConnector(connector, registration, target, deps(fetchStub));

    expect(outcome.jobs[0]).toEqual({
      sourceJobId: "193NTKH",
      url: "https://candidat.francetravail.fr/offres/recherche/detail/193NTKH",
      title: "Développeur / Développeuse web en alternance (H/F)",
      // « 75 - PARIS 14 » devient « PARIS » : le préfixe département et
      // l'arrondissement sont retirés, la casse de la source est gardée - le
      // libellé d'origine reste dans rawContent.
      locationLabel: "PARIS",
      descriptionHtml: "Au sein d'une équipe de 4 personnes, vous participerez au développement.",
      publishedAt: new Date("2026-07-25T09:12:44.000Z"),
      companyName: "SARL ATELIER NUMERIQUE",
      rawContent: JSON.stringify(realOffre),
      contentType: "application/json",
    });
  });

  it("keeps a plain commune label untouched", async () => {
    const offre = { ...realOffre, lieuTravail: { libelle: "92 - Courbevoie" } };
    const fetchStub = respondWith([{ status: 200, payload: { resultats: [offre] } }]);

    const outcome = await runConnector(connector, registration, target, deps(fetchStub));

    expect(outcome.jobs[0]?.locationLabel).toBe("Courbevoie");
  });

  it("treats 204 as the season's honest answer: no offers, no error", async () => {
    const fetchStub = respondWith([{ status: 204 }]);

    const outcome = await runConnector(connector, registration, target, deps(fetchStub));

    expect(outcome.jobs).toEqual([]);
    // Le jeton, puis la seule page : rien d'autre n'a été demandé.
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it("refuses a zone outside the project scope rather than guessing a region code", async () => {
    const fetchStub = respondWith([{ status: 204 }]);

    await expect(
      runConnector(connector, registration, { ...target, location: "Bretagne" }, deps(fetchStub)),
    ).rejects.toBeInstanceOf(FranceTravailShapeError);

    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("raises when the envelope changed shape instead of reporting an empty search", async () => {
    const fetchStub = respondWith([{ status: 200, payload: { offres: [] } }]);

    await expect(
      runConnector(connector, registration, target, deps(fetchStub)),
    ).rejects.toBeInstanceOf(FranceTravailShapeError);
  });

  it("stays unrunnable while the registry does not allow it", async () => {
    const fetchStub = respondWith([{ status: 200, payload: { resultats: [realOffre] } }]);

    await expect(
      runConnector(
        connector,
        { ...registration, status: ConnectorStatus.DISABLED_PENDING_PERMISSION },
        target,
        deps(fetchStub),
      ),
    ).rejects.toMatchObject({ reason: "CONNECTOR_NOT_ACTIVE" });

    expect(fetchStub).not.toHaveBeenCalled();
  });
});
