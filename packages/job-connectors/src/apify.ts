import { AtsKind } from "@findit/database";
import { z } from "zod";

import type { CollectionContext, JobSourceConnector, RawJob, SearchTarget } from "./connector.js";
import type { CollectionPermit } from "./permit.js";
import type { ActorPricing } from "./spend-budget.js";
import {
  assertBoundedMaxItems,
  microUsdToUsd,
  usdToMicroUsd,
  worstCaseRunCostMicroUsd,
} from "./spend-budget.js";

const API = "https://api.apify.com/v2";

/**
 * Entre deux requêtes vers l'API d'Apify : c'est aussi le rythme du sondage de
 * l'état d'un run, puisque chaque sondage passe par le client cadencé.
 */
export const APIFY_REQUEST_INTERVAL_MS = 2000;

/** 150 sondages à 2 s : un run qui dure plus de 5 minutes est abandonné. */
const DEFAULT_MAX_POLLS = 150;

const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

export class ApifyShapeError extends Error {
  override readonly name = "ApifyShapeError";

  constructor(detail: string) {
    super(`La réponse d'Apify n'a pas la forme attendue : ${detail}`);
  }
}

export class ApifyRunError extends Error {
  override readonly name = "ApifyRunError";

  constructor(
    readonly actorId: string,
    readonly status: string,
    detail: string | null,
  ) {
    super(
      `Le run de l'acteur « ${actorId} » s'est terminé en ${status}${detail === null ? "" : ` : ${detail}`}.`,
    );
  }
}

/**
 * Un élément du jeu de données que le correspondant d'un acteur ne sait pas
 * lire. C'est le seul type d'erreur que `mapItem` doit lever : il dit « cet
 * élément est inexploitable », ce qui n'est pas la panne de tout le run.
 */
export class ApifyItemError extends Error {
  override readonly name = "ApifyItemError";
}

const runSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    status: z.string(),
    defaultDatasetId: z.string().min(1),
    statusMessage: z.string().nullish(),
    usageTotalUsd: z.number().nullish(),
    chargedEventCounts: z.record(z.string(), z.number()).nullish(),
  }),
});

const issuesOf = (error: z.ZodError): string =>
  error.issues.map((issue) => `${issue.path.join(".")} : ${issue.message}`).join(" ; ");

export interface ApifyConnectorConfig {
  /** Doit correspondre à `Connector.name` en base. */
  readonly name: string;
  /** Identifiant de l'acteur, épinglé au registre : « auteur/nom ». */
  readonly actorId: string;
  /** Jeton du compte Apify. Lu côté serveur, jamais journalisé ni mis dans une URL. */
  readonly token: string;
  readonly pricing: ActorPricing;
  /**
   * Prix de chaque événement facturable, en micro-dollars, sous le nom que
   * l'API rend dans `chargedEventCounts`. Un événement absent de cette table
   * est un prix inconnu : le coût retenu est alors le pire estimé.
   */
  readonly eventPricesMicroUsd: Readonly<Record<string, number>>;
  /** Plafond de résultats de ce run. Obligatoire, voir `assertBoundedMaxItems`. */
  readonly maxItems: number;
  /** Maximum que le code autorise pour cette source, quoi que dise la configuration. */
  readonly maxItemsCeiling: number;
  /**
   * Résultats supplémentaires qu'un acteur peut rendre au-delà de son propre
   * plafond, avant de s'arrêter. Certains acteurs gardent la dernière page
   * entière même quand elle dépasse le plafond demandé : ce dépassement est
   * facturé, donc la charge maximale et l'estimation doivent le couvrir pour ne
   * pas faire avorter le run. `limit` reste borné à `maxItems`.
   */
  readonly resultOvershoot?: number;
  /** Entrée de l'acteur, bornée : elle doit reprendre `maxItems` sous le nom que l'acteur lit. */
  readonly buildInput: (
    target: SearchTarget,
    maxItems: number,
  ) => Readonly<Record<string, unknown>>;
  /** Traduit un élément du jeu de données en offre brute, ou lève `ApifyItemError`. */
  readonly mapItem: (item: unknown) => RawJob;
  readonly maxPolls?: number;
}

/**
 * Une source de job board lue par un acteur Apify, derrière le contrat commun
 * des connecteurs. Le registre autorise la source ; la garde de budget autorise
 * la dépense (la présence de `estimateCostMicroUsd` la rend obligatoire) ;
 * l'acteur, lui, ne fait que lire des pages publiques.
 *
 * Trois protections se cumulent contre une facture qui dérape : le plafond de
 * résultats est exigé à la construction, `maxTotalChargeUsd` coupe le run côté
 * Apify au coût maximal estimé, et la garde de budget refuse le run avant même
 * son départ.
 */
export const createApifyConnector = (
  config: ApifyConnectorConfig,
): JobSourceConnector<SearchTarget> => {
  const maxItems = assertBoundedMaxItems(config.maxItems, config.maxItemsCeiling);
  const resultOvershoot = config.resultOvershoot ?? 0;
  const worstCase = worstCaseRunCostMicroUsd(config.pricing, maxItems + resultOvershoot);
  const maxPolls = config.maxPolls ?? DEFAULT_MAX_POLLS;
  const actorPath = config.actorId.replace("/", "~");
  const headers = {
    authorization: `Bearer ${config.token}`,
    "content-type": "application/json",
  };

  /** Coût à retenir pour un run terminé : le plus élevé de ce que disent les deux sources. */
  const costOf = (run: z.infer<typeof runSchema>["data"], context: CollectionContext): number => {
    const usage = usdToMicroUsd(run.usageTotalUsd ?? 0);
    const counts = run.chargedEventCounts;

    if (counts === null || counts === undefined) {
      if (usage === 0) {
        context.reportNotice(
          "CostUnknown",
          "Apify n'a rendu ni événements facturés ni usage : le coût maximal estimé est retenu.",
        );
        return worstCase;
      }

      return usage;
    }

    let fromEvents = 0;
    for (const [event, count] of Object.entries(counts)) {
      const price = config.eventPricesMicroUsd[event];
      if (price === undefined) {
        context.reportNotice(
          "CostUnknown",
          `L'événement facturé « ${event} » n'a pas de prix connu : le coût maximal estimé est retenu.`,
        );
        return Math.max(worstCase, usage);
      }
      fromEvents += count * price;
    }

    return Math.max(fromEvents, usage);
  };

  const collect = async (
    _permit: CollectionPermit,
    target: SearchTarget,
    context: CollectionContext,
  ): Promise<readonly RawJob[]> => {
    // 1. Départ du run. Le plafond de facturation de ce run est le pire coût
    //    estimé : Apify l'arrête de lui-même s'il l'atteint.
    const startUrl = `${API}/acts/${actorPath}/runs?maxTotalChargeUsd=${String(microUsdToUsd(worstCase))}`;
    const started = runSchema.safeParse(
      await context.fetchJson(startUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(config.buildInput(target, maxItems)),
      }),
    );
    if (!started.success) {
      throw new ApifyShapeError(`le départ du run est inexploitable (${issuesOf(started.error)}).`);
    }

    // Le run est parti : les frais de démarrage sont dus, même si la suite casse.
    context.reportCostMicroUsd(config.pricing.startMicroUsd);

    // 2. Attente. Chaque sondage passe par le client cadencé, donc tient la cadence.
    let run = started.data.data;
    for (let poll = 0; !TERMINAL_STATUSES.has(run.status); poll += 1) {
      if (poll >= maxPolls) {
        await context.fetchJson(`${API}/actor-runs/${run.id}/abort`, { method: "POST", headers });
        // Le run a pu consommer jusqu'au plafond avant l'arrêt : le pire est retenu.
        context.reportCostMicroUsd(worstCase);
        throw new ApifyRunError(
          config.actorId,
          "TIMED-OUT",
          `abandonné après ${String(maxPolls)} sondages, run arrêté`,
        );
      }

      const polled = runSchema.safeParse(
        await context.fetchJson(`${API}/actor-runs/${run.id}`, { headers }),
      );
      if (!polled.success) {
        throw new ApifyShapeError(`l'état du run est inexploitable (${issuesOf(polled.error)}).`);
      }
      run = polled.data.data;
    }

    // 3. Le coût réel remplace l'estimation, que le run ait réussi ou non. Les
    //    compteurs d'événements facturés ne sont pas à jour au premier instant
    //    où le statut devient terminal (constaté sur un run réel : 0,00005 $
    //    lus pour 0,00405 $ facturés) : une relecture finale les laisse se
    //    stabiliser avant de consigner quoi que ce soit.
    const final = runSchema.safeParse(
      await context.fetchJson(`${API}/actor-runs/${run.id}`, { headers }),
    );
    if (!final.success) {
      throw new ApifyShapeError(
        `la relecture finale du run est inexploitable (${issuesOf(final.error)}).`,
      );
    }
    run = final.data.data;

    let cost = costOf(run, context);
    context.reportCostMicroUsd(cost);

    if (run.status !== "SUCCEEDED") {
      throw new ApifyRunError(config.actorId, run.status, run.statusMessage ?? null);
    }

    // 4. Résultats. `limit` rejoue le plafond : un acteur qui déborderait ne
    //    ramène pas plus que ce qu'on a prévu de payer.
    const itemsUrl = `${API}/datasets/${run.defaultDatasetId}/items?format=json&clean=true&limit=${String(maxItems)}`;
    const items: unknown = await context.fetchJson(itemsUrl, { headers });
    if (!Array.isArray(items)) {
      throw new ApifyShapeError("le jeu de données n'est pas une liste.");
    }

    // Plancher de coût : chaque résultat reçu a été facturé au tarif de la
    // fiche. Même si Apify tarde à publier ses compteurs, on ne consigne jamais
    // moins que ce que les résultats réellement reçus ont coûté.
    cost = Math.max(
      cost,
      config.pricing.startMicroUsd +
        items.length * (config.pricing.perResultMicroUsd + (config.pricing.perDetailMicroUsd ?? 0)),
    );
    context.reportCostMicroUsd(cost);

    // 5. Traduction. Un élément illisible est écarté et signalé ; si tous le
    //    sont, l'acteur a changé de forme et le run échoue plutôt que de
    //    passer pour une collecte vide.
    const jobs: RawJob[] = [];
    let dropped = 0;
    let firstDropped: string | null = null;
    for (const item of items as readonly unknown[]) {
      try {
        jobs.push(config.mapItem(item));
      } catch (error) {
        if (!(error instanceof ApifyItemError)) {
          throw error;
        }
        dropped += 1;
        firstDropped ??= error.message;
      }
    }

    if (items.length > 0 && jobs.length === 0) {
      throw new ApifyShapeError(
        `aucun des ${String(items.length)} éléments n'est exploitable (premier motif : ${firstDropped ?? "inconnu"}).`,
      );
    }

    if (dropped > 0) {
      context.reportNotice(
        "ItemsDropped",
        `${String(dropped)} élément(s) sur ${String(items.length)} écartés (premier motif : ${firstDropped ?? "inconnu"}).`,
      );
    }

    return jobs;
  };

  return {
    name: config.name,
    atsKind: AtsKind.JOB_BOARD,
    minRequestIntervalMs: APIFY_REQUEST_INTERVAL_MS,
    estimateCostMicroUsd: () => worstCase,
    collect,
  };
};
