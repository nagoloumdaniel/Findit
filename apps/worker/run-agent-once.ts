import { loadRootEnv, parseWorkerEnv } from "@findit/config";
import { createPrismaClient } from "@findit/database";
import { createAgentMemoryStore, createAgentRunStore } from "@findit/agent";
import { createDeepSeekModel, computeCostMicroUsd } from "@findit/ai";
import type { ModelUsage } from "@findit/ai";
import { crawl } from "@findit/crawler";
import type { CrawledPage } from "@findit/crawler";
import { BraveSearchProvider, decideDiscoveredSourceAccess } from "@findit/job-connectors";
import { runAgent } from "@findit/orchestrator";
import { createLlmQueryPlanner } from "@findit/orchestrator";
import { persistOffers } from "@findit/persist";

/*
 * Run unique de l'agent, hors BullMQ : sert à vérifier la boucle complète
 * (Search → Crawl → Extract → Persist) sur de vraies sources, sans attendre le
 * cron. Les bornes par défaut du run (5 minutes, 50 pages) s'appliquent.
 */
const main = async (): Promise<void> => {
  loadRootEnv();
  const env = parseWorkerEnv(process.env);

  if (env.DEEPSEEK_API_KEY === undefined) {
    throw new Error("DEEPSEEK_API_KEY manquante : l'agent ne peut pas s'initialiser.");
  }
  if (env.BRAVE_SEARCH_API_KEY === undefined) {
    throw new Error("BRAVE_SEARCH_API_KEY manquante : aucune découverte possible.");
  }

  const prisma = createPrismaClient(env.DATABASE_URL);
  const model = createDeepSeekModel({
    apiKey: env.DEEPSEEK_API_KEY,
    model: env.DEEPSEEK_MODEL,
  });
  const search = new BraveSearchProvider({
    apiKey: env.BRAVE_SEARCH_API_KEY,
    fetch: globalThis.fetch,
  });

  console.log(`objectif : ${env.AGENT_OBJECTIVE}`);
  const startedAt = Date.now();

  const inputPrice = env.DEEPSEEK_INPUT_USD_PER_MTOK;
  const outputPrice = env.DEEPSEEK_OUTPUT_USD_PER_MTOK;
  const modelCost =
    inputPrice === undefined || outputPrice === undefined
      ? undefined
      : (usage: ModelUsage): number =>
          computeCostMicroUsd(usage, {
            inputUsdPerMillionTokens: inputPrice,
            outputUsdPerMillionTokens: outputPrice,
          });

  try {
    const result = await runAgent(env.AGENT_OBJECTIVE, {
      runStore: createAgentRunStore(prisma),
      memoryStore: createAgentMemoryStore(prisma),
      search,
      crawl,
      model,
      planner: createLlmQueryPlanner({ model }),
      // Même porte de conformité que le worker : le registre décide.
      sourceGate: (url) => decideDiscoveredSourceAccess(prisma, url, new Date()),
      ...(modelCost === undefined ? {} : { modelCost }),
      recoverPage: async (url: string): Promise<CrawledPage | null> => {
        const recovered = await crawl({
          startUrl: url,
          maxDepth: 0,
          maxPages: 1,
          maxRuntimeMs: 30_000,
        });
        const page = recovered.pages[0];
        if (page === undefined || (page.text.trim() === "" && page.html.trim() === "")) {
          return null;
        }
        return page;
      },
      persist: (offers) => persistOffers(offers, { prisma }),
    });

    console.log(JSON.stringify(result, null, 2));
    console.log(`duree : ${Date.now() - startedAt} ms`);
  } finally {
    await prisma.$disconnect();
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
