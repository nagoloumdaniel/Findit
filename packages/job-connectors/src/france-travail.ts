import { AtsKind } from "@findit/database";
import { z } from "zod";

import type { CollectionContext, JobSourceConnector, RawJob, SearchTarget } from "./connector.js";
import type { CollectionPermit } from "./permit.js";

/** Doit correspondre à `Connector.name` en base. */
export const FRANCE_TRAVAIL_CONNECTOR_NAME = "france-travail";

/**
 * France Travail annonce jusqu'à 10 requêtes par seconde et par clé
 * (précision du propriétaire, 2026-07-27). Une requête par seconde suffit
 * largement - un cycle tient en quelques pages - et reste loin du plafond.
 */
export const FRANCE_TRAVAIL_REQUEST_INTERVAL_MS = 1000;

/**
 * L'accès est une API officielle de l'État (francetravail.io), sous
 * inscription gratuite : le jeton s'obtient en OAuth « client credentials »
 * avec les identifiants du compte partenaire. Sans identifiants, le connecteur
 * n'est simplement pas monté dans le cycle - voir cycle-deps côté worker.
 */
export interface FranceTravailCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

const TOKEN_URL =
  "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
const SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search";

/** Périmètre du jeton demandé : l'API Offres d'emploi v2, rien d'autre. */
const TOKEN_SCOPE = "api_offresdemploiv2 o2dsoffre";

/**
 * France Travail publie beaucoup d'offres sans employeur structuré - dépôts
 * anonymes ou via partenaires, où `entreprise.nom` manque (constaté le
 * 2026-07-26 : 12 offres sur 21 en un mois). Le nom réel traîne parfois dans
 * la prose de `entreprise.description`, mais l'en extraire serait deviner.
 * Ce libellé dit exactement ce que la source dit : l'employeur est inconnu.
 * Ce n'est pas un nom inventé, c'est une absence nommée - le mot est celui
 * choisi par le propriétaire (2026-07-27).
 */
export const FRANCE_TRAVAIL_ANONYMOUS_EMPLOYER = "Inconnu";

/**
 * Codes du référentiel `naturesContrats` de l'API : E2 = contrat
 * d'apprentissage, FS = contrat de professionnalisation. Ensemble, ils
 * couvrent l'alternance ; le stage n'existe pas comme offre chez France
 * Travail.
 */
const NATURE_CONTRAT_ALTERNANCE = "E2,FS";

/** Code région officiel de l'Île-de-France dans le référentiel de l'API. */
const REGION_CODES: ReadonlyMap<string, string> = new Map([["Île-de-France, France", "11"]]);

/**
 * `publieeDepuis` n'accepte que 1, 3, 7, 14 ou 31 jours. Trois jours englobent
 * la fenêtre de fraîcheur du projet (72 h) sans demander plus que nécessaire.
 */
const PUBLIEE_DEPUIS_DAYS = 3;

/** Taille de page maximale acceptée par l'API. */
const PAGE_SIZE = 150;

/** Borne de sécurité : atteindre ce nombre lève plutôt que d'amputer la liste. */
const MAX_PAGES = 8;

const tokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
});

const offreSchema = z.object({
  id: z.string(),
  intitule: z.string(),
  description: z.string().nullish(),
  /** Date de première publication, en ISO. L'API la rend toujours. */
  dateCreation: z.string().nullish(),
  lieuTravail: z.object({ libelle: z.string().nullish() }).nullish(),
  entreprise: z.object({ nom: z.string().nullish() }).nullish(),
  origineOffre: z.object({ urlOrigine: z.string().nullish() }).nullish(),
});

const pageSchema = z.object({
  resultats: z.array(z.unknown()),
});

export class FranceTravailShapeError extends Error {
  override readonly name = "FranceTravailShapeError";

  constructor(detail: string) {
    super(`La réponse de France Travail n'a pas la forme attendue : ${detail}`);
  }
}

const issuesOf = (error: z.ZodError): string =>
  error.issues.map((issue) => `${issue.path.join(".")} : ${issue.message}`).join(" ; ");

/**
 * France Travail écrit la localisation « 75 - PARIS 14 » : le département en
 * préfixe, l'arrondissement en suffixe. Le résolveur de communes lit des noms
 * de villes - retirer le préfixe et ramener un arrondissement à sa ville est
 * une conversion de forme, pas une invention : le libellé d'origine reste dans
 * `rawContent`.
 */
const locationLabel = (libelle: string | null | undefined): string | null => {
  if (libelle === null || libelle === undefined || libelle.trim() === "") {
    return null;
  }

  const withoutDepartment = libelle.trim().replace(/^\d{2,3}\s*-\s*/u, "");
  const arrondissement = /^(?<city>Paris|Lyon|Marseille)\s+\d{1,2}$/iu.exec(withoutDepartment);

  return arrondissement?.groups?.["city"] ?? withoutDepartment;
};

const parsePublishedAt = (dateCreation: string | null | undefined): Date | null => {
  if (dateCreation === null || dateCreation === undefined) {
    return null;
  }

  const parsed = new Date(dateCreation);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toRawJob = (raw: unknown, position: number): RawJob => {
  const parsed = offreSchema.safeParse(raw);
  if (!parsed.success) {
    throw new FranceTravailShapeError(
      `l'offre à l'indice ${String(position)} est inexploitable (${issuesOf(parsed.error)}).`,
    );
  }

  const offre = parsed.data;

  return {
    sourceJobId: offre.id,
    // L'URL d'origine quand l'offre vient d'un partenaire, la fiche France
    // Travail sinon : dans les deux cas une page que la source publie.
    url:
      offre.origineOffre?.urlOrigine ??
      `https://candidat.francetravail.fr/offres/recherche/detail/${offre.id}`,
    title: offre.intitule,
    locationLabel: locationLabel(offre.lieuTravail?.libelle),
    descriptionHtml: offre.description ?? null,
    publishedAt: parsePublishedAt(offre.dateCreation),
    // L'API traverse toutes les entreprises : l'employeur est celui que
    // l'offre porte, jamais un libellé de requête. Quand la source ne le
    // communique pas, le libellé le dit - sans lui, l'orchestrateur
    // rejetterait plus de la moitié d'un flux déjà maigre.
    companyName: offre.entreprise?.nom ?? FRANCE_TRAVAIL_ANONYMOUS_EMPLOYER,
    rawContent: JSON.stringify(raw),
    contentType: "application/json",
  };
};

const searchUrl = (target: SearchTarget, region: string, page: number): string => {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("motsCles", target.query);
  url.searchParams.set("region", region);
  url.searchParams.set("natureContrat", NATURE_CONTRAT_ALTERNANCE);
  url.searchParams.set("publieeDepuis", String(PUBLIEE_DEPUIS_DAYS));
  url.searchParams.set(
    "range",
    `${String(page * PAGE_SIZE)}-${String((page + 1) * PAGE_SIZE - 1)}`,
  );
  return url.toString();
};

/**
 * Construit le connecteur avec les identifiants du compte partenaire. Une
 * fabrique plutôt qu'un singleton : les identifiants viennent de
 * l'environnement du worker, jamais de ce paquet.
 */
export const createFranceTravailConnector = (
  credentials: FranceTravailCredentials,
): JobSourceConnector<SearchTarget> => {
  const collect = async (
    _permit: CollectionPermit,
    target: SearchTarget,
    context: CollectionContext,
  ): Promise<readonly RawJob[]> => {
    const region = REGION_CODES.get(target.location);
    if (region === undefined) {
      throw new FranceTravailShapeError(
        `la zone « ${target.location} » n'a pas de code région connu : le périmètre du projet est l'Île-de-France.`,
      );
    }

    // Le jeton est demandé à chaque collecte : il vit ~25 minutes, un cycle
    // aussi. Le garder plus longtemps serait un état de plus pour rien.
    const tokenPayload = await context.fetchJson(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        scope: TOKEN_SCOPE,
      }).toString(),
    });

    const token = tokenSchema.safeParse(tokenPayload);
    if (!token.success) {
      throw new FranceTravailShapeError(
        `le jeton d'accès est inexploitable (${issuesOf(token.error)}).`,
      );
    }

    const authorization = { authorization: `Bearer ${token.data.access_token}` };
    const jobs: RawJob[] = [];

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const payload = await context.fetchJson(searchUrl(target, region, page), {
        headers: authorization,
      });

      // 204 : la recherche n'a rien trouvé. Ce n'est pas une erreur, c'est
      // une réponse - et hors saison, c'est la réponse normale.
      if (payload === null) {
        return jobs;
      }

      const parsed = pageSchema.safeParse(payload);
      if (!parsed.success) {
        throw new FranceTravailShapeError(
          `la page ${String(page)} n'a pas la forme attendue (${issuesOf(parsed.error)}).`,
        );
      }

      jobs.push(...parsed.data.resultats.map((raw, index) => toRawJob(raw, jobs.length + index)));

      // Une page incomplète est la dernière : l'API rend 206 tant qu'il en
      // reste, puis une tranche partielle ou vide.
      if (parsed.data.resultats.length < PAGE_SIZE) {
        return jobs;
      }
    }

    throw new FranceTravailShapeError(
      `plus de ${String(MAX_PAGES)} pages pour « ${target.query} » : la collecte s'arrête plutôt que de rendre une liste amputée.`,
    );
  };

  return {
    name: FRANCE_TRAVAIL_CONNECTOR_NAME,
    atsKind: AtsKind.FRANCE_TRAVAIL,
    minRequestIntervalMs: FRANCE_TRAVAIL_REQUEST_INTERVAL_MS,
    collect,
  };
};
