import type { Prisma, PrismaClient } from "@findit/database";

import type { MemoryKind } from "./types.js";

/**
 * Ce que la mémoire doit lire et écrire. La clé d'unicité est le couple
 * (kind, key) : la même URL peut être « visitée » et « analysée », deux faits
 * distincts qui ne doivent pas s'écraser l'un l'autre.
 */
export interface AgentMemoryStore {
  /** Écrit ou rafraîchit une entrée de mémoire, clé unique par (kind, key). */
  remember(kind: MemoryKind, key: string, value?: Prisma.InputJsonValue): Promise<void>;
  /** Vrai si la clé a déjà été vue pour ce type de mémoire. */
  alreadySeen(kind: MemoryKind, key: string): Promise<boolean>;
}

export const createAgentMemoryStore = (prisma: PrismaClient): AgentMemoryStore => ({
  remember: async (kind, key, value) => {
    const now = new Date();

    await prisma.agentMemory.upsert({
      where: { kind_key: { kind, key } },
      create:
        value === undefined
          ? { kind, key, lastSeenAt: now }
          : { kind, key, value, lastSeenAt: now },
      update: value === undefined ? { lastSeenAt: now } : { value, lastSeenAt: now },
    });
  },

  alreadySeen: async (kind, key) => {
    const row = await prisma.agentMemory.findUnique({
      where: { kind_key: { kind, key } },
      select: { id: true },
    });

    return row !== null;
  },
});
