/**
 * Types publics du crawler.
 *
 * Le crawler rend des faits, pas des interprétations. `status` vaut 0 quand la
 * page n'a jamais été demandée : soit `robots.txt` l'interdisait
 * (`robotsDenied`), soit la requête a échoué au niveau réseau. Dans les deux
 * cas, `html` et `text` restent vides, et c'est l'appelant qui décide quoi en
 * faire.
 */

export interface CrawledPage {
  readonly url: string;
  /** Profondeur depuis l'URL de départ : 0 pour la page de départ. */
  readonly depth: number;
  readonly html: string;
  /** Texte visible, extrait du HTML après retrait des scripts et styles. */
  readonly text: string;
  /** Statut HTTP réel. 0 quand la page n'a pas été demandée. */
  readonly status: number;
  /** Vrai quand `robots.txt` interdisait ce chemin : la page n'a pas été lue. */
  readonly robotsDenied: boolean;
}

/**
 * Pourquoi le crawl s'est arrêté. `maxDepth` n'apparaît pas : la profondeur est
 * une frontière de descente, pas une raison d'arrêt. Quand plus aucun lien ne
 * reste à suivre, le crawl est `completed`.
 */
export type CrawlStopReason = "completed" | "maxPages" | "maxRuntime";

export interface CrawlResult {
  readonly pages: readonly CrawledPage[];
  readonly stopReason: CrawlStopReason;
  /** Vrai quand une borne a tronqué la collecte avant son terme naturel. */
  readonly truncated: boolean;
  /** Nombre d'URLs distinctes examinées (lues ou refusées). */
  readonly visitedCount: number;
  readonly robotsDeniedCount: number;
}

/** Ce que le repli navigateur rend pour une page. */
export interface RenderedPage {
  readonly html: string;
  readonly text: string;
  readonly status: number;
}

/**
 * Configuration invalide, par exemple une borne négative ou une URL de départ
 * qui n'est pas en http(s). C'est une faute de programmation : elle est levée
 * avant le moindre accès réseau.
 */
export class CrawlConfigError extends Error {
  override readonly name = "CrawlConfigError";
}
