export { decideDiscoveredSourceAccess } from "./board-access.js";
export type { SourceAccessRefusal, SourceAccessVerdict } from "./board-access.js";

export { isAggregatorTenant } from "./aggregator-tenants.js";

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

export {
  FRANCE_TRAVAIL_CONNECTOR_NAME,
  FRANCE_TRAVAIL_REQUEST_INTERVAL_MS,
  FranceTravailShapeError,
  createFranceTravailConnector,
} from "./france-travail.js";
export type { FranceTravailCredentials } from "./france-travail.js";

export { FINDIT_USER_AGENT, HttpRequestError } from "./http.js";
export type { JsonRequestInit } from "./http.js";

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
export type {
  ClosedRun,
  ConnectorRunStore,
  DecisionCounts,
  RecordedError,
  RecordedRunOutcome,
} from "./recorded-run.js";

export { CONNECTOR_REGISTRY_ENTRIES, loadRegistration, syncConnectorRegistry } from "./registry.js";
export type { ConnectorRegistryEntry } from "./registry.js";

export {
  APIFY_REQUEST_INTERVAL_MS,
  ApifyItemError,
  ApifyRunError,
  ApifyShapeError,
  createApifyConnector,
} from "./apify.js";
export type { ApifyConnectorConfig } from "./apify.js";

export {
  BudgetGuardMissingError,
  BudgetRefusedError,
  CollectionRefusedError,
  RunTracker,
  runConnector,
} from "./run.js";

export {
  MICRO_USD_PER_USD,
  UnboundedRunError,
  assertBoundedMaxItems,
  createCycleBudget,
  microUsdToUsd,
  usdToMicroUsd,
  worstCaseRunCostMicroUsd,
} from "./spend-budget.js";
export type {
  ActorPricing,
  BudgetConfig,
  BudgetDecision,
  BudgetRefusalReason,
  BudgetTicket,
  CycleBudget,
  SpendLedger,
} from "./spend-budget.js";
export { createPrismaSpendLedger, startOfMonthUtc } from "./spend-ledger.js";
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

export {
  WORKDAY_CONNECTOR_NAME,
  WORKDAY_REQUEST_INTERVAL_MS,
  WorkdayRobotsError,
  WorkdayShapeError,
  workdayConnector,
} from "./workday.js";

export { decideRobots, groupFor, parseContentSignal, parseRobots } from "./robots.js";
export type { RobotsDecision, RobotsFile, RobotsGroup, RobotsVerdict } from "./robots.js";

export { BraveSearchProvider, WebSearchError } from "./web-search.js";
export type {
  BraveSearchProviderOptions,
  WebSearchProvider,
  WebSearchProviderHealth,
  WebSearchQuery,
  WebSearchResult,
} from "./web-search.js";

export { collectDiscoveries, recognizeTarget } from "./discovery.js";
export type { DiscoveredTarget, DiscoveryOutcome } from "./discovery.js";

export { CAREER_SCAN_ATS, extractAtsReferences } from "./career-scan.js";
export type { CareerScanFinding } from "./career-scan.js";

export { listCollectableSources, registerDiscoveredSource } from "./discovered-sources.js";
export type { CollectableSource, DiscoveredSource } from "./discovered-sources.js";

export { buildDiscoveryQueries } from "./discovery-queries.js";

export {
  WTTJ_ACTOR_ID,
  WTTJ_CONNECTOR_NAME,
  WTTJ_MAX_ITEMS_CEILING,
  WttjInputError,
  createWttjConnector,
  mapWttjItem,
} from "./wttj.js";
export type { WttjConnectorOptions } from "./wttj.js";

export {
  HELLOWORK_ACTOR_ID,
  HELLOWORK_CONNECTOR_NAME,
  HELLOWORK_MAX_ITEMS_CEILING,
  HelloworkInputError,
  createHelloworkConnector,
  mapHelloworkItem,
} from "./hellowork.js";
export type { HelloworkConnectorOptions } from "./hellowork.js";

export {
  INDEED_ACTOR_ID,
  INDEED_CONNECTOR_NAME,
  INDEED_MAX_ITEMS_CEILING,
  createIndeedConnector,
  mapIndeedItem,
} from "./indeed.js";
export type { IndeedConnectorOptions } from "./indeed.js";

export { SOURCE_PRIORITY_JOB_BOARD, SOURCE_PRIORITY_OFFICIAL } from "./source-priority.js";
