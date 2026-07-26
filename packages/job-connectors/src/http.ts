/**
 * Findit s'identifie toujours. Ce user-agent est celui annoncé dans
 * docs/legal-compliance.md ; le masquer serait une fraude, pas un réglage.
 */
export const FINDIT_USER_AGENT = "FinditBot/0.1 (+https://github.com/Nagoloum/Findit)";

export class HttpRequestError extends Error {
  override readonly name = "HttpRequestError";

  constructor(
    readonly url: string,
    readonly httpStatus: number,
  ) {
    super(`La source a répondu ${String(httpStatus)} sur ${url}.`);
  }
}

export interface ThrottledJsonClientOptions {
  /** Délai minimal entre la fin d'une requête et le départ de la suivante. */
  readonly minRequestIntervalMs: number;
  readonly fetch: typeof globalThis.fetch;
  readonly sleep: (ms: number) => Promise<void>;
  /** Horloge monotone, en millisecondes. */
  readonly monotonicNow: () => number;
}

/**
 * Ce qu'un connecteur peut préciser sur sa requête : la méthode, des en-têtes,
 * un corps. Certaines sources l'exigent - le flux Workday se lit en POST, le
 * jeton France Travail s'obtient en POST avec un formulaire. Ce que le
 * connecteur ne peut PAS préciser : l'identité. Le user-agent de Findit est
 * posé après ces en-têtes et l'emporte toujours.
 */
export interface JsonRequestInit {
  readonly method?: "GET" | "POST";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

/**
 * Le seul accès réseau offert aux connecteurs. Il porte l'identité de Findit et
 * tient la cadence annoncée par la source, y compris quand plusieurs appels
 * sont lancés en même temps : les requêtes sont mises à la file, jamais
 * parallélisées. Un connecteur n'a donc aucun moyen de dépasser la limite.
 */
export class ThrottledJsonClient {
  readonly #minRequestIntervalMs: number;
  readonly #fetch: typeof globalThis.fetch;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #monotonicNow: () => number;

  #queue: Promise<void> = Promise.resolve();
  #lastRequestEndedAt: number | null = null;
  #requestCount = 0;

  constructor(options: ThrottledJsonClientOptions) {
    this.#minRequestIntervalMs = options.minRequestIntervalMs;
    this.#fetch = options.fetch;
    this.#sleep = options.sleep;
    this.#monotonicNow = options.monotonicNow;
  }

  /** Nombre de requêtes réellement parties. Alimente `ConnectorRun.pagesFetched`. */
  get requestCount(): number {
    return this.#requestCount;
  }

  fetchJson(url: string, init?: JsonRequestInit): Promise<unknown> {
    return this.#enqueue(async () => {
      const response = await this.#send(url, "application/json", init);

      // 204 est un succès sans corps - France Travail répond ainsi quand une
      // recherche ne trouve rien. L'interpréter en JSON serait une erreur.
      if (response.status === 204) {
        return null;
      }

      return (await response.json()) as unknown;
    });
  }

  /**
   * Le même accès, en texte brut. Il existe pour `robots.txt` : la permission
   * d'un domaine se lit avant de le collecter, et elle n'est pas du JSON.
   */
  fetchText(url: string): Promise<string> {
    return this.#enqueue(async () => {
      const response = await this.#send(url, "text/plain");
      return response.text();
    });
  }

  #enqueue<T>(request: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(request);
    // La file avance même si une requête échoue : l'erreur revient à l'appelant,
    // elle ne bloque pas la cadence des suivantes.
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #send(url: string, accept: string, init?: JsonRequestInit): Promise<Response> {
    await this.#waitForSlot();
    this.#requestCount += 1;

    try {
      const response = await this.#fetch(url, {
        method: init?.method ?? "GET",
        // L'identité de Findit est posée en dernier : un connecteur ne peut
        // ni la masquer ni la remplacer par ses propres en-têtes.
        headers: { accept, ...init?.headers, "user-agent": FINDIT_USER_AGENT },
        ...(init?.body === undefined ? {} : { body: init.body }),
        redirect: "follow",
      });

      if (!response.ok) {
        throw new HttpRequestError(url, response.status);
      }

      return response;
    } finally {
      this.#lastRequestEndedAt = this.#monotonicNow();
    }
  }

  async #waitForSlot(): Promise<void> {
    if (this.#lastRequestEndedAt === null) {
      return;
    }

    const waitMs = this.#minRequestIntervalMs - (this.#monotonicNow() - this.#lastRequestEndedAt);
    if (waitMs > 0) {
      await this.#sleep(waitMs);
    }
  }
}
