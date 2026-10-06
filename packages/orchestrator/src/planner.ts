import { generateSearchQueries } from "@findit/agent";
import type { GeneratedSearchQuery } from "@findit/agent";
import { z } from "zod";

/**
 * Planificateur de requêtes, première brique de la boucle d'outils du cahier
 * des charges (section 5) : le modèle décide, les outils déterministes
 * exécutent, le résultat revient au modèle.
 *
 * Ce que cette brique change : le modèle choisit les recherches à lancer au
 * lieu de recevoir celles qu'une règle a déduites. Ce qu'elle ne change pas :
 * l'exécution reste bornée et déterministe, et un plan refusé, vide ou en échec
 * retombe sur le générateur déterministe — un run ne perd jamais sa recherche
 * parce que le modèle a mal répondu.
 */

/** Modèle minimal dont le planificateur a besoin. Structurellement, `DeepSeekModel`. */
export interface PlannerModel {
  generateStructured: <T>(request: {
    schema: z.ZodType<T>;
    prompt: string;
    system?: string;
    temperature?: number;
  }) => Promise<T>;
}

export interface QueryPlanContext {
  readonly objective: string;
  /** Nombre de requêtes que le run exécutera au plus. */
  readonly maxQueries: number;
}

export interface QueryPlan {
  readonly queries: readonly GeneratedSearchQuery[];
  /** Qui a décidé : le modèle, ou le repli déterministe. */
  readonly source: "llm" | "deterministic";
}

export interface QueryPlanner {
  plan(context: QueryPlanContext): Promise<QueryPlan>;
}

/**
 * Le plan déterministe : les requêtes déduites de l'objectif par règles, comme
 * avant. C'est le défaut du run et le repli du planificateur.
 */
export const deterministicQueryPlanner: QueryPlanner = {
  plan: ({ objective, maxQueries }) =>
    Promise.resolve({
      queries: generateSearchQueries(objective).slice(0, maxQueries),
      source: "deterministic",
    }),
};

/** Ce que le modèle doit rendre : une liste de requêtes, rien d'autre. */
const planSchema = z.object({
  queries: z
    .array(
      z.object({
        query: z.string().min(3).max(200),
        /// Justification courte, pour que le plan soit relisible dans les logs.
        why: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(40),
});

type PlanResponse = z.infer<typeof planSchema>;

const SYSTEM_PROMPT = [
  "Tu planifies la recherche d'offres d'emploi d'un agent de collecte web.",
  "L'objectif est en français ; les requêtes doivent être en français.",
  "Périmètre : contrats d'alternance et de stage, métiers du développement, Île-de-France.",
  "Règles strictes :",
  "- Produis entre 8 et 20 requêtes courtes, chacune exploitable telle quelle par un moteur de recherche.",
  "- Couvre plusieurs angles : contrat (alternance, stage), métier, technologie et lieu.",
  "- Commence par les requêtes `site:` sur les domaines qui hébergent les offres (boards.greenhouse.io, jobs.lever.co, apply.workable.com, jobs.ashbyhq.com, jobs.teamtailor.com), car le budget de pages est court : mesuré, un plan qui commence par des requêtes génériques envoie le crawl sur des agrégateurs (LinkedIn, Glassdoor, Indeed) qui répondent 403 ou ne portent aucune offre.",
  "- N'invente pas de marque d'entreprise ni de nom propre absent de l'objectif.",
  "- Évite les requêtes identiques ou quasi identiques.",
  '- Réponds uniquement par un objet JSON de la forme {"queries":[{"query":"..."}]}, sans texte autour.',
].join("\n");

const buildPrompt = (context: QueryPlanContext): string =>
  [
    `Objectif : ${context.objective}`,
    `Donne au plus ${String(context.maxQueries)} requêtes (le run n'en exécutera pas plus).`,
  ].join("\n");

const normalize = (query: string): string => query.trim().replace(/\s+/gu, " ");
const keyOf = (query: string): string => normalize(query).toLowerCase();

/**
 * Planificateur piloté par le modèle.
 *
 * Le repli n'est pas un détail : c'est ce qui rend la brique sûre. Panne du
 * modèle, sortie hors schéma, plan vide ou requêtes toutes en doublon rendent le
 * plan déterministe, sans que le run s'arrête ni ne parte sans recherche.
 */
export const createLlmQueryPlanner = (options: {
  readonly model: PlannerModel;
  readonly fallback?: QueryPlanner;
  readonly temperature?: number;
}): QueryPlanner => {
  const fallback = options.fallback ?? deterministicQueryPlanner;

  return {
    async plan(context: QueryPlanContext): Promise<QueryPlan> {
      let raw: unknown;
      try {
        raw = await options.model.generateStructured<PlanResponse>({
          schema: planSchema,
          system: SYSTEM_PROMPT,
          prompt: buildPrompt(context),
          temperature: options.temperature ?? 0.2,
        });
      } catch {
        // Modèle injoignable ou sortie refusée : le run garde sa recherche.
        return fallback.plan(context);
      }

      const parsed = planSchema.safeParse(raw);
      if (!parsed.success) {
        return fallback.plan(context);
      }

      const seen = new Set<string>();
      const queries: GeneratedSearchQuery[] = [];
      for (const item of parsed.data.queries) {
        const query = normalize(item.query);
        const key = keyOf(query);
        if (key === "" || seen.has(key)) {
          continue;
        }
        seen.add(key);
        queries.push({ query, engine: "brave" });
        if (queries.length >= context.maxQueries) {
          break;
        }
      }

      if (queries.length === 0) {
        return fallback.plan(context);
      }

      return { queries, source: "llm" };
    },
  };
};
