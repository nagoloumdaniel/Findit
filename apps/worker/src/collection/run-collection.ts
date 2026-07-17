import type {
  ConnectorRunStore,
  JobSourceConnector,
  RunConnectorDeps,
} from "@findit/job-connectors";
import { CollectionRefusedError, runRecordedConnector } from "@findit/job-connectors";
import type { CollectedOffer, PersistContext } from "@findit/job-pipeline";
import { decideIngestion, persistDecision } from "@findit/job-pipeline";

/**
 * Une chose à collecter : un connecteur, la cible qu'il vise, et le nom de
 * l'entreprise à porter sur les offres. Le type de la cible reste ouvert —
 * Greenhouse vise une entreprise, Workable une recherche.
 */
export interface CollectionJob<TTarget> {
  readonly connector: JobSourceConnector<TTarget>;
  readonly target: TTarget;
  /** Nom d'entreprise à attacher aux offres collectées. */
  readonly companyName: string;
  /** Rang de la source pour `JobSource`. Une page officielle prime. */
  readonly sourcePriority: number;
}

/** Ce qu'une source de persistance doit savoir faire pour l'orchestrateur. */
export interface CollectionPersistence {
  persist(offer: CollectedOffer, context: PersistContext): Promise<PersistOutcome>;
}

export type PersistOutcome = "created" | "updated" | "quarantined" | "rejected";

export interface CollectionJobSummary {
  readonly connectorName: string;
  readonly companyName: string;
  readonly discovered: number;
  readonly accepted: number;
  readonly quarantined: number;
  readonly rejected: number;
  /** Vrai si la collecte elle-même a échoué (réseau, refus, forme). */
  readonly failed: boolean;
  readonly failureReason: string | null;
}

export interface CollectionSummary {
  readonly correlationId: string;
  readonly jobs: readonly CollectionJobSummary[];
  readonly totalAccepted: number;
  readonly totalQuarantined: number;
  readonly totalRejected: number;
}

export interface RunCollectionDeps {
  readonly store: ConnectorRunStore;
  readonly persistence: CollectionPersistence;
  readonly connectorDeps: RunConnectorDeps;
  readonly now: () => Date;
}

/**
 * Décide et persiste chaque offre d'une collecte, puis rend les comptes.
 *
 * Une offre écartée par la décision d'ingestion n'est pas une erreur de la
 * collecte : la collecte a réussi, l'offre n'a simplement pas sa place. Les deux
 * comptes restent donc distincts — `failed` dit si la source a lâché, les
 * compteurs disent le tri.
 */
const decideAndPersist = async (
  offers: readonly CollectedOffer[],
  sourcePriority: number,
  deps: RunCollectionDeps,
  correlationId: string,
): Promise<{ accepted: number; quarantined: number; rejected: number }> => {
  let accepted = 0;
  let quarantined = 0;
  let rejected = 0;

  for (const offer of offers) {
    const outcome = await deps.persistence.persist(offer, {
      sourceUrl: offer.url,
      checkedAt: deps.now(),
      correlationId,
      sourcePriority,
    });

    if (outcome === "created" || outcome === "updated") {
      accepted += 1;
    } else if (outcome === "quarantined") {
      quarantined += 1;
    } else {
      rejected += 1;
    }
  }

  return { accepted, quarantined, rejected };
};

/**
 * Exécute une liste de collectes, l'une après l'autre.
 *
 * L'échec d'une source n'arrête pas les autres : c'est la règle de conformité —
 * « la collecte continue avec les autres ». Chaque collecte laisse sa trace dans
 * `ConnectorRun`, à laquelle on ajoute le sort des offres une fois décidées.
 */
export const runCollection = async (
  collectionJobs: readonly CollectionJob<unknown>[],
  deps: RunCollectionDeps,
): Promise<CollectionSummary> => {
  const correlationId = deps.connectorDeps.correlationId;
  const summaries: CollectionJobSummary[] = [];

  for (const job of collectionJobs) {
    try {
      const outcome = await runRecordedConnector(
        deps.store,
        job.connector,
        job.target,
        deps.connectorDeps,
      );

      const offers: CollectedOffer[] = outcome.jobs.map((raw) => ({
        sourceJobId: raw.sourceJobId,
        url: raw.url,
        title: raw.title,
        locationLabel: raw.locationLabel,
        descriptionHtml: raw.descriptionHtml,
        publishedAt: raw.publishedAt,
        companyName: job.companyName,
        commitmentLabel: null,
        sourceName: job.connector.name,
      }));

      const counts = await decideAndPersist(offers, job.sourcePriority, deps, correlationId);

      await deps.store.recordDecisionCounts(outcome.runId, {
        jobsAccepted: counts.accepted,
        jobsQuarantined: counts.quarantined,
        jobsRejected: counts.rejected,
      });

      summaries.push({
        connectorName: job.connector.name,
        companyName: job.companyName,
        discovered: offers.length,
        accepted: counts.accepted,
        quarantined: counts.quarantined,
        rejected: counts.rejected,
        failed: false,
        failureReason: null,
      });
    } catch (error) {
      // La collecte a échoué (réseau, refus du registre, forme inattendue).
      // `runRecordedConnector` a déjà tracé l'erreur ; on n'arrête pas les
      // autres sources.
      const reason =
        error instanceof CollectionRefusedError
          ? error.detail
          : error instanceof Error
            ? error.message
            : "Erreur inconnue.";

      summaries.push({
        connectorName: job.connector.name,
        companyName: job.companyName,
        discovered: 0,
        accepted: 0,
        quarantined: 0,
        rejected: 0,
        failed: true,
        failureReason: reason,
      });
    }
  }

  return {
    correlationId,
    jobs: summaries,
    totalAccepted: summaries.reduce((sum, item) => sum + item.accepted, 0),
    totalQuarantined: summaries.reduce((sum, item) => sum + item.quarantined, 0),
    totalRejected: summaries.reduce((sum, item) => sum + item.rejected, 0),
  };
};

/**
 * Relie la décision d'ingestion et l'écriture en base en une persistance que
 * l'orchestrateur peut appeler sans connaître le détail des deux.
 */
export const createIngestionPersistence = (
  prisma: Parameters<typeof persistDecision>[0],
  now: () => Date,
): CollectionPersistence => ({
  persist: async (offer, context) => {
    const decision = decideIngestion(offer, now());
    const result = await persistDecision(prisma, decision, context);

    if (result.kind === "created" || result.kind === "updated") {
      return decision.outcome === "QUARANTINED" ? "quarantined" : result.kind;
    }

    return "rejected";
  },
});
