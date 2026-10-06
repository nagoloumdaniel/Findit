import { describe, expect, it } from "vitest";

import type { ActorPricing, SpendLedger } from "./spend-budget.js";
import {
  UnboundedRunError,
  assertBoundedMaxItems,
  createCycleBudget,
  usdToMicroUsd,
  worstCaseRunCostMicroUsd,
} from "./spend-budget.js";

const now = new Date("2026-10-06T06:00:00.000Z");

/** Registre fictif des dépenses du mois : une doublure de test, pas la base. */
const fakeLedger = (monthToDate: number): SpendLedger & { spent: number } => {
  const ledger = {
    spent: monthToDate,
    monthToDateMicroUsd: () => Promise.resolve(ledger.spent),
  };
  return ledger;
};

const budget = {
  monthlyMicroUsd: usdToMicroUsd(4.5),
  cycleMicroUsd: usdToMicroUsd(0.15),
};

describe("usdToMicroUsd", () => {
  it("converts to whole micro-dollars without float drift", () => {
    expect(usdToMicroUsd(0.0005)).toBe(500);
    expect(usdToMicroUsd(4.5)).toBe(4_500_000);
    expect(usdToMicroUsd(0.1 + 0.2)).toBe(300_000);
  });
});

describe("worstCaseRunCostMicroUsd", () => {
  const wttj: ActorPricing = {
    startMicroUsd: usdToMicroUsd(0.00005),
    perResultMicroUsd: usdToMicroUsd(0.0003),
    perDetailMicroUsd: usdToMicroUsd(0.0005),
  };

  it("counts the start fee and every result with its detail", () => {
    // 50 + 30 x (300 + 500) = 24 050 micro-dollars, soit 0,02405 $.
    expect(worstCaseRunCostMicroUsd(wttj, 30)).toBe(24_050);
  });

  it("works without a per-detail supplement", () => {
    const indeed: ActorPricing = { startMicroUsd: 100, perResultMicroUsd: 100 };
    expect(worstCaseRunCostMicroUsd(indeed, 100)).toBe(10_100);
  });
});

describe("assertBoundedMaxItems", () => {
  it("accepts a positive integer within the ceiling", () => {
    expect(assertBoundedMaxItems(30, 100)).toBe(30);
    expect(assertBoundedMaxItems(100, 100)).toBe(100);
  });

  it("refuses a missing, zero, negative or fractional cap", () => {
    for (const value of [undefined, 0, -5, 2.5, Number.NaN]) {
      expect(() => assertBoundedMaxItems(value, 100)).toThrow(UnboundedRunError);
    }
  });

  it("refuses a cap above the ceiling of the source", () => {
    expect(() => assertBoundedMaxItems(101, 100)).toThrow(/dépasse le maximum/);
  });
});

describe("createCycleBudget", () => {
  it("authorizes a run that fits both caps", async () => {
    const cycle = createCycleBudget(budget, fakeLedger(0));

    const decision = await cycle.authorize("wttj", 24_050, now);

    expect(decision.allowed).toBe(true);
    expect(cycle.spentThisCycleMicroUsd()).toBe(24_050);
  });

  it("refuses a run that would overflow the cycle cap, and keeps the earlier ones", async () => {
    const cycle = createCycleBudget(budget, fakeLedger(0));
    await cycle.authorize("hellowork", 100_000, now);

    const decision = await cycle.authorize("linkedin", 60_000, now);

    expect(decision).toMatchObject({ allowed: false, reason: "CYCLE_BUDGET_EXCEEDED" });
    expect(cycle.spentThisCycleMicroUsd()).toBe(100_000);
  });

  it("refuses a run that would overflow the month even if the cycle has room", async () => {
    const cycle = createCycleBudget(budget, fakeLedger(usdToMicroUsd(4.45)));

    const decision = await cycle.authorize("indeed", 100_000, now);

    expect(decision).toMatchObject({ allowed: false, reason: "MONTH_BUDGET_EXCEEDED" });
  });

  it("refuses everything when the monthly budget is zero", async () => {
    const cycle = createCycleBudget({ monthlyMicroUsd: 0, cycleMicroUsd: 150_000 }, fakeLedger(0));

    expect(await cycle.authorize("indeed", 10_100, now)).toMatchObject({
      allowed: false,
      reason: "MONTH_BUDGET_EXCEEDED",
    });
  });

  it("frees the unused part of the reservation when the real cost is lower", async () => {
    const cycle = createCycleBudget(budget, fakeLedger(0));
    const first = await cycle.authorize("linkedin", 100_000, now);
    if (!first.allowed) throw new Error("attendu : autorisé");

    first.ticket.settle(20_000);

    expect(cycle.spentThisCycleMicroUsd()).toBe(20_000);
    expect((await cycle.authorize("hellowork", 100_000, now)).allowed).toBe(true);
  });

  it("keeps the worst case counted when a failed run does not know its cost", async () => {
    const cycle = createCycleBudget(budget, fakeLedger(0));
    const first = await cycle.authorize("linkedin", 100_000, now);
    if (!first.allowed) throw new Error("attendu : autorisé");

    first.ticket.settle();

    expect(cycle.spentThisCycleMicroUsd()).toBe(100_000);
  });

  it("ignores a second settle of the same ticket", async () => {
    const cycle = createCycleBudget(budget, fakeLedger(0));
    const first = await cycle.authorize("linkedin", 100_000, now);
    if (!first.allowed) throw new Error("attendu : autorisé");

    first.ticket.settle(20_000);
    first.ticket.settle(90_000);

    expect(cycle.spentThisCycleMicroUsd()).toBe(20_000);
  });

  it("counts an open run against the month, then reads it from the ledger once recorded", async () => {
    const ledger = fakeLedger(usdToMicroUsd(4.37));
    const cycle = createCycleBudget(budget, ledger);
    const open = await cycle.authorize("hellowork", 120_000, now);
    if (!open.allowed) throw new Error("attendu : autorisé");

    // Run encore ouvert, donc pas au registre : 4,37 + 0,12 + 0,02 dépasse 4,50,
    // alors que 4,37 + 0,02 seul passerait. Le cycle (0,14 sur 0,15) a de la place.
    expect(await cycle.authorize("indeed", 20_000, now)).toMatchObject({
      allowed: false,
      reason: "MONTH_BUDGET_EXCEEDED",
    });

    // Le coût réel est consigné au registre, puis le billet est clos.
    ledger.spent += 95_000;
    open.ticket.settle(95_000);

    // Mois : 4,465 + 0,02 = 4,485, sous le plafond ; cycle : 0,095 + 0,02 = 0,115.
    expect((await cycle.authorize("indeed", 20_000, now)).allowed).toBe(true);
  });
});
