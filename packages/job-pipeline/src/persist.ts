import type { PrismaClient } from "@findit/database";

import type { IngestionDecision, JobDraft } from "./ingest.js";
import { jobSlug, slugify } from "./slug.js";

/**
 * Ce qu'on sait de la collecte au moment d'écrire : où l'offre a été vue, quand,
 * et le rang de confiance de cette source. `correlationId` relie tous les
 * journaux d'une même exécution.
 */
export interface PersistContext {
  readonly sourceUrl: string;
  readonly checkedAt: Date;
  readonly correlationId: string;
  /** Rang de la source. Une page officielle prime sur un agrégateur. */
  readonly sourcePriority: number;
}

export type PersistResult =
  | { readonly kind: "created" | "updated"; readonly jobId: string; readonly status: string }
  | { readonly kind: "rejected"; readonly stage: string };

const normalizedName = (name: string): string =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

/**
 * Retrouve ou crée l'entreprise, par son slug. Le slug vient du nom : deux
 * collectes de la même entreprise retombent donc sur la même ligne. La
 * réconciliation fine des variantes de nom relève de `CompanyAlias`, pas d'ici.
 */
const resolveCompany = async (prisma: PrismaClient, name: string): Promise<string> => {
  const slug = slugify(name) || slugify(normalizedName(name)) || "entreprise";

  const company = await prisma.company.upsert({
    where: { slug },
    update: {},
    create: { slug, name, normalizedName: normalizedName(name) },
    select: { id: true },
  });

  return company.id;
};

const writeJob = async (
  prisma: PrismaClient,
  draft: JobDraft,
  companyId: string,
  context: PersistContext,
): Promise<PersistResult> => {
  const slug = jobSlug(draft.normalizedTitle, draft.city, draft.externalId);

  /*
   * L'unicité (entreprise, identifiant de source) fait l'idempotence : la même
   * offre recollectée met à jour sa ligne au lieu d'en créer une seconde.
   * `firstSeenAt` n'est écrit qu'à la création ; `lastSeenAt` suit chaque
   * passage.
   */
  const common = {
    slug,
    title: draft.title,
    normalizedTitle: draft.normalizedTitle,
    roleCategory: draft.roleCategory,
    contractType: draft.contractType,
    workMode: draft.workMode,
    description: draft.description,
    responsibilities: [...draft.responsibilities],
    requirements: [...draft.requirements],
    benefits: [...draft.benefits],
    city: draft.city,
    departmentCode: draft.departmentCode,
    publishedAt: draft.publishedAt,
    expiresAt: draft.expiresAt,
    canonicalUrl: draft.canonicalUrl,
    schoolRiskScore: draft.schoolRiskScore,
    schoolRiskReasons: [...draft.schoolRiskReasons],
    fraudRiskScore: 0,
    fraudRiskReasons: [],
    dataQualityScore: draft.dataQualityScore,
    confidenceScore: draft.confidenceScore,
    status: draft.status,
  };

  const existing = await prisma.job.findUnique({
    where: { companyId_externalId: { companyId, externalId: draft.externalId } },
    select: { id: true },
  });

  const job = await prisma.job.upsert({
    where: { companyId_externalId: { companyId, externalId: draft.externalId } },
    update: { ...common, lastSeenAt: context.checkedAt },
    create: {
      ...common,
      companyId,
      externalId: draft.externalId,
      firstSeenAt: context.checkedAt,
      lastSeenAt: context.checkedAt,
    },
    select: { id: true },
  });

  // La source où l'offre a été vue. Toutes les sources sont conservées : la
  // clé (offre, url) évite le doublon sans écraser les autres liens.
  await prisma.jobSource.upsert({
    where: { jobId_url: { jobId: job.id, url: context.sourceUrl } },
    update: { checkedAt: context.checkedAt, priority: context.sourcePriority },
    create: {
      jobId: job.id,
      name: draft.sourceName,
      url: context.sourceUrl,
      priority: context.sourcePriority,
      checkedAt: context.checkedAt,
    },
  });

  await prisma.processingLog.create({
    data: {
      jobId: job.id,
      stage: "ingestion",
      toStatus: draft.status,
      succeeded: true,
      message: `Offre ${existing === null ? "créée" : "mise à jour"} en ${draft.status}.`,
      correlationId: context.correlationId,
    },
  });

  return {
    kind: existing === null ? "created" : "updated",
    jobId: job.id,
    status: draft.status,
  };
};

/**
 * Écrit ce qu'une décision d'ingestion a établi.
 *
 * Une offre retenue ou en quarantaine devient une ligne `Job` traçable, avec sa
 * source. Une offre rejetée n'a pas de ligne `Job` — le modèle l'interdit — mais
 * elle laisse une trace dans `ProcessingLog`, le seul endroit prévu pour une
 * offre écartée. Rien n'est perdu en silence.
 */
export const persistDecision = async (
  prisma: PrismaClient,
  decision: IngestionDecision,
  context: PersistContext,
): Promise<PersistResult> => {
  if (decision.outcome === "REJECTED") {
    await prisma.processingLog.create({
      data: {
        stage: decision.stage,
        succeeded: false,
        message: decision.reasons.join(" "),
        correlationId: context.correlationId,
      },
    });

    return { kind: "rejected", stage: decision.stage };
  }

  const companyId = await resolveCompany(prisma, decision.draft.companyName);
  return writeJob(prisma, decision.draft, companyId, context);
};
