export { chooseApplyUrl, isJobBoardUrl } from "./apply-link.js";
export type { ApplyCandidate } from "./apply-link.js";

export { decideIngestion } from "./ingest.js";
export type { CollectedOffer, IngestionDecision, JobDraft } from "./ingest.js";

export { persistDecision } from "./persist.js";
export type { PersistContext, PersistResult } from "./persist.js";

export { jobSlug, slugify } from "./slug.js";
