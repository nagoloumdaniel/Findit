import { z } from "zod";

import type { PlannerModel } from "./planner.js";

/**
 * Choix des sources à crawler, deuxième brique de la boucle d'outils (section 5).
 *
 * Jusqu'ici l'agent visitait les sources dans l'ordre du score, sans regarder ce
 * qu'elles étaient. Ici, le modèle voit la liste des sources notées d'un tour —
 * domaine, URL, score, titre — et choisit celles qui valent une visite, dans
 * l'ordre. L'exécution reste bornée : seules des URL candidates peuvent revenir,
 * et leur nombre est plafonné.
 */

/** Une source notée, telle qu'elle est proposée au choix. */
export interface SourceCandidate {
  readonly url: string;
  readonly domain: string;
  readonly score: number;
  readonly title: string;
}

export interface SourceSelectionContext {
  readonly objective: string;
  readonly candidates: readonly SourceCandidate[];
  /** Nombre de sources que le run acceptera au plus. */
  readonly maxSources: number;
}

export interface SourceSelection {
  /** URL choisies, dans l'ordre de visite. */
  readonly urls: readonly string[];
  /** Qui a choisi : le modèle, ou l'ordre du score. */
  readonly source: "llm" | "score";
}

export interface SourceSelector {
  select(context: SourceSelectionContext): Promise<SourceSelection>;
}

/**
 * Le choix par défaut : l'ordre du score, tronqué au plafond. C'est le
 * comportement d'avant, et le repli du sélecteur.
 */
export const scoreOrderSelector: SourceSelector = {
  select: ({ candidates, maxSources }) =>
    Promise.resolve(
      maxSources <= 0
        ? { urls: [], source: "score" as const }
        : {
            urls: [...candidates]
              .sort((a, b) => b.score - a.score)
              .slice(0, maxSources)
              .map((candidate) => candidate.url),
            source: "score" as const,
          },
    ),
};

const selectionSchema = z.object({
  /**
   * Numéros des sources choisies, dans l'ordre de visite (1 = première de la
   * liste). Des numéros plutôt que des URL : le modèle recopiait des adresses
   * longues, payées en entrée **et** en sortie, alors que le numéro suffit.
   */
  choix: z.array(z.number().int()).max(50),
});

type SelectionResponse = z.infer<typeof selectionSchema>;

const SYSTEM_PROMPT = [
  "Tu choisis, pour un agent de collecte d'offres d'emploi, les pages web qui valent une visite.",
  "On te donne une liste numérotée de sources déjà notées par des règles ; tu peux changer leur ordre et en écarter.",
  "Règles strictes :",
  "- Ne renvoie que des numéros de la liste fournie.",
  "- Visite d'abord les pages d'offre à la source (URL profonde : identifiant d'offre, candidature) plutôt que les racines de board, qui listent tous les contrats.",
  "- Écarte les pages de recherche d'agrégateur : elles ne portent pas d'offre.",
  "- Écarte les sources dont le titre annonce un contrat hors périmètre (CDI, CDD, freelance).",
  '- Réponds uniquement par un objet JSON de la forme {"choix":[3,1]}, sans texte autour.',
].join("\n");

const buildPrompt = (context: SourceSelectionContext): string => {
  const lines = [
    `Objectif : ${context.objective}`,
    `Choisis au plus ${String(context.maxSources)} sources, par leur numéro :`,
  ];
  context.candidates.forEach((candidate, index) => {
    lines.push(
      `${String(index + 1)}. [${String(candidate.score)}] ${candidate.domain} — ${candidate.title.slice(0, 70)}`,
    );
  });
  return lines.join("\n");
};

/**
 * Sélecteur piloté par le modèle.
 *
 * Le repli est ce qui rend la brique sûre : panne, sortie hors schéma, URL
 * inventées ou liste vide rendent l'ordre du score, sans que le run s'arrête.
 * Une URL qui n'était pas candidate est ignorée — le modèle ne peut pas faire
 * visiter une page que le scoring n'avait pas retenue.
 */
export const createLlmSourceSelector = (options: {
  readonly model: PlannerModel;
  readonly fallback?: SourceSelector;
  readonly temperature?: number;
}): SourceSelector => {
  const fallback = options.fallback ?? scoreOrderSelector;

  return {
    async select(context: SourceSelectionContext): Promise<SourceSelection> {
      // Sans place pour une source, personne ne choisit : le contrat est le même
      // des deux côtés, y compris pour un plafond nul ou négatif.
      if (context.maxSources <= 0) {
        return { urls: [], source: "score" };
      }

      if (context.candidates.length <= 1) {
        return fallback.select(context);
      }

      let raw: unknown;
      try {
        raw = await options.model.generateStructured<SelectionResponse>({
          schema: selectionSchema,
          system: SYSTEM_PROMPT,
          prompt: buildPrompt(context),
          temperature: options.temperature ?? 0,
        });
      } catch {
        return fallback.select(context);
      }

      const parsed = selectionSchema.safeParse(raw);
      if (!parsed.success) {
        return fallback.select(context);
      }

      /*
       * Numéros hors liste, doublons et non-entiers sont ignorés : le modèle
       * garde le droit de se tromper sans faire visiter une page qui n'était pas
       * candidate, ni dépasser le plafond.
       */
      const urls: string[] = [];
      const seen = new Set<number>();
      for (const rank of parsed.data.choix) {
        const index = rank - 1;
        if (index < 0 || index >= context.candidates.length || seen.has(index)) {
          continue;
        }
        seen.add(index);
        urls.push(context.candidates[index]!.url);
        if (urls.length >= context.maxSources) {
          break;
        }
      }

      if (urls.length === 0) {
        return fallback.select(context);
      }

      return { urls, source: "llm" };
    },
  };
};
