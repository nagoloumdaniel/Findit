/**
 * Accès réseau du crawler, modelé sur packages/job-connectors/src/http.ts.
 *
 * Le crawler s'identifie toujours, et tient la cadence minimale entre deux
 * requêtes. La file sérialise les requêtes : même si l'appelant en lance
 * plusieurs à la fois, elles partent une par une et jamais plus vite que la
 * limite. C'est ce qui rend le crawler respectueux des sites qu'il lit.
 */

/** Identité annoncée, la même que celle de `@findit/job-connectors`. */
export const FINDIT_USER_AGENT = "FinditBot/0.1 (+https://github.com/Nagoloum/Findit)";

export interface HttpPage {
  /** URL finale après redirections. */
  readonly url: string;
  readonly status: number;
  readonly html: string;
}

export interface HttpFetcherOptions {
  readonly userAgent: string;
  /** Cadence minimale entre la fin d'une requête et le départ de la suivante. */
  readonly minRequestIntervalMs: number;
  readonly fetch: typeof globalThis.fetch;
  readonly sleep: (ms: number) => Promise<void>;
  /** Horloge monotone, en millisecondes. */
  readonly monotonicNow: () => number;
}

/**
 * Le seul accès réseau offert au crawler. Il porte l'identité de Findit, suit
 * les redirections et tient la cadence. Il ne jette jamais sur un statut non 2xx
 * : une 404 ou une 500 est un fait que le crawler enregistre, pas une raison
 * d'abandonner tout le crawl.
 */
export class HttpFetcher {
  readonly #minRequestIntervalMs: number;
  readonly #fetch: typeof globalThis.fetch;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #monotonicNow: () => number;
  readonly #userAgent: string;

  #queue: Promise<void> = Promise.resolve();
  #lastRequestEndedAt: number | null = null;
  #requestCount = 0;

  constructor(options: HttpFetcherOptions) {
    this.#minRequestIntervalMs = options.minRequestIntervalMs;
    this.#fetch = options.fetch;
    this.#sleep = options.sleep;
    this.#monotonicNow = options.monotonicNow;
    this.#userAgent = options.userAgent;
  }

  /** Nombre de requêtes réellement parties, robots.txt compris. */
  get requestCount(): number {
    return this.#requestCount;
  }

  /**
   * Lit une URL en HTML, en suivant les redirections.
   *
   * `extraIntervalMs` permet d'imposer une cadence plus lente pour un domaine
   * précis : c'est le `Crawl-delay` annoncé par son `robots.txt`, qui peut
   * dépasser la cadence globale.
   */
  get(url: string, extraIntervalMs = 0): Promise<HttpPage> {
    return this.#enqueue(async () => {
      const requiredMs = Math.max(this.#minRequestIntervalMs, extraIntervalMs);
      await this.#waitForSlot(requiredMs);
      this.#requestCount += 1;

      try {
        const response = await this.#fetch(url, {
          method: "GET",
          headers: {
            accept: "text/html,application/xhtml+xml",
            // L'identité de Findit est posée ici et ne peut pas être remplacée.
            "user-agent": this.#userAgent,
          },
          redirect: "follow",
        });

        const html = await response.text();
        return { url: response.url, status: response.status, html };
      } finally {
        this.#lastRequestEndedAt = this.#monotonicNow();
      }
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

  async #waitForSlot(requiredMs: number): Promise<void> {
    if (this.#lastRequestEndedAt === null) {
      return;
    }

    const waitMs = requiredMs - (this.#monotonicNow() - this.#lastRequestEndedAt);
    if (waitMs > 0) {
      await this.#sleep(waitMs);
    }
  }
}
