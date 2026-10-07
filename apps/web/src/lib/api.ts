import { parseWebEnv } from "@findit/config";

export type JobListItem = {
  slug: string;
  isDemo: boolean;
  title: string;
  roleCategory: string;
  companyName: string;
  companyLogoUrl: string | null;
  city: string;
  departmentCode: string;
  contractType: string;
  workMode: string;
  publishedAt: string;
  dataQualityScore: number;
  skills: string[];
  canonicalSource: { name: string; url: string } | null;
  /// « JOB_BOARD » signale une offre reprise d'une plateforme tierce : l'API
  /// n'en livre qu'un extrait, jamais la description complète.
  origin: "OFFICIAL" | "JOB_BOARD";
};

export type JobList = {
  items: JobListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type JobDetail = JobListItem & {
  descriptionTruncated: boolean;
  description: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  postalCode: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: string | null;
  salaryText: string | null;
  studyLevel: string | null;
  startDate: string | null;
  duration: string | null;
  expiresAt: string;
  canonicalUrl: string;
  applyUrl: string | null;
  companyWebsite: string | null;
  companyCareerUrl: string | null;
  sources: { name: string; url: string; priority: number; checkedAt: string }[];
};

export type JobFilterOptions = {
  roles: { value: string; count: number }[];
  contracts: { value: string; count: number }[];
  departments: { value: string; count: number }[];
  workModes: { value: string; count: number }[];
};

export type JobStats = {
  publishedLast24h: number;
  publishedLast72h: number;
  lastPublishedAt: string | null;
};

/*
 * L'indisponibilité de l'API est un état affichable, pas une exception qui
 * casse la page. La distinguer d'une absence de résultat évite d'annoncer
 * « aucune offre » alors que la vérité est « nous n'avons pas pu vérifier ».
 */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; reason: "UNAVAILABLE" };

const baseUrl = (): string => parseWebEnv(process.env).NEXT_PUBLIC_API_URL;

/*
 * Politique de cache, par NATURE de donnée — jamais globale.
 *
 * POURQUOI cette frontière est le point sensible : les offres publiées, les
 * statistiques et les options de filtre sont publiques et changent lentement ;
 * les revalider évite de refaire l'aller-retour API à chaque rendu. Tout le
 * reste est propre à la session (profil, matchings, agent, runs, sources) : le
 * mettre en cache servirait un jour les données d'une personne à une autre. Une
 * optimisation qui écrase cette distinction est une fuite, pas un gain.
 *
 * Fenêtres retenues :
 * - 60 s pour les offres et leur décompte : la collecte met la base à jour au
 *   mieux toutes les 4 heures (ATS) et une fois par jour (job boards), donc le
 *   retard maximal ajouté par le cache (une minute) est invisible devant le
 *   cycle réel de collecte ;
 * - 300 s pour les options de filtre et le détail d'une offre : agrégats et
 *   pages qui bougent encore moins vite, et qu'on ne veut pas recalculer à
 *   chaque visite.
 */
const PUBLIC_REVALIDATE_SECONDS = 60;
const AGGREGATE_REVALIDATE_SECONDS = 300;

const request = async <T>(path: string, revalidate: number | null): Promise<ApiResult<T>> => {
  try {
    const response = await fetch(new URL(path, baseUrl()), {
      /*
       * `null` = donnée de session : jamais de cache. Un nombre = donnée
       * publique revalidée par le cache de données de Next.
       */
      ...(revalidate === null ? { cache: "no-store" as const } : { next: { revalidate } }),
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return { ok: false, reason: "UNAVAILABLE" };
    }

    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, reason: "UNAVAILABLE" };
  }
};

export const fetchJobs = (search: URLSearchParams): Promise<ApiResult<JobList>> =>
  request<JobList>(`/api/jobs?${search.toString()}`, PUBLIC_REVALIDATE_SECONDS);

export const fetchFilterOptions = (search: URLSearchParams): Promise<ApiResult<JobFilterOptions>> =>
  request<JobFilterOptions>(`/api/jobs/filters?${search.toString()}`, AGGREGATE_REVALIDATE_SECONDS);

export const fetchStats = (): Promise<ApiResult<JobStats>> =>
  request<JobStats>("/api/jobs/stats", PUBLIC_REVALIDATE_SECONDS);

/// Distingue « introuvable » d'« API injoignable » : les deux s'affichent
/// différemment.
export const fetchJobDetail = async (
  slug: string,
  search: URLSearchParams,
): Promise<ApiResult<JobDetail | null>> => {
  try {
    const response = await fetch(new URL(`/api/jobs/${slug}?${search.toString()}`, baseUrl()), {
      next: { revalidate: AGGREGATE_REVALIDATE_SECONDS },
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    if (response.status === 404) {
      return { ok: true, data: null };
    }

    if (!response.ok) {
      return { ok: false, reason: "UNAVAILABLE" };
    }

    return { ok: true, data: (await response.json()) as JobDetail };
  } catch {
    return { ok: false, reason: "UNAVAILABLE" };
  }
};

export type AgentRunSummary = {
  id: string;
  objective: string;
  status: string;
  searches: number;
  pages: number;
  extracted: number;
  validated: number;
  duplicates: number;
  inserted: number;
  errors: number;
  costMicroUsd: number;
  startedAt: string;
  endedAt: string | null;
};

export type AgentStats = {
  lastRun: AgentRunSummary | null;
  sourceCount: number;
  pageCount: number;
  publishedJobCount: number;
};

export type ModelCostDay = {
  date: string;
  costMicroUsd: number;
  inputTokens: number;
  outputTokens: number;
};

export type ModelCost = {
  totalCostMicroUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  runCount: number;
  perDay: ModelCostDay[];
};

/// Coût du matching CV : même forme que `ModelCost`, mais `callCount` remplace
/// `runCount` — un appel de matching n'est pas un run d'agent.
export type MatchingCost = {
  callCount: number;
  totalCostMicroUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  perDay: ModelCostDay[];
};

export type AgentAnalytics = {
  publishedPerDay: { date: string; count: number }[];
  topSources: { name: string; pageCount: number }[];
  topCompanies: { name: string; jobCount: number }[];
  runStatuses: { succeeded: number; failed: number; stopped: number };
  modelCost: ModelCost;
  /// Coût du matching CV, qui ne passe pas par un run d'agent : journalisé à part
  /// (`ModelCall`) et donc lu à part.
  matchingCost: MatchingCost;
};

export type SourceItem = {
  id: string;
  name: string;
  url: string;
  type: string;
  schedule: string;
  maxDepth: number;
  maxPages: number;
  priority: number;
  enabled: boolean;
  lastCrawlAt: string | null;
};

/*
 * Données propres à la session (agent, runs, sources, matchings, profil) : lues
 * en `no-store`, sans exception. Les revalider ferait servir l'état d'un
 * utilisateur à un autre — c'est la ligne rouge de cette politique.
 */
export const fetchAgentStats = (): Promise<ApiResult<AgentStats>> =>
  request<AgentStats>("/api/agent/stats", null);

export const fetchAgentAnalytics = (): Promise<ApiResult<AgentAnalytics>> =>
  request<AgentAnalytics>("/api/agent/analytics", null);

export const fetchAgentRuns = (): Promise<ApiResult<AgentRunSummary[]>> =>
  request<AgentRunSummary[]>("/api/agent/runs", null);

export const fetchAgentSources = (): Promise<ApiResult<SourceItem[]>> =>
  request<SourceItem[]>("/api/agent/sources", null);

/// Un matching de CV passé, sans le CV : la liste n'en a pas besoin, et ne pas le
/// charger est la même minimisation que la rétention côté API.
export type MatchingRunSummary = {
  id: string;
  createdAt: string;
  jobCount: number;
  bestScore: number;
};

export const fetchMatchingHistory = (): Promise<ApiResult<MatchingRunSummary[]>> =>
  request<MatchingRunSummary[]>("/api/matching/history", null);
