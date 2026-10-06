/**
 * Plafond de dépense des sources payantes (acteurs Apify).
 *
 * Les montants circulent en micro-dollars entiers : 5 $ valent 5 000 000. Un
 * entier n'accumule aucune erreur d'arrondi quand on additionne des milliers de
 * petits coûts, et il tient dans un `Int` PostgreSQL (jusqu'à environ 2 100 $).
 *
 * Deux plafonds se cumulent. Le mois protège le compte (plan gratuit : 5 $ de
 * crédit) ; le cycle empêche une seule collecte d'en avaler la moitié. Un
 * dépassement arrête la source concernée, jamais le cycle : les autres sources
 * continuent.
 */

export const MICRO_USD_PER_USD = 1_000_000;

export const usdToMicroUsd = (usd: number): number => Math.round(usd * MICRO_USD_PER_USD);

export const microUsdToUsd = (microUsd: number): number => microUsd / MICRO_USD_PER_USD;

/** Tarif d'un acteur au paiement à l'événement, tel que lu sur sa fiche. */
export interface ActorPricing {
  /** Frais de démarrage d'un run. */
  readonly startMicroUsd: number;
  /** Un résultat écrit dans le jeu de données. */
  readonly perResultMicroUsd: number;
  /** Supplément par résultat quand le détail de l'offre est demandé. */
  readonly perDetailMicroUsd?: number;
}

/**
 * Un run sans plafond de résultats peut coûter n'importe quoi : il est refusé
 * avant tout appel. Le plafond est un entier strictement positif, et ne dépasse
 * pas le maximum que le code autorise pour la source.
 */
export class UnboundedRunError extends Error {
  override readonly name = "UnboundedRunError";

  constructor(detail: string) {
    super(`Run refusé : ${detail}`);
  }
}

export const assertBoundedMaxItems = (maxItems: number | undefined, ceiling: number): number => {
  if (maxItems === undefined || !Number.isInteger(maxItems) || maxItems < 1) {
    throw new UnboundedRunError(
      "un plafond de résultats (entier supérieur à zéro) est obligatoire pour chaque appel d'acteur.",
    );
  }

  if (maxItems > ceiling) {
    throw new UnboundedRunError(
      `le plafond demandé (${String(maxItems)}) dépasse le maximum autorisé pour cette source (${String(ceiling)}).`,
    );
  }

  return maxItems;
};

/**
 * Coût maximal d'un run : démarrage plus chaque résultat, détail compris. Le
 * coût réel est au plus égal à cette valeur, ce qui en fait la bonne mesure
 * pour décider si le run a le droit de partir.
 */
export const worstCaseRunCostMicroUsd = (pricing: ActorPricing, maxItems: number): number =>
  pricing.startMicroUsd + maxItems * (pricing.perResultMicroUsd + (pricing.perDetailMicroUsd ?? 0));

export interface BudgetConfig {
  readonly monthlyMicroUsd: number;
  readonly cycleMicroUsd: number;
}

/** Ce que le registre des exécutions sait déjà avoir été dépensé ce mois-ci. */
export interface SpendLedger {
  monthToDateMicroUsd(now: Date): Promise<number>;
}

export type BudgetRefusalReason = "CYCLE_BUDGET_EXCEEDED" | "MONTH_BUDGET_EXCEEDED";

export interface BudgetTicket {
  /**
   * Clôt la réservation avec le coût réel. Sans argument, le coût maximal
   * estimé reste compté : un run en échec dont on ignore le coût est supposé
   * avoir coûté le pire, jamais zéro.
   */
  settle(actualMicroUsd?: number): void;
}

export type BudgetDecision =
  | { readonly allowed: true; readonly ticket: BudgetTicket }
  | {
      readonly allowed: false;
      readonly reason: BudgetRefusalReason;
      readonly detail: string;
    };

export interface CycleBudget {
  authorize(sourceName: string, estimatedMicroUsd: number, now: Date): Promise<BudgetDecision>;
  /** Total engagé dans ce cycle : réel pour les runs clos, estimé pour les autres. */
  spentThisCycleMicroUsd(): number;
}

const dollars = (microUsd: number): string => `${microUsdToUsd(microUsd).toFixed(4)} $`;

/**
 * Budget d'un cycle de collecte. L'état du cycle vit en mémoire (le cycle est
 * séquentiel) ; le cumul du mois est relu dans le registre des exécutions à
 * chaque demande, de sorte qu'un redémarrage du worker ne remet jamais le
 * compteur du mois à zéro.
 */
export const createCycleBudget = (config: BudgetConfig, ledger: SpendLedger): CycleBudget => {
  /** Engagé dans ce cycle : réel pour les runs clos, estimé pour les runs ouverts. */
  let committed = 0;
  /** Estimations des runs encore ouverts : pas encore consignés au registre. */
  let openEstimates = 0;

  return {
    authorize: async (sourceName, estimatedMicroUsd, now) => {
      const monthSpent = await ledger.monthToDateMicroUsd(now);

      if (committed + estimatedMicroUsd > config.cycleMicroUsd) {
        return {
          allowed: false,
          reason: "CYCLE_BUDGET_EXCEEDED",
          detail: `« ${sourceName} » est estimé à ${dollars(estimatedMicroUsd)} au pire ; il reste ${dollars(Math.max(0, config.cycleMicroUsd - committed))} sur le plafond du cycle (${dollars(config.cycleMicroUsd)}).`,
        };
      }

      // Les runs clos de ce cycle sont déjà dans `monthSpent` (l'appelant
      // consigne le coût au registre AVANT de clore son billet) : seuls les runs
      // encore ouverts s'y ajoutent, par leur estimation.
      if (monthSpent + openEstimates + estimatedMicroUsd > config.monthlyMicroUsd) {
        return {
          allowed: false,
          reason: "MONTH_BUDGET_EXCEEDED",
          detail: `« ${sourceName} » est estimé à ${dollars(estimatedMicroUsd)} au pire ; ${dollars(monthSpent)} sont déjà dépensés ce mois-ci sur un plafond de ${dollars(config.monthlyMicroUsd)}.`,
        };
      }

      committed += estimatedMicroUsd;
      openEstimates += estimatedMicroUsd;
      let settled = false;

      return {
        allowed: true,
        ticket: {
          settle: (actualMicroUsd) => {
            if (settled) {
              return;
            }
            settled = true;
            openEstimates -= estimatedMicroUsd;

            if (actualMicroUsd !== undefined) {
              committed += actualMicroUsd - estimatedMicroUsd;
            }
          },
        },
      };
    },

    spentThisCycleMicroUsd: () => committed,
  };
};
