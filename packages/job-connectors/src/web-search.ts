import { FINDIT_USER_AGENT } from "./http.js";

/**
 * Un résultat de recherche, **transitoire**.
 *
 * Ce n'est pas un `RawJob` et ce n'est pas destiné à la base. Les CGU de Brave
 * interdisent de conserver ses résultats autrement que le temps d'une opération :
 * un `WebSearchResult` vit en mémoire le temps d'en extraire une URL à visiter,
 * puis il est jeté. Rien ici ne doit finir dans une table.
 *
 * Ce que la recherche produit, c'est une piste — « une offre existe peut-être à
 * cette adresse » — pas une offre. L'offre, s'il y en a une, est collectée à la
 * source officielle sous le régime du registre.
 */
export interface WebSearchResult {
  readonly url: string;
  readonly title: string;
  readonly description: string;
  /** Hôte extrait de l'URL, pour décider si le domaine vaut une visite. */
  readonly host: string;
}

export interface WebSearchQuery {
  readonly query: string;
  /** Pays, au sens du moteur : « fr ». */
  readonly country: string;
  /** Langue des résultats : « fr ». */
  readonly language: string;
  /** Nombre de résultats demandés. Plafonné par le fournisseur. */
  readonly count: number;
}

export type WebSearchProviderHealth =
  | { readonly healthy: true; readonly detail: string }
  | { readonly healthy: false; readonly detail: string };

/**
 * Un moteur de recherche, vu comme une source de découverte.
 *
 * L'interface existe pour que Findit ne dépende pas d'un fournisseur unique :
 * Brave aujourd'hui, un autre demain, sans que le reste de la chaîne change.
 */
export interface WebSearchProvider {
  readonly name: string;
  search(query: WebSearchQuery): Promise<readonly WebSearchResult[]>;
  healthCheck(): Promise<WebSearchProviderHealth>;
}

export class WebSearchError extends Error {
  override readonly name = "WebSearchError";

  constructor(
    readonly provider: string,
    readonly httpStatus: number,
    detail: string,
  ) {
    super(`Le moteur ${provider} a répondu ${String(httpStatus)} : ${detail}`);
  }
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

export interface BraveSearchProviderOptions {
  /** Clé serveur. Ne doit jamais quitter le serveur ni partir dans un log. */
  readonly apiKey: string;
  readonly fetch: typeof globalThis.fetch;
  /** Plafond de résultats par requête. Brave n'en rend pas plus de 20. */
  readonly maxResults?: number;
}

const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const BRAVE_MAX_RESULTS = 20;

/**
 * Fournisseur Brave.
 *
 * Il annonce l'identité de Findit et porte la clé dans l'en-tête que Brave
 * attend. Il ne conserve rien : chaque appel rend des `WebSearchResult`
 * transitoires que l'appelant consomme et jette. La cadence — une requête par
 * seconde — est tenue par l'exécuteur qui l'appelle, comme pour les connecteurs.
 */
export class BraveSearchProvider implements WebSearchProvider {
  readonly name = "brave";

  readonly #apiKey: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #maxResults: number;

  constructor(options: BraveSearchProviderOptions) {
    this.#apiKey = options.apiKey;
    this.#fetch = options.fetch;
    this.#maxResults = Math.min(options.maxResults ?? BRAVE_MAX_RESULTS, BRAVE_MAX_RESULTS);
  }

  async search(query: WebSearchQuery): Promise<readonly WebSearchResult[]> {
    const url = new URL(BRAVE_ENDPOINT);
    url.searchParams.set("q", query.query);
    url.searchParams.set("country", query.country);
    url.searchParams.set("search_lang", query.language);
    url.searchParams.set("count", String(Math.min(query.count, this.#maxResults)));

    const response = await this.#request(url);
    const payload: unknown = await response.json();

    return this.#extractResults(payload);
  }

  async healthCheck(): Promise<WebSearchProviderHealth> {
    try {
      const url = new URL(BRAVE_ENDPOINT);
      url.searchParams.set("q", "test");
      url.searchParams.set("count", "1");

      const response = await this.#request(url);
      // On lit et jette : le corps ne sert qu'à vérifier que l'appel aboutit.
      await response.json();

      return { healthy: true, detail: "L'API Brave répond." };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Erreur inconnue.";
      return { healthy: false, detail };
    }
  }

  async #request(url: URL): Promise<Response> {
    const response = await this.#fetch(url.toString(), {
      headers: {
        accept: "application/json",
        "user-agent": FINDIT_USER_AGENT,
        "x-subscription-token": this.#apiKey,
      },
    });

    if (!response.ok) {
      // Le corps peut nommer la cause (quota, clé) ; il ne contient jamais la clé.
      const body = await response.text().catch(() => "");
      throw new WebSearchError(
        this.name,
        response.status,
        body.slice(0, 200) || response.statusText,
      );
    }

    return response;
  }

  #extractResults(payload: unknown): readonly WebSearchResult[] {
    if (typeof payload !== "object" || payload === null) {
      return [];
    }

    const web = (payload as { web?: unknown }).web;
    if (typeof web !== "object" || web === null) {
      return [];
    }

    const results = (web as { results?: unknown }).results;
    if (!Array.isArray(results)) {
      return [];
    }

    const extracted: WebSearchResult[] = [];
    for (const raw of results) {
      if (typeof raw !== "object" || raw === null) {
        continue;
      }

      const item = raw as { url?: unknown; title?: unknown; description?: unknown };
      if (typeof item.url !== "string") {
        continue;
      }

      extracted.push({
        url: item.url,
        title: typeof item.title === "string" ? item.title : "",
        description: typeof item.description === "string" ? item.description : "",
        host: hostOf(item.url),
      });
    }

    return extracted;
  }
}
