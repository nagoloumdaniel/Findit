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

/** Une source vue au tour précédent, avec le score qui a décidé de sa visite. */
export interface ObservedSource {
  readonly url: string;
  readonly domain: string;
  readonly score: number;
  readonly kept: boolean;
}

/** Une offre retenue jusqu'ici, réduite à ce qui aide à décider. */
export interface ObservedOffer {
  readonly title: string;
  readonly company: string;
}

/**
 * Ce que le tour précédent a réellement produit. C'est le « résultat » de la
 * boucle décision → outil → résultat → décision : sans lui, le second tour
 * serait aveugle et ne vaudrait pas mieux que le premier.
 */
export interface PlannerObservation {
  readonly executedQueries: readonly string[];
  readonly sources: readonly ObservedSource[];
  readonly offers: readonly ObservedOffer[];
  readonly pagesVisited: number;
}

export interface RefineContext extends QueryPlanContext {
  readonly observation: PlannerObservation;
}

export interface QueryPlanner {
  plan(context: QueryPlanContext): Promise<QueryPlan>;
  /**
   * Décide de la suite après un tour, à la lumière de ce qu'il a produit. Rend
   * `null` pour arrêter : c'est au planificateur de dire qu'il n'a plus rien à
   * proposer, le run ne devine pas à sa place.
   */
  refine?(context: RefineContext): Promise<QueryPlan | null>;
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
 * Normalise, dédoublonne et borne les requêtes d'un plan. `alreadyExecuted`
 * empêche un second tour de répéter une recherche déjà lancée : sans cela, le
 * modèle pourrait proposer indéfiniment la même requête.
 */
const buildQueries = (
  items: readonly { readonly query: string }[],
  maxQueries: number,
  alreadyExecuted: ReadonlySet<string>,
): GeneratedSearchQuery[] => {
  const seen = new Set(alreadyExecuted);
  const queries: GeneratedSearchQuery[] = [];

  for (const item of items) {
    const query = normalize(item.query);
    const key = keyOf(query);
    if (key === "" || seen.has(key)) {
      continue;
    }
    seen.add(key);
    queries.push({ query, engine: "brave" });
    if (queries.length >= maxQueries) {
      break;
    }
  }

  return queries;
};

/** Rien d'exécuté : le premier plan n'a aucune requête à éviter. */
const NOTHING_EXECUTED: ReadonlySet<string> = new Set<string>();

/** Second tour : le modèle propose de nouvelles requêtes, ou décide d'arrêter. */
const refineSchema = z.object({
  queries: z
    .array(
      z.object({
        query: z.string().min(3).max(200),
        why: z.string().max(200).optional(),
      }),
    )
    .max(40),
});

const SYSTEM_REFINE = [
  "Tu révises, après un premier tour, le plan de recherche d'offres d'un agent de collecte web.",
  "On te donne ce que le premier tour a produit. Décide s'il faut chercher autrement, ou arrêter.",
  "Règles strictes :",
  "- Ne répète jamais une requête déjà exécutée.",
  "- Vise en priorité les pages d'offre à la source : `site:` sur boards.greenhouse.io, jobs.lever.co, apply.workable.com, jobs.ashbyhq.com, jobs.teamtailor.com.",
  "- Si les sources conservées sont déjà des pages d'offre et que des offres ont été trouvées, réponds avec un tableau `queries` vide : le run s'arrête.",
  "- Sinon, propose jusqu'au nombre demandé de nouvelles requêtes.",
  '- Réponds uniquement par un objet JSON de la forme {"queries":[{"query":"..."}]}, sans texte autour.',
].join("\n");

const buildRefinePrompt = (context: RefineContext): string => {
  const { observation } = context;
  const kept = observation.sources.filter((source) => source.kept).slice(0, 10);
  const sample = observation.offers.slice(0, 5).map((offer) => offer.title);

  return [
    `Objectif : ${context.objective}`,
    `Requêtes déjà exécutées : ${observation.executedQueries.join(" | ") || "aucune"}`,
    `Pages visitées : ${String(observation.pagesVisited)}`,
    `Offres retenues : ${String(observation.offers.length)}${
      sample.length === 0 ? "" : ` — ex. ${sample.join(" | ")}`
    }`,
    `Sources conservées : ${
      kept.length === 0
        ? "aucune"
        : kept.map((source) => `${source.domain} (${String(source.score)})`).join(", ")
    }`,
    `Propose au plus ${String(context.maxQueries)} nouvelles requêtes, ou un tableau vide pour arrêter.`,
  ].join("\n");
};

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

      const queries = buildQueries(parsed.data.queries, context.maxQueries, NOTHING_EXECUTED);
      if (queries.length === 0) {
        return fallback.plan(context);
      }

      return { queries, source: "llm" };
    },

    /**
     * Second tour. Un échec ici n'appelle pas le repli déterministe : rejouer le
     * même plan ne ferait que répéter un tour déjà exécuté. On arrête.
     */
    async refine(context: RefineContext): Promise<QueryPlan | null> {
      let raw: unknown;
      try {
        raw = await options.model.generateStructured<z.infer<typeof refineSchema>>({
          schema: refineSchema,
          system: SYSTEM_REFINE,
          prompt: buildRefinePrompt(context),
          temperature: options.temperature ?? 0.2,
        });
      } catch {
        return null;
      }

      const parsed = refineSchema.safeParse(raw);
      if (!parsed.success) {
        return null;
      }

      const executed = new Set(context.observation.executedQueries.map(keyOf));
      const queries = buildQueries(parsed.data.queries, context.maxQueries, executed);
      if (queries.length === 0) {
        return null;
      }

      return { queries, source: "llm" };
    },
  };
};
