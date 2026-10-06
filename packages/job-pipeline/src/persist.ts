import type { PrismaClient } from "@findit/database";
import { findBestMatch, type ComparableOffer } from "@findit/job-deduplication";

import { chooseApplyUrl } from "./apply-link.js";
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

/** Borne du lot comparé : au-delà, le titre est trop générique pour décider. */
const DUPLICATE_CANDIDATES = 25;

/** Ce qu'il faut savoir d'une offre pour élire la canonique et choisir son lien. */
interface RankedJob {
  readonly id: string;
  readonly status: string;
  readonly canonicalUrl: string;
  readonly applyUrl: string | null;
  readonly sources: readonly { readonly priority: number }[];
}

const RANKED_SELECT = {
  id: true,
  status: true,
  canonicalUrl: true,
  applyUrl: true,
  sources: { select: { priority: true } },
} as const;

/** Rang d'une offre : celui de sa meilleure source. Sans source, zéro. */
const bestPriority = (job: RankedJob): number =>
  job.sources.reduce((best, source) => Math.max(best, source.priority), 0);

/**
 * Les deux offres d'une même publication partagent tout ce qu'on sait d'elles :
 * l'offre retenue reçoit les liens de l'autre, pour que « où a-t-elle été vue,
 * et quand » reste lisible sur l'offre que le public voit.
 */
const shareSources = async (
  prisma: PrismaClient,
  fromJobId: string,
  toJobId: string,
): Promise<void> => {
  const sources = await prisma.jobSource.findMany({
    where: { jobId: fromJobId },
    select: { name: true, url: true, priority: true, checkedAt: true },
  });

  for (const source of sources) {
    await prisma.jobSource.upsert({
      where: { jobId_url: { jobId: toJobId, url: source.url } },
      update: {},
      create: { jobId: toJobId, ...source },
    });
  }
};

type DuplicateOutcome = "MERGED" | "MERGED_AS_CANONICAL" | "REVIEW" | null;

/*
 * Rattache une offre nouvellement créée à son doublon éventuel. Le lot comparé
 * partage le même titre normalisé - c'est l'index qui borne le coût. Une
 * fusion rend la liste publique à une seule ligne par publication ; un doute
 * groupe sans fusionner, en attendant un contrôle. La décision est écrite avec
 * son score et son détail : réversible.
 *
 * Qui reste visible ? La source de rang le plus élevé. Une offre vue d'abord sur
 * un job board puis à la source (l'ATS de l'entreprise) cède donc sa place à la
 * seconde : la source officielle est toujours la canonique. À rang égal, la plus
 * ancienne reste.
 */
const attachDuplicate = async (
  prisma: PrismaClient,
  jobId: string,
  draft: JobDraft,
  context: PersistContext,
): Promise<DuplicateOutcome> => {
  const rows = await prisma.job.findMany({
    where: { normalizedTitle: draft.normalizedTitle, id: { not: jobId } },
    orderBy: { publishedAt: "desc" },
    take: DUPLICATE_CANDIDATES,
    select: {
      ...RANKED_SELECT,
      city: true,
      departmentCode: true,
      publishedAt: true,
      description: true,
      normalizedTitle: true,
      duplicateGroupId: true,
      company: { select: { normalizedName: true } },
    },
  });
  if (rows.length === 0) {
    return null;
  }

  const candidate: ComparableOffer = {
    normalizedTitle: draft.normalizedTitle,
    normalizedCompany: normalizedName(draft.companyName),
    departmentCode: draft.departmentCode,
    city: draft.city,
    publishedAt: draft.publishedAt,
    descriptionText: draft.description,
  };

  const best = findBestMatch(
    candidate,
    rows.map((row) => ({
      row,
      normalizedTitle: row.normalizedTitle,
      normalizedCompany: row.company.normalizedName,
      departmentCode: row.departmentCode,
      city: row.city,
      publishedAt: row.publishedAt,
      descriptionText: row.description,
    })),
  );
  if (best === null) {
    return null;
  }

  const { row } = best.match;
  const score = best.decision.similarity.score;
  const merged = best.decision.action === "MERGE";

  // Le groupe existant est réutilisé ; sinon l'offre déjà en base devient la
  // canonique du groupe créé.
  const groupId: string =
    row.duplicateGroupId ??
    (await prisma.duplicateGroup.create({ data: { canonicalJobId: row.id }, select: { id: true } }))
      .id;
  if (row.duplicateGroupId === null) {
    await prisma.job.update({
      where: { id: row.id },
      data: { duplicateGroupId: groupId, duplicateConfidence: score },
    });
  }

  // La canonique actuelle du groupe : l'offre appariée, ou celle que son groupe
  // désigne quand l'appariée n'en est qu'un membre déjà fusionné.
  let incumbent: RankedJob | null = row;
  if (row.duplicateGroupId !== null) {
    const group = await prisma.duplicateGroup.findUnique({
      where: { id: groupId },
      select: { canonicalJobId: true },
    });
    const canonicalId = group?.canonicalJobId ?? row.id;
    incumbent =
      canonicalId === row.id
        ? row
        : await prisma.job.findUnique({ where: { id: canonicalId }, select: RANKED_SELECT });
  }

  // Seule une offre publiée peut en détrôner une autre : une offre en
  // quarantaine ne doit jamais devenir la vitrine d'une publication.
  const takesOver =
    merged &&
    incumbent !== null &&
    draft.status === "PUBLISHED" &&
    incumbent.status === "PUBLISHED" &&
    context.sourcePriority > bestPriority(incumbent);

  await prisma.job.update({
    where: { id: jobId },
    data: {
      duplicateGroupId: groupId,
      duplicateConfidence: score,
      ...(merged && !takesOver ? { status: "DUPLICATE" } : {}),
    },
  });

  await prisma.duplicateDecision.create({
    data: {
      groupId,
      jobId,
      action: merged ? "MERGED" : "REVIEW",
      score,
      scoreBreakdown: best.decision.similarity.breakdown,
      reasons: [...best.decision.similarity.reasons],
      decidedBy: "RULE",
    },
  });

  if (merged && incumbent !== null) {
    if (takesOver) {
      // La nouvelle offre vient d'une source de rang supérieur : elle devient la
      // canonique du groupe, l'ancienne est masquée mais gardée, avec sa trace.
      await prisma.duplicateGroup.update({
        where: { id: groupId },
        data: { canonicalJobId: jobId },
      });
      await prisma.job.update({ where: { id: incumbent.id }, data: { status: "DUPLICATE" } });
      await prisma.processingLog.create({
        data: {
          jobId: incumbent.id,
          stage: "deduplication",
          fromStatus: "PUBLISHED",
          toStatus: "DUPLICATE",
          succeeded: true,
          message: `Remplacée par l'offre ${jobId} : source de rang ${String(context.sourcePriority)} contre ${String(bestPriority(incumbent))}.`,
          correlationId: context.correlationId,
        },
      });
    }

    const winnerId = takesOver ? jobId : incumbent.id;
    const loserId = takesOver ? incumbent.id : jobId;
    await shareSources(prisma, loserId, winnerId);

    // Le lien de candidature de la publication : celui de l'employeur, d'où
    // qu'il vienne, avant celui d'un job board.
    const winnerCanonicalUrl = takesOver ? draft.canonicalUrl : incumbent.canonicalUrl;
    const chosen = chooseApplyUrl([
      { url: incumbent.canonicalUrl, priority: bestPriority(incumbent) },
      ...(incumbent.applyUrl === null
        ? []
        : [{ url: incumbent.applyUrl, priority: bestPriority(incumbent) }]),
      { url: draft.canonicalUrl, priority: context.sourcePriority },
      ...(draft.applyUrl === null
        ? []
        : [{ url: draft.applyUrl, priority: context.sourcePriority }]),
    ]);
    if (chosen !== null) {
      await prisma.job.update({
        where: { id: winnerId },
        data: { applyUrl: chosen === winnerCanonicalUrl ? null : chosen },
      });
    }
  }

  await prisma.processingLog.create({
    data: {
      jobId,
      stage: "deduplication",
      toStatus: merged && !takesOver ? "DUPLICATE" : null,
      succeeded: true,
      message: merged
        ? takesOver
          ? `Fusionnée avec l'offre ${row.id} (score ${score.toFixed(2)}) et devenue canonique : source de rang supérieur.`
          : `Fusionnée avec l'offre ${row.id} (score ${score.toFixed(2)}).`
        : `Groupée pour contrôle avec l'offre ${row.id} (score ${score.toFixed(2)}).`,
      correlationId: context.correlationId,
    },
  });

  if (!merged) {
    return "REVIEW";
  }

  return takesOver ? "MERGED_AS_CANONICAL" : "MERGED";
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
    applyUrl: null as string | null,
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
    select: { id: true, applyUrl: true },
  });

  /*
   * Lien de candidature : celui que la source donne si c'est l'employeur, la
   * page de l'offre sinon. Une recollecte ne dégrade jamais un lien déjà choisi
   * (par exemple celui hérité d'une fusion). Quand il se confond avec la page de
   * l'offre, rien n'est stocké en plus.
   */
  const chosenApplyUrl = chooseApplyUrl([
    { url: draft.canonicalUrl, priority: context.sourcePriority },
    ...(draft.applyUrl === null ? [] : [{ url: draft.applyUrl, priority: context.sourcePriority }]),
    ...(existing?.applyUrl ? [{ url: existing.applyUrl, priority: context.sourcePriority }] : []),
  ]);
  common.applyUrl = chosenApplyUrl === draft.canonicalUrl ? null : chosenApplyUrl;

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

  // La recherche de doublon ne court qu'à la création : une recollecte met à
  // jour la même ligne, elle ne peut pas créer de doublon nouveau.
  let status: string = draft.status;
  if (existing === null) {
    const duplicate = await attachDuplicate(prisma, job.id, draft, context);
    if (duplicate === "MERGED") {
      status = "DUPLICATE";
    }
  }

  return {
    kind: existing === null ? "created" : "updated",
    jobId: job.id,
    status,
  };
};

/**
 * Écrit ce qu'une décision d'ingestion a établi.
 *
 * Une offre retenue ou en quarantaine devient une ligne `Job` traçable, avec sa
 * source. Une offre rejetée n'a pas de ligne `Job` - le modèle l'interdit - mais
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
