import type { PrismaClient } from "@findit/database";
import { describe, expect, it } from "vitest";

import { createAgentRunStore } from "./run-store.js";
import { ACTION_KIND } from "./types.js";

interface StoredAction {
  readonly agentRunId: string;
  readonly kind: string;
  readonly detail: string | null;
  readonly costMicroUsd: number;
}

interface StoredError {
  readonly agentRunId: string;
  readonly kind: string;
  readonly message: string;
  readonly retried: boolean;
}

interface StoredRun {
  readonly objective: string;
  status: string;
  readonly counters: Record<string, number>;
  costMicroUsd: number;
  endedAt: Date | null;
}

const COUNTER_KEYS = [
  "searches",
  "pages",
  "extracted",
  "validated",
  "duplicates",
  "inserted",
  "errors",
] as const;

const isIncrement = (value: unknown): value is { readonly increment: number } =>
  typeof value === "object" &&
  value !== null &&
  "increment" in value &&
  typeof (value as { readonly increment: unknown }).increment === "number";

/**
 * Un faux Prisma tenu en mémoire. Il n'imite pas Prisma : il applique le même
 * contrat d'écriture, ce qui rend les compteurs vérifiables sans base.
 */
const createFakePrisma = () => {
  const runs = new Map<string, StoredRun>();
  const actions: StoredAction[] = [];
  const errors: StoredError[] = [];
  let nextId = 0;

  const prisma = {
    agentRun: {
      create: (args: {
        readonly data: { readonly objective: string };
        readonly select: { readonly id: true };
      }) => {
        nextId += 1;
        const id = `run-${String(nextId)}`;
        const run: StoredRun = {
          objective: args.data.objective,
          status: "RUNNING",
          counters: {
            searches: 0,
            pages: 0,
            extracted: 0,
            validated: 0,
            duplicates: 0,
            inserted: 0,
            errors: 0,
          },
          costMicroUsd: 0,
          endedAt: null,
        };
        runs.set(id, run);
        return { id };
      },
      update: (args: {
        readonly where: { readonly id: string };
        readonly data: Record<string, unknown>;
      }) => {
        const run = runs.get(args.where.id);
        if (run === undefined) {
          throw new Error(`Exécution inconnue : ${args.where.id}`);
        }
        for (const [key, value] of Object.entries(args.data)) {
          if (isIncrement(value)) {
            if (key === "costMicroUsd") {
              run.costMicroUsd += value.increment;
            } else if (COUNTER_KEYS.includes(key as (typeof COUNTER_KEYS)[number])) {
              run.counters[key] = (run.counters[key] ?? 0) + value.increment;
            }
          } else if (key === "status" && typeof value === "string") {
            run.status = value;
          } else if (key === "endedAt" && value instanceof Date) {
            run.endedAt = value;
          }
        }
        return run;
      },
    },
    agentAction: {
      create: (args: {
        readonly data: {
          readonly agentRunId: string;
          readonly kind: string;
          readonly detail: string | null;
          readonly costMicroUsd: number;
        };
      }) => {
        actions.push({ ...args.data });
        return args.data;
      },
    },
    agentError: {
      create: (args: {
        readonly data: {
          readonly agentRunId: string;
          readonly kind: string;
          readonly message: string;
          readonly retried: boolean;
        };
      }) => {
        errors.push({ ...args.data });
        return args.data;
      },
    },
  };

  return { prisma, runs, actions, errors };
};

describe("createAgentRunStore", () => {
  it("ouvre un run en statut RUNNING et renvoie son identifiant", async () => {
    const { prisma, runs } = createFakePrisma();
    const store = createAgentRunStore(prisma as unknown as PrismaClient);

    const id = await store.startRun("Trouver des offres");

    expect(runs.get(id)?.objective).toBe("Trouver des offres");
    expect(runs.get(id)?.status).toBe("RUNNING");
  });

  it("incrémente pages pour une action CRAWL et cumule le coût", async () => {
    const { prisma, runs, actions } = createFakePrisma();
    const store = createAgentRunStore(prisma as unknown as PrismaClient);
    const id = await store.startRun("x");

    await store.recordAction(id, {
      kind: ACTION_KIND.CRAWL,
      detail: "https://example.com/jobs",
      costMicroUsd: 120,
    });

    expect(runs.get(id)?.counters.pages).toBe(1);
    expect(runs.get(id)?.costMicroUsd).toBe(120);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      agentRunId: id,
      kind: "CRAWL",
      detail: "https://example.com/jobs",
      costMicroUsd: 120,
    });
  });

  it("incrémente inserted pour une action STORE", async () => {
    const { prisma, runs } = createFakePrisma();
    const store = createAgentRunStore(prisma as unknown as PrismaClient);
    const id = await store.startRun("x");

    await store.recordAction(id, { kind: ACTION_KIND.STORE });

    expect(runs.get(id)?.counters.inserted).toBe(1);
  });

  it("incrémente searches pour une action SEARCH", async () => {
    const { prisma, runs } = createFakePrisma();
    const store = createAgentRunStore(prisma as unknown as PrismaClient);
    const id = await store.startRun("x");

    await store.recordAction(id, { kind: ACTION_KIND.SEARCH });

    expect(runs.get(id)?.counters.searches).toBe(1);
  });

  it("n'avance aucun compteur pour une action DISCOVER", async () => {
    const { prisma, runs } = createFakePrisma();
    const store = createAgentRunStore(prisma as unknown as PrismaClient);
    const id = await store.startRun("x");

    await store.recordAction(id, { kind: ACTION_KIND.DISCOVER });

    expect(runs.get(id)?.counters).toMatchObject({ searches: 0, pages: 0, inserted: 0 });
  });

  it("incrémente errors et consigne l'erreur pour recordError", async () => {
    const { prisma, runs, errors } = createFakePrisma();
    const store = createAgentRunStore(prisma as unknown as PrismaClient);
    const id = await store.startRun("x");

    await store.recordError(id, {
      kind: "HttpRequestError",
      message: "La source a répondu 503.",
      retried: true,
    });

    expect(runs.get(id)?.counters.errors).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      agentRunId: id,
      kind: "HttpRequestError",
      message: "La source a répondu 503.",
      retried: true,
    });
  });

  it("clôt le run avec le statut et la date de fin", async () => {
    const { prisma, runs } = createFakePrisma();
    const store = createAgentRunStore(prisma as unknown as PrismaClient);
    const id = await store.startRun("x");
    const endedAt = new Date("2026-10-06T08:00:00.000Z");

    await store.finishRun(id, "SUCCEEDED", endedAt);

    expect(runs.get(id)?.status).toBe("SUCCEEDED");
    expect(runs.get(id)?.endedAt).toEqual(endedAt);
  });
});
