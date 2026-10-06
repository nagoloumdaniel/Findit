export { createDeepSeekModel } from "./deepseek-client.js";
export type {
  DeepSeekModel,
  DeepSeekModelConfig,
  FetchLike,
  StructuredRequest,
  TextRequest,
} from "./deepseek-client.js";
export { AiError, AiOutputError, AiUnavailableError } from "./errors.js";

export { computeCostMicroUsd, EMPTY_USAGE } from "./usage.js";
export type { ModelPricing, ModelUsage } from "./usage.js";
