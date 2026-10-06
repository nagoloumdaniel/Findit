# Findit — Web Intelligence Agent

[![CI](https://github.com/nagoloumdaniel/Findit/actions/workflows/ci.yml/badge.svg)](https://github.com/nagoloumdaniel/Findit/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/Node-24.18%20LTS-339933?logo=node.js&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-11.13.1-F69220?logo=pnpm&logoColor=white)
![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-EF4444?logo=turborepo&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis%2FBullMQ-queues-DC382D?logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-non%20specifiee-lightgrey)

> Agent autonome de collecte web : il découvre, crawle, extrait et publie des offres d'alternance et de stage en développement en Île-de-France.

## Description

Depuis le pivot du **2026-10-06**, le produit s'appelle **Web Intelligence Agent**. Le dépôt, les paquets (`@findit/*`) et la base conservent le nom `findit`.

L'agent reçoit un objectif en langage naturel, en déduit des requêtes de recherche, note les sources web qui remontent, les crawle dans des bornes strictes, extrait les offres page par page avec DeepSeek, les valide, les déduplique et les persiste. Un site public expose les offres retenues ; un dashboard d'administration expose l'état des runs, des sources, de l'analyse et du matching CV.

- Site public : http://localhost:3100
- API : http://localhost:4000
- Dashboard : http://localhost:3100/dashboard

## L'agent

Pipeline du cahier des charges (`CAHIER_DES_CHARGES.md` §4) : Search → Discover → Crawl → Read → Extract → Analyze → Validate → Deduplicate → Store → Publish → Report.

L'implémentation est un pipeline **déterministe**, dans `packages/orchestrator/src/run-agent.ts` :

| Étape        | Implémentation                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Search       | `generateSearchQueries` (`@findit/agent`)                                                                              |
| Discover     | `scoreSources` : seules les sources au-dessus du seuil sont crawlées                                                   |
| Crawl        | `@findit/crawler` : HTTP, repli Playwright, `robots.txt`, suivi des liens, bornes `maxDepth`/`maxPages`/`maxRuntimeMs` |
| Read/Extract | `extractJobsFromPage` page par page (`@findit/extract`), via DeepSeek ; les écoles sont écartées                       |
| Validate     | `isValidOffer`                                                                                                         |
| Deduplicate  | titre normalisé, au sein du run                                                                                        |
| Store        | `persistOffers` (`@findit/persist`)                                                                                    |
| Memory       | `AgentRunStore` / `AgentMemory` : une URL déjà vue n'est pas re-crawlée dans le run                                    |

Une étape qui échoue est consignée dans `AgentError` et n'interrompt pas le run. Un run se termine en `SUCCEEDED`, `FAILED` ou `STOPPED` (borne de temps atteinte).

La **reprise en cascade** (cahier des charges, section 4.7) est portée par `packages/orchestrator/src/recovery.ts`. Pour chaque page : relecture bornée quand le crawl l'a rendue vide, puis extraction déterministe des `schema.org JobPosting` déclarés en JSON-LD (`@findit/extract`), puis extraction par DeepSeek. Seul un échec est relancé ; une stratégie qui a tourné sans rien trouver passe la main. Quand tout est épuisé, la page est abandonnée avec sa raison dans `AgentError` et `retried` vaut `true`.

## Fonctionnalités

| Élément                         | État                   | Détail                                                                                                                                                                                                   |
| ------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo et contrôles qualité   | Disponible             | Format, lint, typecheck, tests, build sous Turborepo                                                                                                                                                     |
| Base PostgreSQL en ligne        | Disponible             | Neon, TLS obligatoire pour un hôte distant ; migrations additives uniquement                                                                                                                             |
| Redis local                     | Disponible             | Service Docker avec healthcheck, file BullMQ                                                                                                                                                             |
| Configuration validée           | Disponible             | Schémas Zod par runtime, échec rapide au démarrage                                                                                                                                                       |
| API des offres                  | Disponible             | `GET /api/jobs`, `/api/jobs/stats`, `/api/jobs/filters`, `/api/jobs/:slug`                                                                                                                               |
| Site public                     | Disponible             | Recherche par texte, filtres repliables, pagination, page de détail                                                                                                                                      |
| Dashboard d'administration      | Partiel                | `/dashboard` et 8 sections ; Jobs, Crawls, Logs et Configuration sont encore des états vides                                                                                                             |
| Agent autonome                  | Éteint par défaut      | Activé par `AGENT_RUN_ENABLED=true` avec `DEEPSEEK_API_KEY` ; cron `AGENT_COLLECTION_CRON` (défaut `0 8 * * *`, Paris)                                                                                   |
| Reprise en cascade              | Disponible             | CDC §4.7 : relecture bornée, `JobPosting` JSON-LD avant le LLM, relance des échecs, abandon journalisé (`retried`)                                                                                       |
| Recherche web de l'agent        | Éteinte sans clé Brave | `BRAVE_SEARCH_API_KEY` ; sans clé, le moteur rend une liste vide et l'agent ne découvre rien                                                                                                             |
| Registre de conformité          | Disponible             | Table `Connector`, synchronisée par `pnpm registry:sync`                                                                                                                                                 |
| Connecteurs ATS natifs          | Disponible             | Greenhouse, Lever, Workable, Workday, France Travail                                                                                                                                                     |
| Job boards (Apify)              | Allumé par défaut      | Welcome to the Jungle, HelloWork, Indeed ; `SCRAPED_SOURCES_ENABLED=true` **et** `APIFY_API_TOKEN`, cron `0 6 * * *`. Seule famille de sources qui rend : 12-13 offres acceptées par cycle, pour ~0,06 $ |
| Normalisation et classification | Disponible             | Contrat, métier, lieu, école, décision d'ingestion                                                                                                                                                       |
| Déduplication                   | Disponible             | Décision écrite, source canonique élue, sources secondaires tracées                                                                                                                                      |
| Alertes Telegram                | Éteintes par défaut    | Nouvelles offres idempotentes ; commandes `/start`, `/status`, `/latest`, `/help`                                                                                                                        |
| Matching CV / offres            | Disponible via l'API   | `POST /api/matching/score` (corps `{ cvText }`) : CV structuré par DeepSeek, score sur les 15 offres publiées les plus récentes                                                                          |
| Authentification                | Absente                | Aucun modèle `User`, aucune garde sur les routes                                                                                                                                                         |

## Périmètre métier

Contrats alternance et stage ; métiers front-end, back-end, full-stack, ingénierie logicielle, autres métiers du développement, mobile, data analyst, data engineer ; Île-de-France (75, 77, 78, 91, 92, 93, 94, 95). Voir `packages/shared/src/job-scope.ts`.

Le flux public affiche par défaut les **alternances des métiers du développement** sur **72 heures** (`freshness` par défaut : `LAST_72H`). La fenêtre de 24 h (`LAST_24H`) est un resserrement possible, et 72 h est le plafond absolu : une offre plus ancienne n'est jamais exposée.

## Stack technique

- **Monorepo** : pnpm workspaces + Turborepo
- **Web** : Next.js 16 (App Router), React 19
- **API** : NestJS 11 sur Fastify 5, Helmet, CORS
- **Worker** : NestJS + BullMQ 5, concurrence 1 (les cycles ne se chevauchent pas)
- **Base de données** : PostgreSQL en ligne (Neon) via Prisma 7 et l'adaptateur `pg` ; image `pgvector/pgvector:pg18` en local
- **File d'attente** : Redis 8 local (`redis:8.8.0-alpine`)
- **IA** : DeepSeek API via `@findit/ai` (`DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, défaut `deepseek-flash`)
- **Recherche web** : Brave (`BraveSearchProvider`, `@findit/job-connectors`)
- **Crawl** : `@findit/crawler`, HTTP puis Playwright 1.63 en repli
- **Scraping job boards** : connecteurs Apify, plafonds de dépense `SCRAPING_BUDGET_MONTHLY_USD` / `SCRAPING_BUDGET_CYCLE_USD`
- **Qualité** : ESLint 10, Prettier 3.9, Vitest 4, TypeScript 6
- **Infra locale** : Docker Compose

## Démo

Aucun déploiement public n'existe. En local : web http://localhost:3100, API http://localhost:4000, santé http://localhost:4000/health. Le port 3000 ne concerne pas ce projet.

## Installation locale

Prérequis : Node.js `>= 24.18 < 25`, pnpm 11.13.1 (via Corepack), Docker Desktop (Redis, et PostgreSQL local si vous n'utilisez pas la base en ligne).

```powershell
corepack enable
corepack prepare pnpm@11.13.1 --activate
Copy-Item .env.example .env   # puis renseigner DATABASE_URL, REDIS_URL, INTERNAL_API_KEY et DEEPSEEK_API_KEY
pnpm install
pnpm setup:hooks
pnpm infra:up        # Redis, et PostgreSQL local si vous n'utilisez pas la base en ligne
pnpm db:migrate
pnpm registry:sync   # synchronise le registre de conformité des connecteurs
```

`pnpm db:seed` insère des offres de DÉMONSTRATION (`isDemo = true`) : c'est un outil de développement, aucun chemin de production ne l'appelle. La base en ligne ne porte que des offres réelles.

Lancement :

```powershell
pnpm dev
```

- Web : http://localhost:3100
- API : http://localhost:4000
- Santé API : http://localhost:4000/health

Toutes les variables d'environnement sont documentées dans `.env.example` et validées par Zod au démarrage. L'API exige `DATABASE_URL`, `REDIS_URL`, `INTERNAL_API_KEY` (32 caractères minimum) et `DEEPSEEK_API_KEY`. Le worker démarre sans `DEEPSEEK_API_KEY` tant que l'agent reste éteint.

Qualité :

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Ces cinq commandes sont la porte de qualité ; le workflow `.github/workflows/ci.yml` les rejoue. L'état d'exécution de GitHub Actions n'est pas vérifiable depuis ce dépôt.

## Structure du monorepo

```
apps/
  web/      Interface Next.js (port 3100)
  api/      API NestJS/Fastify (port 4000)
  worker/   BullMQ : cycles ATS natifs, job boards, agent autonome, Telegram
packages/
  agent/               Cœur déterministe : requêtes, scoring, mémoire, run store
  ai/                  Client DeepSeek, sortie structurée
  config/              Schémas de configuration Zod par runtime
  crawler/             Crawl borné : HTTP + Playwright, robots.txt, liens
  database/            Schéma Prisma, migrations, seed
  extract/             Extraction d'offres page par page, exclusion des écoles
  job-classification/  Classification métier, contrat, lieu, école
  job-connectors/      Connecteurs ATS, job boards Apify, recherche Brave, registre
  job-deduplication/   Similarité et décision de doublon
  job-normalization/   Normalisation des offres
  job-pipeline/        Ingestion, décision d'ingestion, lien de candidature
  matching/            Structuration de CV et score CV/offre
  notifications/       Alertes et commandes Telegram
  orchestrator/        Boucle de l'agent (run-agent)
  persist/             Écriture des offres retenues par l'agent
  shared/              Périmètre métier partagé (job-scope)
  ui/                  Composants d'interface partagés
infrastructure/        Emplacements réservés (Docker, monitoring, scripts)
docs/                  Architecture, déploiement, conformité légale
```

Détail de l'architecture : [docs/architecture.md](docs/architecture.md). Conformité des sources collectées : [docs/legal-compliance.md](docs/legal-compliance.md).

## Limites connues

- **Pas d'authentification** : aucun modèle `User`, aucune garde sur les routes API, y compris le dashboard et `POST /api/matching/score`.
- **Reprise en cascade partielle** (§4.7 du CDC) : la relecture d'une page vide, l'extraction `JobPosting` JSON-LD avant le LLM et la relance des échecs sont livrées. Manquent l'invocation de connecteurs spécialisés en repli et, plus largement, la boucle d'outils pilotée par le LLM (§5).
- **Boucle d'outils non pilotée par le LLM** (§5 du CDC) : l'enchaînement des étapes est codé, pas décidé par le modèle.
- **Questions ouvertes** : Q-1 hébergement, Q-2 authentification, Q-3 sources de départ du MVP.
- La base de production est en ligne (Neon) et le rôle applicatif n'en est pas propriétaire : une migration de structure doit passer par une connexion propriétaire (documenté dans `HANDOFF.md` et `docs/architecture.md`).

## Licence

Aucune licence n'est déclarée dans ce dépôt pour le moment.

---

Par [Daniel Nagoloum Talla](https://github.com/nagoloumdaniel) · [Portfolio](https://nagoloum.vercel.app)
