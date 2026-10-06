import type { Prisma, PrismaClient } from "@findit/database";

import { MEMORY_KIND, type MemoryKind } from "./types.js";

/**
 * Ce que la mémoire doit lire et écrire. La clé d'unicité est le couple
 * (kind, key) : la même URL peut être « visitée » et « analysée », deux faits
 * distincts qui ne doivent pas s'écraser l'un l'autre.
 *
 * Les lectures ajoutées en V2 (`hasSeenUrl`, `knownSourcePatterns`) traduisent
 * les questions concrètes de l'orchestrateur en requêtes déjà câblées, pour
 * qu'il n'ait pas à connaître le couple (kind, key) de la table.
 */
export interface AgentMemoryStore {
  /** Écrit ou rafraîchit une entrée de mémoire, clé unique par (kind, key). */
  remember(kind: MemoryKind, key: string, value?: Prisma.InputJsonValue): Promise<void>;
  /** Vrai si la clé a déjà été vue pour ce type de mémoire. */
  alreadySeen(kind: MemoryKind, key: string): Promise<boolean>;
  /** Vrai si l'URL a déjà été visitée lors d'un run précédent. */
  hasSeenUrl(url: string): Promise<boolean>;
  /** Les motifs de sources qui ont déjà produit des offres, triés. */
  knownSourcePatterns(): Promise<readonly string[]>;
}

export const createAgentMemoryStore = (prisma: PrismaClient): AgentMemoryStore => {
  /**
   * Vrai si une ligne existe pour ce couple (kind, key). Lecture partagée par
   * `alreadySeen` et `hasSeenUrl` : les deux expriment le même fait (« cette
   * clé est déjà en mémoire »), seule la question posée par l'appelant change.
   */
  const exists = async (kind: MemoryKind, key: string): Promise<boolean> => {
    const row = await prisma.agentMemory.findUnique({
      where: { kind_key: { kind, key } },
      select: { id: true },
    });

    return row !== null;
  };

  return {
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

    alreadySeen: async (kind, key) => exists(kind, key),

    hasSeenUrl: async (url) => exists(MEMORY_KIND.VISITED_URL, url),

    knownSourcePatterns: async () => {
      const rows = await prisma.agentMemory.findMany({
        where: { kind: MEMORY_KIND.SOURCE_PATTERN },
        select: { key: true },
      });

      // Tri déterministe : l'ordre de lecture de la base n'est pas garanti, et
      // l'orchestrateur veut une liste stable d'un run à l'autre pour décider.
      return rows.map((row) => row.key).sort();
    },
  };
};
