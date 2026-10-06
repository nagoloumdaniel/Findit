/**
 * Suivi de l'usage du modèle.
 *
 * Le POURQUOI : le CDC (section 12) demande un suivi des tokens et un coût
 * estimé. L'API rend ces compteurs à chaque appel (`usage.input_tokens`,
 * `usage.output_tokens`) ; s'ils ne sont pas lus au passage, l'information est
 * perdue et le coût reste à zéro.
 *
 * Le tarif, lui, n'est pas déduit : il dépend du compte et du modèle. Il est
 * fourni par l'appelant, jamais inventé ici.
 */

/** Tokens consommés, cumulés sur la vie du client. */
export interface ModelUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Nombre d'appels facturés, y compris ceux dont la sortie a été refusée. */
  readonly calls: number;
}

/** Tarif public du modèle, en dollars par million de tokens. */
export interface ModelPricing {
  readonly inputUsdPerMillionTokens: number;
  readonly outputUsdPerMillionTokens: number;
}

/**
 * Coût d'un usage en micro-dollars (1 USD = 1 000 000 micro-dollars).
 *
 * Un token coûte `prix / 1 000 000` dollar, donc `prix` micro-dollars : le
 * calcul se réduit à `tokens × prix`. Arrondi au micro-dollar, l'unité stockée
 * en base.
 */
export const computeCostMicroUsd = (usage: ModelUsage, pricing: ModelPricing): number =>
  Math.round(
    usage.inputTokens * pricing.inputUsdPerMillionTokens +
      usage.outputTokens * pricing.outputUsdPerMillionTokens,
  );

/** L'usage d'un client neuf : rien consommé. */
export const EMPTY_USAGE: ModelUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };
