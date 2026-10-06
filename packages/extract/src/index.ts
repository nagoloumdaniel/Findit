export { ExtractError, extractJobsFromPage, finalizeExtraction } from "./extract.js";
export type {
  ExtractModel,
  ExtractStructuredRequest,
  ExtractionResult,
  ModelUsage,
  RejectedOffer,
} from "./extract.js";

export { extractStructuredOffers } from "./structured.js";

export { mentionsPerimeterContract, PERIMETER_CONTRACT_TERMS } from "./contract.js";

export { extractedOfferSchema, extractionResponseSchema, jobOfferSchema } from "./schema.js";
export type { ExtractedOffer, ExtractionResponse, JobOffer } from "./schema.js";

export { looksLikeSchool } from "./school.js";

export { MIN_VALIDATION_SCORE, scoreValidation } from "./validation.js";
export type { ValidationScore } from "./validation.js";
