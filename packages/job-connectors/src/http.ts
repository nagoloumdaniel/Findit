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

  fetchJson(url: string): Promise<unknown> {
    const result = this.#queue.then(() => this.#request(url));
    // La file avance même si une requête échoue : l'erreur revient à l'appelant,
    // elle ne bloque pas la cadence des suivantes.
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #request(url: string): Promise<unknown> {
    await this.#waitForSlot();
    this.#requestCount += 1;

    try {
      const response = await this.#fetch(url, {
        headers: { "user-agent": FINDIT_USER_AGENT, accept: "application/json" },
        redirect: "follow",
      });

      if (!response.ok) {
        throw new HttpRequestError(url, response.status);
      }

      return (await response.json()) as unknown;
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
