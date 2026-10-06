import type { AtsKind } from "@findit/database";

import type { JsonRequestInit } from "./http.js";
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
  /**
   * Nom d'employeur porté par l'offre elle-même. Les connecteurs par jeton
   * n'en ont pas besoin - la cible nomme l'entreprise - mais une recherche
   * réseau comme Workable rend des offres de nombreuses entreprises : le nom
   * doit venir de chaque offre, jamais d'un libellé de requête.
   */
  readonly companyName?: string | null;
  /**
   * Lien de candidature quand la source le donne : souvent la page de l'ATS de
   * l'employeur, derrière une offre de job board. Les connecteurs natifs ne le
   * renseignent pas - leur `url` est déjà celle de l'ATS. Il n'est pas encore
   * persisté ; la fusion inter-sources (TASK-307) en dépend.
   */
  readonly applyUrl?: string | null;
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
 * Ce qu'un connecteur reçoit pour travailler. `fetchJson` et `fetchText` sont
 * son seul accès réseau : ils annoncent l'identité de Findit et respectent la
 * cadence de la source. Un connecteur ne fabrique donc jamais sa propre
 * requête. `fetchText` existe pour `robots.txt` : la permission d'un domaine
 * se lit avant de le collecter.
 */
export interface CollectionContext {
  readonly fetchJson: (url: string, init?: JsonRequestInit) => Promise<unknown>;
  readonly fetchText: (url: string) => Promise<string>;
  readonly now: () => Date;
  /** Relie les journaux d'une même exécution entre les processus. */
  readonly correlationId: string;
  /**
   * Déclare ce que l'exécution a coûté jusqu'ici, en micro-dollars, TOTAL et non
   * incrément : l'appeler deux fois remplace la valeur. Sert aux sources
   * payantes ; une source gratuite ne l'appelle jamais. Le coût déclaré avant un
   * échec est consigné quand même : un run raté a pu être facturé.
   */
  readonly reportCostMicroUsd: (totalMicroUsd: number) => void;
  /**
   * Signale un fait qui n'a pas fait échouer la collecte mais que la trace doit
   * garder, par exemple des éléments rejetés par la validation. Il est consigné
   * comme erreur de la source, sans clore l'exécution en échec.
   */
  readonly reportNotice: (kind: string, message: string) => void;
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
  /**
   * Présent seulement sur une source payante : coût MAXIMAL d'une exécution
   * pour cette cible, en micro-dollars. Sa présence rend la garde de budget
   * obligatoire - un connecteur qui en dépend ne s'exécute pas sans elle. Elle
   * lève si l'exécution n'est pas bornée.
   */
  estimateCostMicroUsd?(target: TTarget): number;

  collect(
    permit: CollectionPermit,
    target: TTarget,
    context: CollectionContext,
  ): Promise<readonly RawJob[]>;
}
