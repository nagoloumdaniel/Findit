export const JOB_CONTRACTS = ["ALTERNANCE", "INTERNSHIP"] as const;
export type JobContract = (typeof JOB_CONTRACTS)[number];

export const JOB_ROLE_CATEGORIES = [
  "FRONTEND",
  "BACKEND",
  "FULLSTACK",
  "MOBILE",
  "DATA_ANALYST",
  "DATA_ENGINEER",
] as const;
export type JobRoleCategory = (typeof JOB_ROLE_CATEGORIES)[number];

export const DEFAULT_MAX_AGE_HOURS = 24;
export const EXTENDED_MAX_AGE_HOURS = 72;
