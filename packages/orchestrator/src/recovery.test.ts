import { describe, expect, it, vi } from "vitest";

import { RECOVERY_STRATEGY, runRecovery } from "./recovery.js";
import type { RecoveryAttempt, RecoveryStep } from "./recovery.js";

/** Une étape qui rend une valeur exploitable. */
const valueStep = (
  strategy: RecoveryStep<string>["strategy"],
  value: string,
): RecoveryStep<string> => ({
  strategy,
  run: () => Promise.resolve(value),
});

/** Une étape qui tourne sans rien trouver. */
const emptyStep = (strategy: RecoveryStep<string>["strategy"]): RecoveryStep<string> => ({
  strategy,
  run: () => Promise.resolve(null),
});

/** Une étape qui échoue toujours. */
const failingStep = (
  strategy: RecoveryStep<string>["strategy"],
  message = "échec simulé",
): RecoveryStep<string> => ({
  strategy,
  run: () => Promise.reject(new Error(message)),
});

describe("runRecovery", () => {
  it("rend la valeur de la première stratégie qui aboutit, sans tenter les suivantes", async () => {
    const after = vi.fn(() => Promise.resolve("jamais"));
    const outcome = await runRecovery<string>([
      valueStep(RECOVERY_STRATEGY.SPECIALIZED, "données structurées"),
      { strategy: RECOVERY_STRATEGY.LLM, run: after },
    ]);

    expect(outcome).toMatchObject({
      found: true,
      value: "données structurées",
      strategy: "specialized",
    });
    expect(after).not.toHaveBeenCalled();
  });

  it("escalade vers la stratégie suivante quand la précédente ne trouve rien", async () => {
    const outcome = await runRecovery<string>([
      emptyStep(RECOVERY_STRATEGY.SPECIALIZED),
      valueStep(RECOVERY_STRATEGY.LLM, "trouvé par le modèle"),
    ]);

    expect(outcome.found).toBe(true);
    if (outcome.found) {
      expect(outcome.strategy).toBe("llm");
    }
    expect(outcome.attempts.map((attempt) => attempt.outcome)).toEqual(["empty", "value"]);
  });

  it("relance une étape en échec avant de passer à la suivante", async () => {
    const run = vi.fn(() => Promise.resolve());
    let calls = 0;
    const flaky: RecoveryStep<string> = {
      strategy: RECOVERY_STRATEGY.LLM,
      run: () => {
        calls += 1;
        void run();
        return calls === 1 ? Promise.reject(new Error("panne transitoire")) : Promise.resolve("ok");
      },
    };

    const outcome = await runRecovery<string>([flaky], { maxAttemptsPerStep: 2 });

    expect(outcome).toMatchObject({ found: true, value: "ok", strategy: "llm" });
    expect(run).toHaveBeenCalledTimes(2);
    expect(outcome.attempts[0]).toMatchObject({ outcome: "error", error: "panne transitoire" });
    expect(outcome.attempts[1]).toMatchObject({ outcome: "value" });
  });

  it("épuise le nombre de tentatives de l'étape puis passe à la suivante", async () => {
    const outcome = await runRecovery<string>(
      [
        failingStep(RECOVERY_STRATEGY.SPECIALIZED, "parse impossible"),
        valueStep(RECOVERY_STRATEGY.LLM, "secours"),
      ],
      { maxAttemptsPerStep: 3 },
    );

    expect(outcome).toMatchObject({ found: true, value: "secours" });
    expect(
      outcome.attempts.filter((attempt) => attempt.strategy === RECOVERY_STRATEGY.SPECIALIZED),
    ).toHaveLength(3);
  });

  it("rend found:false en distinguant l'absence de l'échec", async () => {
    const outcome = await runRecovery<string>([
      emptyStep(RECOVERY_STRATEGY.SPECIALIZED),
      failingStep(RECOVERY_STRATEGY.LLM),
    ]);

    expect(outcome.found).toBe(false);
    expect(outcome.attempts.map((attempt) => attempt.outcome)).toEqual(["empty", "error", "error"]);
    expect(outcome.attempts[1]?.error).toBe("échec simulé");
  });

  it("ne lève jamais : une étape qui échoue est un fait consigné", async () => {
    await expect(runRecovery<string>([failingStep(RECOVERY_STRATEGY.LLM)])).resolves.toMatchObject({
      found: false,
    });
  });

  it("respecte le plafond global de tentatives", async () => {
    const outcome = await runRecovery<string>(
      [
        failingStep(RECOVERY_STRATEGY.HTTP),
        failingStep(RECOVERY_STRATEGY.BROWSER),
        failingStep(RECOVERY_STRATEGY.LLM),
      ],
      { maxAttemptsPerStep: 5, maxTotalAttempts: 3 },
    );

    expect(outcome.found).toBe(false);
    expect(outcome.attempts).toHaveLength(3);
  });

  it("appelle l'observateur après chaque tentative", async () => {
    const seen: RecoveryAttempt[] = [];
    await runRecovery<string>(
      [emptyStep(RECOVERY_STRATEGY.SPECIALIZED), failingStep(RECOVERY_STRATEGY.LLM)],
      { onAttempt: (attempt) => void seen.push(attempt) },
    );

    expect(seen.map((attempt) => `${attempt.strategy}:${attempt.outcome}`)).toEqual([
      "specialized:empty",
      "llm:error",
      "llm:error",
    ]);
  });
});
