import type { AtsKind } from "@findit/database";

import type { CollectionPermit } from "./permit.js";

/**
 * Une offre telle que la source l'a rendue, avant toute normalisation. Les
 * champs typés servent la suite du traitement ; `rawContent` conserve la charge
 * utile d'origine pour qu'une décision reste reconstituable.
 */
export interface RawJob {
  /** Identifiant de l'offre chez la source. */
  readonly sourceJobId: string;
  readonly url: string;
  readonly title: string;
  readonly locationLabel: string | null;
  readonly descriptionHtml: string | null;
  readonly publishedAt: Date | null;
  readonly rawContent: string;
  readonly contentType: string;
}

/** L'entreprise à collecter chez la source. */
export interface CollectionTarget {
  /**
   * Identifiant de l'entreprise chez l'ATS : le « board token » côté
   * Greenhouse, le nom de compte côté Lever.
   */
  readonly atsIdentifier: string;
  readonly companyName: string;
}

/**
 * Ce qu'on cherche, quand la source cherche au lieu de lister.
 *
 * Toutes les sources ne s'interrogent pas entreprise par entreprise. Workable
 * expose une recherche sur l'ensemble de son réseau : lui demander « le board
 * de telle entreprise » n'a pas de sens, et détourner `atsIdentifier` pour y
 * loger une requête serait mentir sur ce que le champ nomme.
 */
export interface SearchTarget {
  readonly query: string;
  /** Zone telle que la source la comprend : « Paris », « France ». */
  readonly location: string;
}

/**
 * Ce qu'un connecteur reçoit pour travailler. `fetchJson` est son seul accès
 * réseau : il annonce l'identité de Findit et respecte la cadence de la source.
 * Un connecteur ne fabrique donc jamais sa propre requête.
 */
export interface CollectionContext {
  readonly fetchJson: (url: string) => Promise<unknown>;
  readonly now: () => Date;
  /** Relie les journaux d'une même exécution entre les processus. */
  readonly correlationId: string;
}

/**
 * Le contrat d'un connecteur : lire une source autorisée et rendre des offres
 * brutes traçables.
 *
 * Ce que le connecteur ne décide pas : son droit de s'exécuter, qui vient du
 * registre `Connector` en base ; et sa cadence réelle, appliquée par le client
 * HTTP que lui passe l'exécuteur.
 */
export interface JobSourceConnector<TTarget = CollectionTarget> {
  /** Doit correspondre à `Connector.name` en base. */
  readonly name: string;
  readonly atsKind: AtsKind;
  /**
   * Délai minimal entre deux requêtes, imposé par la source. Lever annonce
   * `Crawl-delay: 1` : son connecteur déclare 1000.
   */
  readonly minRequestIntervalMs: number;

  collect(
    permit: CollectionPermit,
    target: TTarget,
    context: CollectionContext,
  ): Promise<readonly RawJob[]>;
}
