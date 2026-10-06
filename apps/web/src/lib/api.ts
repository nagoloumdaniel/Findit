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

const request = async <T>(path: string): Promise<ApiResult<T>> => {
  try {
    const response = await fetch(new URL(path, baseUrl()), {
      // Les offres changent d'heure en heure : aucune réponse n'est mise en cache.
      cache: "no-store",
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
  request<JobList>(`/api/jobs?${search.toString()}`);

export const fetchFilterOptions = (search: URLSearchParams): Promise<ApiResult<JobFilterOptions>> =>
  request<JobFilterOptions>(`/api/jobs/filters?${search.toString()}`);

export const fetchStats = (): Promise<ApiResult<JobStats>> => request<JobStats>("/api/jobs/stats");

/// Distingue « introuvable » d'« API injoignable » : les deux s'affichent
/// différemment.
export const fetchJobDetail = async (
  slug: string,
  search: URLSearchParams,
): Promise<ApiResult<JobDetail | null>> => {
  try {
    const response = await fetch(new URL(`/api/jobs/${slug}?${search.toString()}`, baseUrl()), {
      cache: "no-store",
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

export type AgentAnalytics = {
  publishedPerDay: { date: string; count: number }[];
  topSources: { name: string; pageCount: number }[];
  topCompanies: { name: string; jobCount: number }[];
  runStatuses: { succeeded: number; failed: number; stopped: number };
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

export const fetchAgentStats = (): Promise<ApiResult<AgentStats>> =>
  request<AgentStats>("/api/agent/stats");

export const fetchAgentAnalytics = (): Promise<ApiResult<AgentAnalytics>> =>
  request<AgentAnalytics>("/api/agent/analytics");

export const fetchAgentRuns = (): Promise<ApiResult<AgentRunSummary[]>> =>
  request<AgentRunSummary[]>("/api/agent/runs");

export const fetchAgentSources = (): Promise<ApiResult<SourceItem[]>> =>
  request<SourceItem[]>("/api/agent/sources");
