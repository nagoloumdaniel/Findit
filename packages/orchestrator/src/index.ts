export { runAgent } from "./run-agent.js";
export type { CrawlSource, ExtractJobs, RunAgentDeps, RunAgentResult } from "./run-agent.js";

export {
  DEFAULT_COUNTRY,
  DEFAULT_LANGUAGE,
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_PAGES,
  DEFAULT_MAX_PAGES_PER_SOURCE,
  DEFAULT_MAX_QUERIES,
  DEFAULT_MAX_RUNTIME_MS,
  DEFAULT_RESULT_COUNT,
  RunAgentConfigError,
} from "./config.js";
export type { RunAgentOptions } from "./config.js";

export { isHttpUrl, isValidOffer, normalizeTitle } from "./dedup.js";
