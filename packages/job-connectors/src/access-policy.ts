import { ConnectorStatus, SourceAccessStatus } from "@findit/database";

/**
 * Régimes d'accès sous lesquels une collecte directe est permise. Tout autre
 * régime l'interdit : `SEARCH_ENGINE_DISCOVERY_ONLY` n'autorise qu'une
 * découverte, `MANUAL_IMPORT` passe par un humain, et les deux derniers ferment
 * la source. La liste des régimes et leur signification sont tenues dans
 * docs/legal-compliance.md.
 *
 * `OWNER_ACCEPTED_SCRAPING` (décision du propriétaire, 2026-10-05) permet la
 * collecte d'un job board dont les conditions l'interdisent. Il reste un régime
 * à part pour que l'accès toléré ne se confonde jamais avec un accès permis.
 */
export const COLLECTION_ALLOWED_STATUSES: readonly SourceAccessStatus[] = [
  SourceAccessStatus.OFFICIAL_API,
  SourceAccessStatus.PUBLIC_FEED,
  SourceAccessStatus.AUTHORIZED_CRAWL,
  SourceAccessStatus.OWNER_ACCEPTED_SCRAPING,
];

/**
 * Les conditions d'une source changent sans préavis. Passé ce délai, la
 * dernière vérification ne vaut plus autorisation et la source doit être
 * recontrôlée avant toute nouvelle collecte.
 */
export const TERMS_MAX_AGE_DAYS = 90;

const TERMS_MAX_AGE_MS = TERMS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

export type RefusalReason =
  | "REGISTRATION_MISMATCH"
  | "ACCESS_STATUS_FORBIDS_COLLECTION"
  | "CONNECTOR_NOT_ACTIVE"
  | "TERMS_NEVER_CHECKED"
  | "TERMS_CHECK_EXPIRED";

/**
 * Ce que le registre dit d'un connecteur. Correspond aux champs décisifs de la
 * ligne `Connector` en base : c'est le registre qui autorise une exécution, pas
 * le code du connecteur.
 */
export interface ConnectorRegistration {
  readonly name: string;
  readonly accessStatus: SourceAccessStatus;
  readonly status: ConnectorStatus;
  readonly termsCheckedAt: Date | null;
}

export type AccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: RefusalReason; readonly detail: string };

const refuse = (reason: RefusalReason, detail: string): AccessDecision => ({
  allowed: false,
  reason,
  detail,
});

/**
 * Décide si le connecteur nommé a le droit de collecter maintenant. `now` est
 * passé plutôt que lu, afin que la décision reste reproductible.
 */
export const decideCollectionAccess = (
  connectorName: string,
  registration: ConnectorRegistration,
  now: Date,
): AccessDecision => {
  if (registration.name !== connectorName) {
    return refuse(
      "REGISTRATION_MISMATCH",
      `Le connecteur « ${connectorName} » est présenté avec le registre de « ${registration.name} ».`,
    );
  }

  if (!COLLECTION_ALLOWED_STATUSES.includes(registration.accessStatus)) {
    return refuse(
      "ACCESS_STATUS_FORBIDS_COLLECTION",
      `Le régime d'accès ${registration.accessStatus} n'autorise pas la collecte directe.`,
    );
  }

  if (registration.status !== ConnectorStatus.ACTIVE) {
    return refuse("CONNECTOR_NOT_ACTIVE", `Le connecteur est en état ${registration.status}.`);
  }

  if (registration.termsCheckedAt === null) {
    return refuse(
      "TERMS_NEVER_CHECKED",
      "Les conditions d'utilisation de la source n'ont jamais été vérifiées.",
    );
  }

  const ageMs = now.getTime() - registration.termsCheckedAt.getTime();
  if (ageMs > TERMS_MAX_AGE_MS) {
    return refuse(
      "TERMS_CHECK_EXPIRED",
      `La dernière vérification des conditions remonte au ${registration.termsCheckedAt.toISOString()}, au-delà de ${String(TERMS_MAX_AGE_DAYS)} jours.`,
    );
  }

  return { allowed: true };
};
