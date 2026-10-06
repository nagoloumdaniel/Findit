import type { PrismaClient } from "@findit/database";
import { describe, expect, it } from "vitest";

import { createAgentMemoryStore } from "./memory-store.js";
import { MEMORY_KIND } from "./types.js";

interface StoredMemory {
  readonly kind: string;
  readonly key: string;
  value: unknown;
  lastSeenAt: Date;
}

/** Un faux Prisma tenu en mémoire, appliquant la clé d'unicité (kind, key). */
const createFakePrisma = () => {
  const rows = new Map<string, StoredMemory>();

  const prisma = {
    agentMemory: {
      upsert: (args: {
        readonly where: { readonly kind_key: { readonly kind: string; readonly key: string } };
        readonly create: {
          readonly kind: string;
          readonly key: string;
          readonly value?: unknown;
          readonly lastSeenAt: Date;
        };
        readonly update: { readonly value?: unknown; readonly lastSeenAt: Date };
      }) => {
        const { kind, key } = args.where.kind_key;
        const mapKey = `${kind}:${key}`;
        const existing = rows.get(mapKey);

        if (existing !== undefined) {
          existing.lastSeenAt = args.update.lastSeenAt;
          if ("value" in args.update) {
            existing.value = args.update.value;
          }
        } else {
          rows.set(mapKey, {
            kind,
            key,
            value: "value" in args.create ? args.create.value : null,
            lastSeenAt: args.create.lastSeenAt,
          });
        }

        return {};
      },
      findUnique: (args: {
        readonly where: { readonly kind_key: { readonly kind: string; readonly key: string } };
        readonly select: { readonly id: true };
      }) => {
        const { kind, key } = args.where.kind_key;
        const mapKey = `${kind}:${key}`;
        return rows.has(mapKey) ? { id: mapKey } : null;
      },
      findMany: (args: {
        readonly where: { readonly kind: string };
        readonly select: { readonly key: true };
      }) => {
        // Ne rend que les clés du type demandé, comme le ferait le filtre SQL.
        const keys: string[] = [];
        for (const row of rows.values()) {
          if (row.kind === args.where.kind) {
            keys.push(row.key);
          }
        }
        return keys.map((key) => ({ key }));
      },
    },
  };

  return { prisma, rows };
};

describe("createAgentMemoryStore", () => {
  it("renvoie false pour une URL jamais vue", async () => {
    const { prisma } = createFakePrisma();
    const store = createAgentMemoryStore(prisma as unknown as PrismaClient);

    expect(await store.alreadySeen(MEMORY_KIND.VISITED_URL, "https://example.com/a")).toBe(false);
  });

  it("renvoie true après remember", async () => {
    const { prisma } = createFakePrisma();
    const store = createAgentMemoryStore(prisma as unknown as PrismaClient);

    await store.remember(MEMORY_KIND.VISITED_URL, "https://example.com/a");

    expect(await store.alreadySeen(MEMORY_KIND.VISITED_URL, "https://example.com/a")).toBe(true);
  });

  it("distingue deux types de mémoire pour la même clé", async () => {
    const { prisma } = createFakePrisma();
    const store = createAgentMemoryStore(prisma as unknown as PrismaClient);

    await store.remember(MEMORY_KIND.VISITED_URL, "https://example.com/a");

    expect(await store.alreadySeen(MEMORY_KIND.ANALYZED_URL, "https://example.com/a")).toBe(false);
  });

  it("stocke la valeur fournie", async () => {
    const { prisma, rows } = createFakePrisma();
    const store = createAgentMemoryStore(prisma as unknown as PrismaClient);

    await store.remember(MEMORY_KIND.SOURCE_PATTERN, "pattern:acme", { ats: "greenhouse" });

    expect(rows.get("SOURCE_PATTERN:pattern:acme")?.value).toEqual({ ats: "greenhouse" });
  });

  it("rafraîchit la valeur existante sans la perdre", async () => {
    const { prisma, rows } = createFakePrisma();
    const store = createAgentMemoryStore(prisma as unknown as PrismaClient);

    await store.remember(MEMORY_KIND.SOURCE_PATTERN, "pattern:acme", { ats: "greenhouse" });
    await store.remember(MEMORY_KIND.SOURCE_PATTERN, "pattern:acme");

    expect(rows.get("SOURCE_PATTERN:pattern:acme")?.value).toEqual({ ats: "greenhouse" });
  });

  it("hasSeenUrl renvoie false pour une URL jamais vue", async () => {
    const { prisma } = createFakePrisma();
    const store = createAgentMemoryStore(prisma as unknown as PrismaClient);

    expect(await store.hasSeenUrl("https://example.com/a")).toBe(false);
  });

  it("hasSeenUrl renvoie true après remember d'une URL visitée", async () => {
    const { prisma } = createFakePrisma();
    const store = createAgentMemoryStore(prisma as unknown as PrismaClient);

    await store.remember(MEMORY_KIND.VISITED_URL, "https://example.com/a");

    expect(await store.hasSeenUrl("https://example.com/a")).toBe(true);
  });

  it("knownSourcePatterns renvoie une liste vide quand rien n'est connu", async () => {
    const { prisma } = createFakePrisma();
    const store = createAgentMemoryStore(prisma as unknown as PrismaClient);

    expect(await store.knownSourcePatterns()).toEqual([]);
  });

  it("knownSourcePatterns renvoie les motifs déjà enregistrés, triés", async () => {
    const { prisma } = createFakePrisma();
    const store = createAgentMemoryStore(prisma as unknown as PrismaClient);

    await store.remember(MEMORY_KIND.SOURCE_PATTERN, "pattern:beta");
    await store.remember(MEMORY_KIND.SOURCE_PATTERN, "pattern:acme", { ats: "greenhouse" });

    expect(await store.knownSourcePatterns()).toEqual(["pattern:acme", "pattern:beta"]);
  });

  it("knownSourcePatterns ignore les autres types de mémoire", async () => {
    const { prisma } = createFakePrisma();
    const store = createAgentMemoryStore(prisma as unknown as PrismaClient);

    await store.remember(MEMORY_KIND.SOURCE_PATTERN, "pattern:acme");
    await store.remember(MEMORY_KIND.VISITED_URL, "https://example.com/a");

    expect(await store.knownSourcePatterns()).toEqual(["pattern:acme"]);
  });
});
