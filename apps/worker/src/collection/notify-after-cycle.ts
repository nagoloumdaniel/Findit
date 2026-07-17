import { JobStatus, type PrismaClient } from "@findit/database";
import type {
  NotifiableJobWithId,
  NotifyOptions,
  NotifySummary,
  TelegramSender,
} from "@findit/notifications";
import { notifyNewJobs } from "@findit/notifications";
import { DEFAULT_CONTRACTS, DEFAULT_ROLE_CATEGORIES } from "@findit/shared";

import { roleLabelOf } from "./labels.js";

export interface NotifyAfterCycleDeps {
  readonly prisma: PrismaClient;
  readonly sender: TelegramSender;
  /** Début du cycle : une offre est « nouvelle » si sa première vue est postérieure. */
  readonly since: Date;
  readonly now: Date;
  readonly appUrl: string | null;
  readonly options: NotifyOptions;
}

const CONTRACT_LABELS: Record<string, string> = {
  ALTERNANCE: "Alternance",
  INTERNSHIP: "Stage",
};

const ageLabel = (publishedAt: Date, now: Date): string => {
  const hours = Math.round((now.getTime() - publishedAt.getTime()) / (60 * 60 * 1000));
  if (hours < 1) {
    return "à l'instant";
  }
  return `il y a ${String(hours)} h`;
};

/**
 * Notifie les offres réellement apparues pendant le cycle.
 *
 * « Nouvelle » veut dire première vue depuis le début du cycle : une offre
 * recollectée n'est pas neuve, et la clé d'idempotence l'écarterait de toute
 * façon. On ne notifie que ce que le flux montre — les alternances de
 * développement — pour que l'alerte corresponde à ce que l'utilisateur suit.
 */
export const notifyAfterCycle = async (deps: NotifyAfterCycleDeps): Promise<NotifySummary> => {
  const rows = await deps.prisma.job.findMany({
    where: {
      status: JobStatus.PUBLISHED,
      firstSeenAt: { gte: deps.since },
      roleCategory: { in: [...DEFAULT_ROLE_CATEGORIES] },
      contractType: { in: [...DEFAULT_CONTRACTS] },
    },
    orderBy: { publishedAt: "desc" },
    include: {
      company: { select: { name: true } },
      skills: { include: { skill: { select: { name: true } } } },
    },
  });

  const base = deps.appUrl === null ? null : deps.appUrl.replace(/\/$/u, "");

  const jobs: NotifiableJobWithId[] = rows.map((row) => ({
    jobId: row.id,
    title: row.title,
    companyName: row.company.name,
    city: row.city,
    roleLabel: roleLabelOf(row.roleCategory),
    contractLabel: CONTRACT_LABELS[row.contractType] ?? row.contractType,
    technologies: row.skills.map((link) => link.skill.name),
    ageLabel: ageLabel(row.publishedAt, deps.now),
    url: row.canonicalUrl,
    detailUrl: base === null ? row.canonicalUrl : `${base}/offres/${row.slug}`,
  }));

  return notifyNewJobs(deps.prisma, deps.sender, jobs, deps.options, deps.now);
};
