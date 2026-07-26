export { createPrismaClient } from "./client.js";
export { PrismaClient, Prisma } from "./generated/prisma/client.js";
export {
  ApplicationStatus,
  AtsKind,
  ConnectorRunStatus,
  ConnectorStatus,
  ContractType,
  DecisionSource,
  RoleCategory,
  SourceAccessStatus,
  WorkMode,
  SalaryPeriod,
  JobStatus,
  SkillKind,
  SkillRequirement,
  NotificationType,
  NotificationStatus,
} from "./generated/prisma/enums.js";

/*
 * Prisma nomme les types de ligne avec un suffixe `Model`. Ils sont réexportés
 * sous le nom de l'entité pour que les consommateurs écrivent `Job` et non
 * `JobModel`.
 */
export type {
  CompanyModel as Company,
  JobModel as Job,
  JobSkillModel as JobSkill,
  JobSourceModel as JobSource,
  SkillModel as Skill,
} from "./generated/prisma/models.js";
