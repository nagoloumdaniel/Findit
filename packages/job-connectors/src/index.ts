export {
  COLLECTION_ALLOWED_STATUSES,
  TERMS_MAX_AGE_DAYS,
  decideCollectionAccess,
} from "./access-policy.js";
export type { AccessDecision, ConnectorRegistration, RefusalReason } from "./access-policy.js";

export type {
  CollectionContext,
  CollectionTarget,
  JobSourceConnector,
  RawJob,
} from "./connector.js";

export {
  GREENHOUSE_CONNECTOR_NAME,
  GreenhouseShapeError,
  greenhouseConnector,
} from "./greenhouse.js";

export { FINDIT_USER_AGENT, HttpRequestError } from "./http.js";

export { CollectionRefusedError, runConnector } from "./run.js";
export type { ConnectorRunOutcome, RunConnectorDeps } from "./run.js";

/*
 * Seul le type du permis sort du paquet, jamais la classe : hors d'ici, un
 * permis ne peut pas être fabriqué, et `collect` ne peut donc pas être appelé
 * sans passer par `runConnector`, qui vérifie le droit de collecter.
 */
export type { CollectionPermit } from "./permit.js";
