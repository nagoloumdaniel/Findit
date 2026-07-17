import { z } from "zod";

const nodeEnv = z.enum(["development", "test", "production"]).default("development");
const url = z.url().transform((value) => new URL(value).toString());
const origin = z.url().transform((value) => new URL(value).origin);

/**
 * Booléen lu depuis une variable d'environnement, toujours une chaîne. Seul
 * « true » vaut vrai : une valeur absente, vide ou inattendue reste fausse, ce
 * qui fait qu'un réglage sensible — comme l'envoi Telegram — est éteint par
 * défaut plutôt qu'allumé par accident.
 */
const boolFromEnv = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined ? fallback : value.trim().toLowerCase() === "true"));

export const apiEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: url,
  REDIS_URL: url,
  CORS_ORIGIN: origin.default("http://localhost:3000"),
  INTERNAL_API_KEY: z.string().min(32),
  RESUME_RETENTION_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  AI_PROVIDER: z.enum(["disabled", "openai"]).default("disabled"),
  OPENAI_API_KEY: z.string().default(""),
  SEARCH_API_PROVIDER: z.enum(["disabled", "brave", "serper"]).default("disabled"),
  SEARCH_API_KEY: z.string().default(""),
});

export const workerEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  REDIS_URL: url,
  DATABASE_URL: url,
  /*
   * La recherche web est facultative : sans clé, le worker collecte quand même
   * les entreprises déjà connues du registre, il ne découvre simplement rien de
   * nouveau. La clé reste côté serveur — jamais dans le navigateur ni un log.
   */
  BRAVE_SEARCH_API_KEY: z.string().min(1).optional(),
  /// Cron de la collecte. Toutes les 4 heures par défaut, heure de Paris.
  JOB_COLLECTION_CRON: z.string().min(1).default("0 */4 * * *"),
  JOB_COLLECTION_TIMEZONE: z.string().min(1).default("Europe/Paris"),
  /// Plafond de requêtes de recherche par cycle, pour borner la découverte.
  WEB_SEARCH_MAX_QUERIES_PER_RUN: z.coerce.number().int().min(0).default(6),

  /*
   * Telegram. Éteint par défaut, et en simulation par défaut : sans les deux
   * interrupteurs à « true » et un token, rien n'est envoyé. Le token reste
   * côté serveur — jamais dans le navigateur, un log ou la base.
   */
  TELEGRAM_NOTIFICATIONS_ENABLED: boolFromEnv(false),
  TELEGRAM_DRY_RUN: boolFromEnv(true),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_CHAT_ID: z.string().min(1).optional(),
  TELEGRAM_MAX_JOBS_PER_MESSAGE: z.coerce.number().int().min(1).max(20).default(8),
  TELEGRAM_MAX_JOBS_PER_RUN: z.coerce.number().int().min(1).default(30),
  /// URL publique du site, pour les liens « Analyser sur le site ».
  APP_URL: url.optional(),
});

export const webEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: url,
});

/*
 * Ce dont l'accès à la base a besoin, et rien d'autre. Séparé de `apiEnvSchema`
 * pour qu'ouvrir une connexion n'exige pas la clé des endpoints internes ni
 * l'URL Redis : un contexte qui ne touche qu'à PostgreSQL ne doit pas échouer
 * parce qu'une variable sans rapport manque.
 */
export const databaseEnvSchema = z.object({
  DATABASE_URL: url,
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;
export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;

export const parseApiEnv = (env: NodeJS.ProcessEnv): ApiEnv => apiEnvSchema.parse(env);
export const parseWorkerEnv = (env: NodeJS.ProcessEnv): WorkerEnv => workerEnvSchema.parse(env);
export const parseWebEnv = (env: NodeJS.ProcessEnv): WebEnv => webEnvSchema.parse(env);
export const parseDatabaseEnv = (env: NodeJS.ProcessEnv): DatabaseEnv =>
  databaseEnvSchema.parse(env);
