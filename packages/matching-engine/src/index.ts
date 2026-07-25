export { computeMatch } from "./score.js";
export type {
  JobMatchInput,
  MatchCriterion,
  MatchCriterionId,
  MatchResult,
  ResumeMatchInput,
} from "./score.js";

export { canonicalizeSkill, detectSkillsInText, TECH_DICTIONARY } from "./tech-dictionary.js";
export type { TechEntry, TechKind } from "./tech-dictionary.js";

export { containsAlias, normalizeText, tokenize } from "./normalize.js";
