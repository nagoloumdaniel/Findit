import { z } from "zod";

const nodeEnv = z.enum(["development", "test", "production"]).default("development");
const url = z.url().transform((value) => new URL(value).toString());
const origin = z.url().transform((value) => new URL(value).origin);

/**
 * Booléen lu depuis une variable d'environnement, toujours une chaîne. Seul
 * « true » vaut vrai : une valeur absente, vide ou inattendue reste fausse, ce
 * qui fait qu'un réglage sensible - comme l'envoi Telegram - est éteint par
 * défaut plutôt qu'allumé par accident.
 */
/*
 * Une base distante doit passer en TLS. Une base locale (poste de développement)
 * reste libre. Le message ne reprend jamais l'URL : elle contient le mot de passe.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const TLS_MODES = new Set(["require", "verify-ca", "verify-full"]);
const databaseUrl = url.refine(
  (value) => {
    const parsed = new URL(value);
    if (LOCAL_HOSTS.has(parsed.hostname)) return true;
    return TLS_MODES.has(parsed.searchParams.get("sslmode") ?? "");
  },
  {
    message:
      "DATABASE_URL distante sans TLS : ajouter sslmode=require (ou verify-full) à l'URL. Valeur masquée.",
  },
);

const boolFromEnv = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined ? fallback : value.trim().toLowerCase() === "true"));

export const apiEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: databaseUrl,
  REDIS_URL: url,
  CORS_ORIGIN: origin.default("http://localhost:3000"),
  INTERNAL_API_KEY: z.string().min(32),
  RESUME_RETENTION_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  /*
   * Fournisseur IA. Retenu : IA locale via Ollama - le modèle tourne sur la
   * machine, rien ne part en ligne. Pas de clé, pas de token facturé, et la
   * question ai-train/ai-input de Lever disparaît : aucune donnée ne quitte le
   * poste. Voir docs/legal-compliance.md. Éteint par défaut.
   */
  AI_PROVIDER: z.enum(["disabled", "ollama"]).default("disabled"),
  /// Serveur Ollama local. Jamais exposé au navigateur.
  OLLAMA_BASE_URL: url.default("http://localhost:11434"),
  /// Modèles par usage. Un seul modèle local pour l'instant ; deux variables
  /// pour pouvoir spécialiser plus tard sans changer les appelants.
  AI_MODEL_REASONING: z.string().min(1).default("qwen2.5:7b"),
  AI_MODEL_EXTRACTION: z.string().min(1).default("qwen2.5:7b"),
  SEARCH_API_PROVIDER: z.enum(["disabled", "brave", "serper"]).default("disabled"),
  SEARCH_API_KEY: z.string().default(""),
});

export const workerEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  REDIS_URL: url,
  DATABASE_URL: databaseUrl,
  /*
   * La recherche web est facultative : sans clé, le worker collecte quand même
   * les entreprises déjà connues du registre, il ne découvre simplement rien de
   * nouveau. La clé reste côté serveur - jamais dans le navigateur ni un log.
   */
  BRAVE_SEARCH_API_KEY: z.string().min(1).optional(),
  /// Cron de la collecte. Toutes les 4 heures par défaut, heure de Paris.
  JOB_COLLECTION_CRON: z.string().min(1).default("0 */4 * * *"),
  JOB_COLLECTION_TIMEZONE: z.string().min(1).default("Europe/Paris"),
  /// Plafond de requêtes de recherche par cycle, pour borner la découverte.
  WEB_SEARCH_MAX_QUERIES_PER_RUN: z.coerce.number().int().min(0).default(6),

  /*
   * Plafonds de dépense des sources payantes (acteurs Apify), en dollars. Le
   * défaut part du plan gratuit (5 $ de crédit par mois) avec 10 % de marge ;
   * le cycle est plafonné à 0,15 $, soit un mois de 30 cycles quotidiens sous
   * 4,5 $. Zéro coupe toute source payante. Un plan plus large se règle ici,
   * sans toucher au code.
   */
  SCRAPING_BUDGET_MONTHLY_USD: z.coerce.number().min(0).max(1000).default(4.5),
  SCRAPING_BUDGET_CYCLE_USD: z.coerce.number().min(0).max(1000).default(0.15),

  /*
   * Fournisseurs de scraping. Facultatifs : sans jeton, la source correspondante
   * n'est simplement pas montée dans le cycle. Les secrets restent côté serveur -
   * jamais dans le navigateur, un log, une URL ni un fichier suivi.
   */
  /*
   * Les job boards lus par Apify s'exécutent dans un cycle quotidien à part, et
   * seulement quand le propriétaire l'a décidé : éteint par défaut, parce que
   * chaque run dépense du crédit. Même allumé, il faut le jeton Apify.
   */
  SCRAPED_SOURCES_ENABLED: boolFromEnv(false),
  /// Cron du cycle des sources scrapées. Une fois par jour à 6 h, heure de Paris.
  SCRAPED_COLLECTION_CRON: z.string().min(1).default("0 6 * * *"),
  /// Résultats par run pour Welcome to the Jungle. 30 tient le plan gratuit.
  SCRAPING_WTTJ_MAX_ITEMS: z.coerce.number().int().min(1).max(100).default(30),
  /// Résultats par run pour HelloWork. 40 tient le plan gratuit.
  SCRAPING_HELLOWORK_MAX_ITEMS: z.coerce.number().int().min(1).max(100).default(40),
  APIFY_API_TOKEN: z.string().min(1).optional(),
  SCRAPEGRAPH_API_KEY: z.string().min(1).optional(),

  /*
   * France Travail (API officielle, francetravail.io). Facultatif : sans les
   * deux identifiants du compte partenaire, le cycle collecte simplement sans
   * cette source. Les identifiants restent côté serveur - jamais dans le
   * navigateur ni un log.
   */
  FRANCETRAVAIL_CLIENT_ID: z.string().min(1).optional(),
  FRANCETRAVAIL_CLIENT_SECRET: z.string().min(1).optional(),

  /*
   * Telegram. Éteint par défaut, et en simulation par défaut : sans les deux
   * interrupteurs à « true » et un token, rien n'est envoyé. Le token reste
   * côté serveur - jamais dans le navigateur, un log ou la base.
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
  DATABASE_URL: databaseUrl,
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
