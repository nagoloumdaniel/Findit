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
  SearchTarget,
} from "./connector.js";

export {
  GREENHOUSE_CONNECTOR_NAME,
  GreenhouseShapeError,
  greenhouseConnector,
} from "./greenhouse.js";

export { FINDIT_USER_AGENT, HttpRequestError } from "./http.js";

export {
  LEVER_CONNECTOR_NAME,
  LEVER_CRAWL_DELAY_MS,
  LeverShapeError,
  leverConnector,
} from "./lever.js";

export {
  ConnectorNotRegisteredError,
  createPrismaConnectorRunStore,
  runRecordedConnector,
} from "./recorded-run.js";
export type { ClosedRun, ConnectorRunStore, RecordedError } from "./recorded-run.js";

export { CONNECTOR_REGISTRY_ENTRIES, loadRegistration, syncConnectorRegistry } from "./registry.js";
export type { ConnectorRegistryEntry } from "./registry.js";

export { CollectionRefusedError, runConnector } from "./run.js";
export type { ConnectorRunOutcome, RunConnectorDeps } from "./run.js";

/*
 * Seul le type du permis sort du paquet, jamais la classe : hors d'ici, un
 * permis ne peut pas être fabriqué, et `collect` ne peut donc pas être appelé
 * sans passer par `runConnector`, qui vérifie le droit de collecter.
 */
export type { CollectionPermit } from "./permit.js";

export {
  WORKABLE_CONNECTOR_NAME,
  WORKABLE_REQUEST_INTERVAL_MS,
  WorkableShapeError,
  workableConnector,
} from "./workable.js";
