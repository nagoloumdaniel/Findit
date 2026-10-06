# Architecture Findit (Web Intelligence Agent)

Ce document décrit l'architecture réelle du dépôt au 2026-10-06, après le pivot vers un agent
autonome de collecte web. Le cahier des charges est
[CAHIER_DES_CHARGES.md](../CAHIER_DES_CHARGES.md) ; la source de vérité opérationnelle détaillée
reste [roadmap.md](../roadmap.md).

Le dépôt et les paquets gardent le nom `findit` / `@findit/*` : le renommage n'a pas eu lieu.

## Flux principal

```text
Visiteur public / navigateur
    |
    v
Next.js web (port 3100)
    |
    +--> pages publiques : /, /offres/[slug]
    |
    +--> dashboard d'administration : /dashboard et ses huit sections (sans authentification)
    |
    v
API NestJS/Fastify (port 4000)
    |
    +--> routes synchrones (offres, agent, matching) et validations d'entrée Zod
    |
    +--> PostgreSQL en ligne, Neon, TLS obligatoire, via Prisma

Worker NestJS (processus séparé, même file BullMQ)
    |
    +--> Redis / BullMQ, file `job-pipeline`, concurrence 1
    |
    +--> trois planifications dans la même file :
          |
          +--> ATS natifs      : Greenhouse, Lever, Workable, Workday, France Travail
          |                      + découverte Brave, si BRAVE_SEARCH_API_KEY
          |                      + registre Connector / CompanySource
          |                      + normalisation, classification, déduplication, ingestion, ProcessingLog
          |
          +--> job boards      : Welcome to the Jungle, HelloWork, Indeed via Apify
          |                      montés seulement si SCRAPED_SOURCES_ENABLED=true ET jeton Apify
          |
          +--> agent autonome  : Search -> Crawl -> Extract -> Store (voir section suivante)
          |
    +--> Telegram, si explicitement activé (TELEGRAM_NOTIFICATIONS_ENABLED + token + chat)
```

Le web ne se connecte jamais directement à PostgreSQL ou Redis. Il appelle l'API. Les pages
publiques et le dashboard lisent l'API côté serveur (`apps/web/src/lib/api.ts`) ; le formulaire de
matching appelle l'API depuis le navigateur via `NEXT_PUBLIC_API_URL`.

## Flux de l'agent autonome

L'entrée est `runAgent(objective, deps)` dans `packages/orchestrator/src/run-agent.ts`. Le pipeline
est une séquence fixe : aucune boucle d'outils pilotée par le modèle.

```text
Objectif (AGENT_OBJECTIVE)
    |
    v
@findit/agent : generateSearchQueries(objective)
    |   requêtes déduites de l'objectif par règles (contrat, techno, lieu, site:), sans appel modèle
    v
Brave Search, si BRAVE_SEARCH_API_KEY existe (sinon aucun résultat)
    |
    v
@findit/agent : scoreSources(resultats)
    |   score 0-100 et seuil de conservation (40 par défaut), raisons en français
    v
@findit/agent : AgentMemory (VISITED_URL)
    |   une URL déjà visitée n'est pas re-crawlée dans le run
    v
@findit/crawler : crawl borné
    |   profondeur 2, 20 pages/source, 50 pages/run, 5 minutes/run, robots.txt respecté
    v
Porte déterministe avant le modèle
    |   une page hors 2xx est écartée ; une page qui ne nomme aucun contrat du
    |   périmètre (`mentionsPerimeterContract`) n'appelle pas le modèle du tout
    v
@findit/extract : extraction spécialisée puis LLM, page par page
    |   données structurées `JobPosting` (JSON-LD) d'abord, déterministes et gratuites ;
    |   DeepSeek ensuite ; schéma Zod validé après coup, exclusion déterministe des écoles
    v
Validation puis déduplication par titre normalisé, dans le run
    |
    v
@findit/persist : classification, localisation, date, déduplication, insertion
    |
    v
AgentRun / AgentAction / AgentError en base
```

- Une page hors 2xx (réponse d'erreur servie) n'est ni relue ni extraite : c'est une réponse, pas une
  page d'offres. Le statut 0 reste traité par la relecture, puisque « jamais lue » n'est pas « erreur ».
- Avant l'extraction, une **porte déterministe** lit le même contenu que le modèle recevrait : si la
  page ne nomme aucun contrat du périmètre (alternance, apprentissage, stage…), le modèle n'est pas
  appelé. Mesuré avant la porte : 127 offres extraites d'un board hors périmètre, 101 rejetées faute
  de contrat, zéro insérée — chaque page payait un appel pour rien. La porte se remplace via
  `pageGate`. C'est un garde-fou de coût, pas un classifieur : un faux positif coûte un appel, un
  faux négatif ferait perdre une offre, donc le vocabulaire est volontairement large.
- Une page vide est relue une fois de façon bornée (`recoverPage`, câblée sur le crawler, donc
  `robots.txt` revérifié et repli navigateur conservé) avant d'être abandonnée.
- Les étapes de récupération sont enchaînées par `packages/orchestrator/src/recovery.ts` : relecture,
  extraction spécialisée, extraction LLM. Seul un **échec** est relancé ; une stratégie qui a tourné
  sans rien trouver passe la main. Quand tout est épuisé, la page est abandonnée avec sa raison dans
  `AgentError` et `retried = true`. Bornes : `maxRecoveries` (5 relectures par run),
  `maxAttemptsPerStep` (2) et `maxTotalAttempts` (6).
- Statuts de fin : `RUNNING`, puis `SUCCEEDED`, `FAILED` ou `STOPPED`. `STOPPED` signale une borne
  de temps atteinte (arrêt volontaire), pas une erreur.
- Bornes par défaut : 10 requêtes, 2 de profondeur, 20 pages par source, 50 pages et 5 minutes par
  run (`packages/orchestrator/src/config.ts`).
- `persistOffers` écrit directement des offres `PUBLISHED` après classification de contrat/métier,
  contrôle de localisation Île-de-France, contrôle d'école et déduplication. L'agent n'emprunte pas
  `@findit/job-pipeline`, donc ni élection de source canonique ni quarantaine pour ses offres.
- Un run unique hors BullMQ est disponible pour vérifier la boucle
  (`apps/worker/run-agent-once.ts`) ; il exige `DEEPSEEK_API_KEY` et `BRAVE_SEARCH_API_KEY`.

## Périmètre métier

Le contrat partagé `@findit/shared` fixe le périmètre commun.

| Axe       | Valeurs                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| Contrats  | `ALTERNANCE`, `INTERNSHIP`                                                                                               |
| Métiers   | `FRONTEND`, `BACKEND`, `FULLSTACK`, `SOFTWARE_ENGINEERING`, `OTHER_DEVELOPER`, `MOBILE`, `DATA_ANALYST`, `DATA_ENGINEER` |
| Zone      | Île-de-France : 75, 77, 78, 91, 92, 93, 94, 95                                                                           |
| Fraîcheur | 3 jours par défaut (`LAST_72H`), 24 heures comme resserrement possible, 3 jours comme plafond absolu                     |

Stocker et montrer sont deux choses distinctes. Le périmètre dit ce qui a le droit d'exister en
base ; le défaut d'affichage, lui, se limite aux alternances des cinq métiers du développement
(`FRONTEND`, `BACKEND`, `FULLSTACK`, `SOFTWARE_ENGINEERING`, `OTHER_DEVELOPER`). Une offre hors de
ce défaut reste collectée, stockée et atteignable par un filtre : changer d'avis est un réglage,
jamais une migration.

Les offres hors périmètre sont refusées par la classification, la résolution de localisation ou les
contraintes de stockage.

## Applications

| Application   | Rôle                    | État réel                                                                                                                          |
| ------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`    | Interface Next.js 16    | Site public `/` (recherche, filtres, détail) et dashboard d'administration `/dashboard` et ses huit sections ; aucun garde d'accès |
| `apps/api`    | API NestJS/Fastify      | Santé, offres, agent, matching ; aucune route d'authentification ni d'espace privé                                                 |
| `apps/worker` | Traitements asynchrones | Une file BullMQ en concurrence 1, trois planifications (ATS, job boards, agent), Telegram                                          |

## Packages

Dix-sept paquets réels.

| Package                      | Rôle                                                                                             | État réel                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `@findit/shared`             | Contrats de périmètre (contrats, métiers, zone, fraîcheur)                                       | Actif                                    |
| `@findit/config`             | Schémas Zod, chargement `.env` racine                                                            | Actif                                    |
| `@findit/database`           | Schéma Prisma, migrations, client, seed, annuaire d'employeurs                                   | Actif, migrations additives              |
| `@findit/ui`                 | Composants d'interface réutilisables (`PageShell`)                                               | Actif                                    |
| `@findit/job-connectors`     | ATS, job boards Apify, découverte Brave, registre de conformité, robots, garde de budget         | Actif ; job boards éteints par défaut    |
| `@findit/job-normalization`  | Nettoyage HTML et comparaison des offres, résolution de commune                                  | Actif                                    |
| `@findit/job-classification` | Décisions contrat, métier, lieu, école et risque                                                 | Actif                                    |
| `@findit/job-deduplication`  | Similarité et décision de doublon                                                                | Actif, décision écrite en base           |
| `@findit/job-pipeline`       | Ingestion, élection de la source canonique, lien d'apply                                         | Actif ; non utilisé par l'agent autonome |
| `@findit/notifications`      | Alertes Telegram, résumé de run et commandes du bot                                              | Actif                                    |
| `@findit/ai`                 | Client DeepSeek et sorties structurées validées par Zod                                          | Actif                                    |
| `@findit/agent`              | Requêtes de recherche, scoring de sources, mémoire et magasins de run                            | Actif                                    |
| `@findit/crawler`            | Crawl borné, robots.txt, HTTP et rendu                                                           | Actif                                    |
| `@findit/extract`            | Extraction `JobPosting` JSON-LD déterministe puis DeepSeek, validation Zod, exclusion des écoles | Actif                                    |
| `@findit/orchestrator`       | Pipeline de l'agent (`runAgent`), cascade de récupération et bornes de run                       | Actif                                    |
| `@findit/persist`            | Écriture des offres extraites (classification, localisation, déduplication)                      | Actif                                    |
| `@findit/matching`           | Structuration du CV et score CV/offre via DeepSeek, sous-scores déterministes                    | Actif                                    |

Les paquets `@findit/documents`, `@findit/matching-engine` et `@findit/resume-parser` n'existent
plus.

## Routes HTTP présentes

Toutes publiques : aucune route ne porte de garde ni d'en-tête d'authentification.

| Méthode | Chemin                 | État                                  |
| ------- | ---------------------- | ------------------------------------- |
| `GET`   | `/health`              | Santé API                             |
| `GET`   | `/api/jobs`            | Liste et recherche d'offres           |
| `GET`   | `/api/jobs/stats`      | Compteurs 24 h / 72 h                 |
| `GET`   | `/api/jobs/filters`    | Valeurs de filtres réellement en base |
| `GET`   | `/api/jobs/:slug`      | Détail d'offre                        |
| `GET`   | `/api/agent/runs`      | Liste des runs                        |
| `GET`   | `/api/agent/stats`     | Compteurs de l'agent                  |
| `GET`   | `/api/agent/analytics` | Analytique de l'agent                 |
| `GET`   | `/api/agent/sources`   | Sources suivies                       |
| `GET`   | `/api/agent/runs/:id`  | Détail d'un run                       |
| `POST`  | `/api/matching/score`  | Score CV/offre, corps `{ cvText }`    |

Le site Next.js porte `GET /`, `GET /offres/:slug`, `GET /dashboard` et les sections
`/dashboard/{analytics,sources,jobs,crawls,agent,matching,logs,config}`. Il n'y a plus de page
`/candidatures`, plus de `/espace`, et plus aucun proxy `ALL /api/ws/*` : le dossier
`apps/web/src/app/api` est vide.

`POST /api/matching/score` structure le CV (DeepSeek) puis note les 15 offres publiées les plus
récentes, une par une, via DeepSeek. Le score est indicatif, encadré par des garde-fous
déterministes (court-circuit sans matière, filtrage des compétences non présentes dans le CV ou
l'offre) ; il n'est pas stocké en base, faute de table de correspondance.

Routes absentes de l'API : authentification utilisateur, analyse GitHub, export DOCX,
administration, webhook ou commandes Telegram en HTTP.

## Planifications du worker

Les trois planifications vivent dans la même file `job-pipeline`, avec un seul consommateur en
concurrence 1 : deux cycles ne se chevauchent jamais. `upsertJobScheduler` est idempotent ; un
interrupteur à `false` retire la planification (et ne l'ignore pas seulement).

| Planification | Nom du job           | Cron par défaut | Montée si                      |
| ------------- | -------------------- | --------------- | ------------------------------ |
| ATS natifs    | `collection-cycle`   | `0 */4 * * *`   | toujours                       |
| Job boards    | `scraped-collection` | `0 6 * * *`     | `SCRAPED_SOURCES_ENABLED=true` |
| Agent         | `agent-run`          | `0 8 * * *`     | `AGENT_RUN_ENABLED=true`       |

Toutes utilisent `JOB_COLLECTION_TIMEZONE` (défaut `Europe/Paris`). Les crons sont réglables par
`JOB_COLLECTION_CRON`, `SCRAPED_COLLECTION_CRON` et `AGENT_COLLECTION_CRON`.

- Cycle ATS : Greenhouse, Lever, Workday par jeton d'entreprise, Workable par recherche,
  France Travail par API officielle si les identifiants existent, plus la découverte Brave. Les
  sources découvertes passent par le registre (`CompanySource`, `Connector`) avant de pouvoir
  tourner.
- Cycle job boards : la planification est montée dès que l'interrupteur est à `true`, mais les
  connecteurs ne sont construits que si `APIFY_API_TOKEN` existe aussi
  (`apps/worker/src/collection/scraped-sources.ts`). Welcome to the Jungle, HelloWork et Indeed
  sont triés du moins coûteux au plus cher.
- Run de l'agent : refuse de démarrer sans `DEEPSEEK_API_KEY` (erreur explicite) ; Telegram reçoit
  un résumé du run sous les mêmes interrupteurs que les cycles.

Les job boards s'exécutent aussi à la demande, hors cron, par `pnpm board:proof`.

## Données et conformité

- Les sources collectables viennent du registre de [docs/legal-compliance.md](legal-compliance.md),
  synchronisé par `pnpm registry:sync`.
- Une source non autorisée par le registre ne doit pas s'exécuter : la permission est portée par un
  type (`SourceAccessStatus`), pas par une déclaration dans le code du connecteur.
- `OWNER_ACCEPTED_SCRAPING` désigne un accès **toléré, non autorisé** : le propriétaire assume le
  risque, et ce régime reste distinct de `PUBLIC_FEED`. `PROHIBITED`, `DISABLED_PENDING_PERMISSION`,
  `SEARCH_ENGINE_DISCOVERY_ONLY` et `MANUAL_IMPORT` sont refusés ; l'accès est aussi refusé si les
  conditions de la source n'ont pas été vérifiées depuis plus de 90 jours.
- Brave sert uniquement à découvrir des sources. Les résultats de recherche restent transitoires et
  ne sont pas stockés comme offres.
- Les domaines découverts doivent passer les contrôles robots et signaux de contenu avant
  enregistrement. Pour Workday, le `robots.txt` du locataire est relu avant chaque collecte.
- Les sources payantes (Apify) passent par une garde de budget : plafond par cycle et par mois, coût
  consigné dans `ConnectorRun`, dépassement qui arrête la source sans arrêter le cycle.
- Une offre dont la source est un job board n'est jamais republiée entière : l'API n'en expose
  qu'un extrait de 320 caractères coupé sur un mot, plus un lien vers l'origine
  (`apps/api/src/jobs/job-origin.ts`). La description complète reste en base et sert le matching.
- Les offres de démonstration restent marquées `isDemo = true` ; `pnpm db:seed` est un outil de
  développement manuel. L'état de la base en ligne n'est pas vérifiable depuis le dépôt.

Schéma Prisma : 31 modèles, **aucun modèle `User`**.

- Offres et entreprises : `Company`, `Job`, `JobSource`, `Skill`, `JobSkill`, `CompanyAlias`,
  `CompanySource`, `CompanyClassification`, `SkillAlias`, `Source`, `Contact`.
- Collecte et conformité : `Connector`, `ConnectorRun`, `ConnectorError`, `JobSourceSnapshot`.
- Décisions et journal : `DuplicateGroup`, `DuplicateDecision`, `JobClassificationDecision`,
  `SchoolDetectionDecision`, `FraudDetectionDecision`, `ProcessingLog`, `PromptVersion`,
  `TelegramJobNotification`.
- Agent : `AgentRun`, `AgentAction`, `AgentError`, `AgentMemory`, `SearchQuery`, `CrawlJob`,
  `CrawlPage`, `Extraction`.

Les tables de l'ancien espace privé (`CandidateProfile`, `SourceResume`, `SourceCoverLetter`,
`SourceResumeMatch`, `Application`, `ApplicationEvent`, `JobMatch`, `Resume`, `ResumeAnalysis`)
ont été supprimées par la migration `20261006120000_agent_and_remove_private`.

## Configuration et ports

Chaque runtime lit la configuration via `@findit/config` et échoue vite si une variable requise est
invalide.

| Runtime | Variables principales                                                                                                                                                                                                                                                                                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web     | `WEB_PORT` (lue par `apps/web/run-next.mjs`, défaut 3100), `NEXT_PUBLIC_API_URL`                                                                                                                                                                                                                                                                                                  |
| API     | `API_PORT`, `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGIN`, `INTERNAL_API_KEY`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`                                                                                                                                                                                                                                                                  |
| Worker  | `DATABASE_URL`, `REDIS_URL`, `JOB_COLLECTION_CRON`, `JOB_COLLECTION_TIMEZONE`, `BRAVE_SEARCH_API_KEY`, `WEB_SEARCH_MAX_QUERIES_PER_RUN`, `APIFY_API_TOKEN`, `SCRAPED_SOURCES_ENABLED`, `SCRAPED_COLLECTION_CRON`, `SCRAPING_*`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `AGENT_RUN_ENABLED`, `AGENT_COLLECTION_CRON`, `AGENT_OBJECTIVE`, `FRANCETRAVAIL_*`, `TELEGRAM_*`, `APP_URL` |

`INTERNAL_API_KEY` est **héritée** : `parseApiEnv` l'exige encore (minimum 32 caractères) et l'API
refuse de démarrer sans elle, mais plus aucun code ne la lit. Il n'y a ni proxy Next, ni
`WorkspaceGuard`, ni en-tête `x-workspace-key` : la variable ne protège plus rien.

Findit utilise `3100` pour le web et `4000` pour l'API en local. Le port `3000` ne doit pas être
utilisé pour ce projet.

La base est en ligne (Neon) et exige TLS. Redis reste local. Un `DATABASE_URL` distant sans TLS
doit faire échouer le démarrage.

## Limites connues

- Aucune authentification, aucun modèle `User` : le dashboard d'administration et toutes les routes
  de l'API sont accessibles à qui atteint le service. Une instance publique doit être protégée
  entièrement par le reverse proxy.
- `.env.example` ne déclare pas `AGENT_RUN_ENABLED`, `AGENT_COLLECTION_CRON` ni `AGENT_OBJECTIVE`,
  alors que le worker les lit (défauts respectifs : `false`, `0 8 * * *`, objectif alternance/stage
  en Île-de-France).
- `CORS_ORIGIN` a pour défaut `http://localhost:3000` dans `packages/config/src/env.ts`, un port
  interdit pour ce projet ; `.env.example` règle bien 3100, mais une variable absente retombe sur ce
  défaut.
- `SEARCH_API_PROVIDER` et `SEARCH_API_KEY` (schéma API) ainsi que `SCRAPEGRAPH_API_KEY` (schéma
  worker) sont déclarés et présents dans `.env.example`, mais lus nulle part ailleurs.
- Le rôle applicatif de la base en ligne n'est pas propriétaire du schéma : une migration qui change
  la structure doit être appliquée avec une connexion propriétaire, puis réconciliée par
  `migrate resolve`. L'incident s'est produit deux fois.
- `DATABASE_URL_OWNER` existe dans le `.env` local mais n'est déclaré nulle part dans le code ni
  dans `.env.example`.
- Reprise en cascade partielle : la relecture de page vide, l'extraction `JobPosting` JSON-LD avant
  le LLM et l'abandon journalisé (`AgentError.retried = true`) sont livrés. L'étape « connecteurs
  spécialisés en repli » (CDC §4.7, étape 3) n'est pas câblée dans l'agent : il n'invoque pas
  `@findit/job-connectors` comme secours.
- Pas de boucle d'outils pilotée par le modèle : la séquence `runAgent` est fixe et le LLM ne sert
  qu'à l'extraction page par page (et, côté matching, à la structuration du CV et au score).
- Les job boards et l'agent autonome sont éteints par défaut (`SCRAPED_SOURCES_ENABLED=false`,
  `AGENT_RUN_ENABLED=false`) ; les job boards ne tournent que par `pnpm board:proof`.
- Le workflow CI est écrit dans `.github/workflows/ci.yml`, mais l'état du compte GitHub et
  l'exécution réelle des Actions ne sont pas vérifiables depuis le dépôt.
- L'analyse GitHub et l'export DOCX n'existent pas ; la génération de CV et de lettres a été
  supprimée avec les paquets et tables de l'espace privé.
