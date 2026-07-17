export { classifyJob } from "./classify.js";
export type { ClassificationInput, ClassificationOutcome, JobClassification } from "./classify.js";

export { readContract, mentionsOutOfScopeContract } from "./contract.js";
export type { ContractSignal } from "./contract.js";

export { readRole } from "./role.js";
export type { RoleSignal } from "./role.js";

export { detectSchoolRisk } from "./school.js";
export type { OrganisationKind, SchoolDetection, SchoolDetectionInput } from "./school.js";
