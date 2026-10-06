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
  CORS_ORIGIN: origin.default("http://localhost:3100"),
  INTERNAL_API_KEY: z.string().min(32),
  /*
   * Fournisseur IA : DeepSeek uniquement (décision du propriétaire, voir
   * HANDOFF.md). La clé de plateforme est obligatoire - sans elle, la couche IA
   * refuse de s'initialiser plutôt que d'échouer plus loin. Jamais exposée au
   * navigateur ni loggée.
   */
  DEEPSEEK_API_KEY: z.string().min(1),
  /// Modèle DeepSeek. deepseek-flash par défaut ; deepseek-v4-pro pour le
  /// raisonnement fort (voir HANDOFF.md §6).
  DEEPSEEK_MODEL: z.string().min(1).default("deepseek-flash"),
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
  /*
   * Job boards scrape : allumé par défaut depuis le 2026-10-07. Mesuré, c'est la
   * seule famille de sources qui rend : 12 à 13 offres acceptées par cycle, contre
   * 0 sur 4 251 pages d'entreprises et 2 (déjà connues) sur 13 offres France
   * Travail. Le coût est borné deux fois — plafond par cycle et plafond mensuel —
   * et sans `APIFY_API_TOKEN` le cycle ne collecte rien.
   */
  SCRAPED_SOURCES_ENABLED: boolFromEnv(true),
  /// Cron du cycle des sources scrapées. Une fois par jour à 6 h, heure de Paris.
  SCRAPED_COLLECTION_CRON: z.string().min(1).default("0 6 * * *"),
  /*
   * Résultats par run. Mesuré le 2026-10-07 : deux cycles identiques dos à dos
   * ont rendu les mêmes 57 offres, accepté les mêmes 13, et n'ont ajouté AUCUNE
   * offre nouvelle pour 0,052 $ puis 0,064 $. La première page concentre la
   * fraîcheur — HelloWork accepte 7 offres sur 8 quand on lui en demande 8, mais
   * 8 sur 40 quand on lui en demande 40. Les plafonds sont donc serrés : payer
   * des pages profondes revient à racheter ce qu'on a déjà.
   */
  /// Résultats par run pour Welcome to the Jungle.
  SCRAPING_WTTJ_MAX_ITEMS: z.coerce.number().int().min(1).max(100).default(15),
  /// Résultats par run pour HelloWork.
  SCRAPING_HELLOWORK_MAX_ITEMS: z.coerce.number().int().min(1).max(100).default(15),
  /// Résultats par run pour Indeed.
  SCRAPING_INDEED_MAX_ITEMS: z.coerce.number().int().min(1).max(100).default(20),
  APIFY_API_TOKEN: z.string().min(1).optional(),

  /// Clé DeepSeek, partagée avec l'API. Requise seulement quand l'agent est
  /// allumé (`AGENT_RUN_ENABLED=true`) ; absente, le worker démarre quand même
  /// pour les cycles de collecte.
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  /// Modèle DeepSeek. deepseek-flash par défaut ; deepseek-v4-pro pour le fort.
  DEEPSEEK_MODEL: z.string().min(1).default("deepseek-flash"),

  /*
   * Agent autonome (Search → Crawl → Extract → Store). Éteint par défaut : un
   * run dépense des appels LLM (DeepSeek) et des requêtes web réels. Même
   * allumé, il faut DEEPSEEK_API_KEY pour que le modèle s'initialise.
   */
  AGENT_RUN_ENABLED: boolFromEnv(false),
  /// Cron du run quotidien de l'agent. 8 h, heure de Paris.
  /*
   * Découverte seule : l'agent cherche, choisit et enregistre des entreprises,
   * sans crawler ni extraire. Mesuré : 0 offre acceptée sur 4 251 pages
   * d'entreprises, contre 10 entreprises entrées au registre pour 812 µ$.
   */
  AGENT_DISCOVERY_ONLY: boolFromEnv(false),
  AGENT_COLLECTION_CRON: z.string().min(1).default("0 8 * * *"),
  /// Objectif par défaut de l'agent, en langage naturel.
  AGENT_OBJECTIVE: z.string().min(1).default("alternance et stage développeur en Île-de-France"),

  /*
   * Tarif DeepSeek, en dollars par million de tokens. Facultatif : les tokens
   * consommés sont relevés dans tous les cas, mais un coût ne se déduit pas sans
   * tarif. Le renseigner depuis le compte, jamais depuis une supposition.
   */
  DEEPSEEK_INPUT_USD_PER_MTOK: z.coerce.number().min(0).optional(),
  DEEPSEEK_OUTPUT_USD_PER_MTOK: z.coerce.number().min(0).optional(),

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
