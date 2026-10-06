/**
 * Cascade de récupération du cahier des charges, section 4.7.
 *
 * Une page ou une extraction qui échoue ne s'abandonne pas au premier essai :
 * les stratégies sont tentées dans l'ordre, chacune avec un nombre de
 * tentatives borné, et l'abandon n'intervient qu'après épuisement. Seul un
 * **échec** est relancé : une stratégie qui a tourné jusqu'au bout sans rien
 * trouver a rendu son verdict, la relancer ne ferait que payer deux fois la
 * même réponse. Le moteur est volontairement petit et générique : il enchaîne
 * des étapes, il ne les connaît pas.
 *
 * Deux garanties non négociables :
 *
 * 1. **Aucune exception ne remonte.** Une étape qui lève est un fait consigné
 *    dans les tentatives, pas une raison d'arrêter le run : c'est précisément
 *    le cas que la cascade doit rattraper.
 * 2. **Aucune boucle sans borne.** `maxAttemptsPerStep` borne chaque étape et
 *    `maxTotalAttempts` borne le total, y compris si un appelant enchaîne
 *    plusieurs cascades.
 */

/** Les étapes du cascade telles qu'elles sont nommées dans les journaux. */
export const RECOVERY_STRATEGY = {
  /** Étape 1 du CDC : lecture HTTP classique. */
  HTTP: "http",
  /** Étape 2 du CDC : lecture par navigateur headless. */
  BROWSER: "browser",
  /**
   * Étape 3 du CDC : extraction spécialisée, sans modèle (par exemple les
   * données structurées `schema.org JobPosting`).
   */
  SPECIALIZED: "specialized",
  /** Étape 4 du CDC : extraction par le modèle. */
  LLM: "llm",
  /**
   * Relecture d'une page revenue vide. La fonction injectée refait la lecture :
   * le crawler y applique HTTP puis navigateur, `robots.txt` compris.
   */
  READ: "read",
} as const;

export type RecoveryStrategy = (typeof RECOVERY_STRATEGY)[keyof typeof RECOVERY_STRATEGY];

/**
 * Issue d'une tentative :
 * - `value` : la stratégie a rendu une donnée exploitable ;
 * - `empty` : elle a tourné jusqu'au bout et n'a rien trouvé — c'est un fait
 *   normal, pas une erreur, et il ne faut pas le confondre avec un échec ;
 * - `error` : elle a levé.
 */
export type RecoveryAttemptOutcome = "value" | "empty" | "error";

export interface RecoveryAttempt {
  readonly strategy: RecoveryStrategy;
  /** Numéro de la tentative pour cette stratégie, à partir de 1. */
  readonly attempt: number;
  readonly outcome: RecoveryAttemptOutcome;
  readonly error?: string;
}

export interface RecoveryStep<T> {
  readonly strategy: RecoveryStrategy;
  /** Nombre maximal de tentatives **en cas d'échec**. Défaut : `maxAttemptsPerStep`. */
  readonly maxAttempts?: number;
  /**
   * Tente l'étape. Rend la donnée quand elle est exploitable, `null` quand
   * l'étape a tourné sans rien trouver, et lève en cas d'échec.
   */
  readonly run: () => Promise<T | null>;
}

export interface RecoveryOptions {
  /** Nombre de tentatives par étape. Défaut : 2. */
  readonly maxAttemptsPerStep?: number;
  /** Plafond de tentatives toutes étapes confondues. Défaut : 6. */
  readonly maxTotalAttempts?: number;
  /** Observateur appelé après chaque tentative, pour journaliser. */
  readonly onAttempt?: (attempt: RecoveryAttempt) => Promise<void> | void;
}

/** Issue trouvée : une stratégie a rendu une donnée exploitable. */
export interface RecoverySuccess<T> {
  readonly found: true;
  readonly value: T;
  readonly strategy: RecoveryStrategy;
  readonly attempts: readonly RecoveryAttempt[];
}

/**
 * Issue vide : aucune stratégie n'a rendu de donnée. `attempts` distingue
 * l'échec (`error`) de l'absence (`empty`) — c'est à l'appelant de décider si
 * l'absence vaut une erreur.
 */
export interface RecoveryExhausted {
  readonly found: false;
  readonly attempts: readonly RecoveryAttempt[];
}

export type RecoveryOutcome<T> = RecoverySuccess<T> | RecoveryExhausted;

const DEFAULT_MAX_ATTEMPTS_PER_STEP = 2;
const DEFAULT_MAX_TOTAL_ATTEMPTS = 6;

/** Rend le message d'une erreur inconnue, sans jamais inventer de détail. */
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Erreur inconnue.";

/**
 * Déroule les étapes dans l'ordre, avec des tentatives bornées, et rend la
 * première donnée exploitable. Rend `found: false` quand tout a été épuisé.
 */
export const runRecovery = async <T>(
  steps: readonly RecoveryStep<T>[],
  options: RecoveryOptions = {},
): Promise<RecoveryOutcome<T>> => {
  const maxPerStep = options.maxAttemptsPerStep ?? DEFAULT_MAX_ATTEMPTS_PER_STEP;
  const maxTotal = options.maxTotalAttempts ?? DEFAULT_MAX_TOTAL_ATTEMPTS;
  const attempts: RecoveryAttempt[] = [];

  for (const step of steps) {
    const limit = step.maxAttempts ?? maxPerStep;

    for (let attempt = 1; attempt <= limit; attempt += 1) {
      if (attempts.length >= maxTotal) {
        return { found: false, attempts };
      }

      let value: T | null = null;
      let failure: string | undefined;
      try {
        value = await step.run();
      } catch (error) {
        failure = errorMessage(error);
      }

      const record: RecoveryAttempt =
        failure !== undefined
          ? { strategy: step.strategy, attempt, outcome: "error", error: failure }
          : { strategy: step.strategy, attempt, outcome: value !== null ? "value" : "empty" };
      attempts.push(record);

      if (options.onAttempt !== undefined) {
        await options.onAttempt(record);
      }

      if (value !== null) {
        return { found: true, value, strategy: step.strategy, attempts };
      }

      // Une étape qui a tourné sans rien trouver a rendu son verdict : on passe
      // à la stratégie suivante, sans relancer la même question.
      if (record.outcome === "empty") {
        break;
      }
    }
  }

  return { found: false, attempts };
};
