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
![Vercel](https://img.shields.io/badge/Vercel-web%20%2B%20API-000000?logo=vercel&logoColor=white)
![Railway](https://img.shields.io/badge/Railway-worker-0B0D0E?logo=railway&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-non%20specifiee-lightgrey)

> Agent autonome de collecte web : il découvre, crawle, extrait et publie des offres d'alternance et de stage en développement en Île-de-France.

## Description

Depuis le pivot du **2026-10-06**, le produit s'appelle **Web Intelligence Agent**. Le dépôt, les paquets (`@findit/*`) et la base conservent le nom `findit`.

L'agent reçoit un objectif en langage naturel, en déduit des requêtes de recherche, note les sources web qui remontent, les crawle dans des bornes strictes, extrait les offres page par page avec DeepSeek, les valide, les déduplique et les persiste. Un site public expose les offres retenues ; un espace personnel et un dashboard d'exploitation sont protégés par un mot de passe unique. En mode découverte seule (`AGENT_DISCOVERY_ONLY`), crawl et extraction sont ignorés : le run alimente le registre `CompanySource`.

Le service est **en ligne depuis le 2026-10-07**.

## En ligne

| Brique | Hébergeur                       | Adresse                                                    | Détail                                                                                           |
| ------ | ------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Web    | Vercel, projet `finditfr`       | [finditfr.vercel.app](https://finditfr.vercel.app)         | Racine `apps/web` ; commandes dans `apps/web/vercel.json`                                        |
| API    | Vercel, projet `finditfr-api`   | [finditfr-api.vercel.app](https://finditfr-api.vercel.app) | Racine `apps/api` ; entrée serverless `apps/api/api/[...chemin].ts`                              |
| Worker | Railway, projet `findit-worker` | —                                                          | Service `worker` + service Redis ; BullMQ n'expose aucun port, la santé se lit dans les journaux |

Le routage de Vercel dans le dossier `api/` ne laisse passer qu'**un seul segment** après `/api` : mesuré le 2026-10-07, `/api/jobs` répondait alors que `/api/jobs/stats` renvoyait un 404 sans corps (donc émis par la plateforme). Cinq relais d'une ligne rétablissent la profondeur, chacun réexportant le gestionnaire unique : `api/jobs/[...chemin].ts`, `api/agent/[...chemin].ts`, `api/agent/runs/[...chemin].ts`, `api/matching/[...chemin].ts`, `api/matching/history/[...chemin].ts`. C'est un contournement, à supprimer le jour où la plateforme route les catch-all sur plusieurs segments.

Railway construit le worker avec Railpack depuis la racine (`RAILPACK_BUILD_CMD=pnpm turbo run build --filter=@findit/worker`, `RAILPACK_NODE_PLAYWRIGHT_INSTALL=1`) et le démarre par le script `start` de la racine (`node apps/worker/dist/main.js`). `Dockerfile.worker` produit la même image en local. Les variables attendues sont listées dans `railway.env.example`. Détails : [docs/deployment.md](docs/deployment.md).

## Fonctionnalités

| Élément                  | État                   | Détail                                                                                                                                             |
| ------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site public              | Disponible             | Liste, recherche par texte, filtres repliables, pagination, fiche d'offre ; `force-dynamic` conservé sur l'accueil et la fiche                     |
| Thème clair / sombre     | Disponible             | Sélecteur Clair / Sombre / Système et script anti-flash dans le `<head>` (`layout.tsx`) ; mouvement dans `motion.css`                              |
| Squelettes de chargement | Disponible             | 11 `loading.tsx` adossés à un composant `Skeleton` à 7 variantes                                                                                   |
| Cache des données        | Disponible             | 60 s pour les offres et les statistiques, 300 s pour les filtres et le détail ; `no-store` pour tout ce qui est propre à une session               |
| Espace personnel `/moi`  | Disponible             | Profil, CV, compétences, langues, expériences, liens et matchings passés                                                                           |
| Dashboard d'exploitation | Partiel                | `/dashboard` et 8 sections ; Jobs, Crawls, Logs et Configuration restent des états vides                                                           |
| Garde d'accès            | Un mot de passe unique | `/moi` **et** `/dashboard` passent par `apps/web/src/proxy.ts` : mot de passe (`PROFILE_PASSWORD`) échangé contre un cookie signé ; pas de comptes |
| API des offres           | Disponible             | `GET /api/jobs`, `/api/jobs/stats`, `/api/jobs/filters`, `/api/jobs/:slug`                                                                         |
| API de l'agent           | Disponible             | `GET /api/agent/runs`, `/stats`, `/analytics`, `/sources`, `/runs/:id`                                                                             |
| Matching CV / offres     | Disponible via l'API   | `POST /api/matching/score` (corps `{ cvText }`), `GET /api/matching/history`, `GET /api/matching/history/:id` ; CV structuré par DeepSeek          |
| API de profil            | Serveur à serveur      | `GET` / `PUT /api/profile`, protégés par l'en-tête `x-internal-key` (`ProfileKeyGuard`)                                                            |
| Agent autonome           | Éteint par défaut      | Activé par `AGENT_RUN_ENABLED=true` avec `DEEPSEEK_API_KEY` ; cron `AGENT_COLLECTION_CRON` (défaut `0 8 * * *`, Paris)                             |
| Agent — découverte seule | Allumé dans `.env`     | `AGENT_DISCOVERY_ONLY=true` : le modèle cherche, choisit et enregistre des entreprises (`CompanySource`) sans crawler ni extraire                  |
| Reprise en cascade       | Disponible             | CDC §4.7 : relecture bornée, `JobPosting` JSON-LD avant le LLM, relance des échecs, abandon journalisé (`retried`)                                 |
| Registre de conformité   | Disponible             | Table `Connector`, synchronisée par `pnpm registry:sync` ; une source découverte passe une porte (`board-access.ts`) avant toute visite            |
| Alertes Telegram         | Éteintes par défaut    | Nouvelles offres idempotentes ; commandes `/start`, `/status`, `/latest`, `/help`                                                                  |

## Sources de collecte

| Famille        | Sources                                  | Mode                                                                     |
| -------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| API officielle | France Travail                           | API `francetravail.io` (OAuth), si les identifiants partenaires existent |
| ATS natifs     | Greenhouse, Lever, Workable, Workday     | Flux publics et sites carrières, avec `robots.txt` respecté              |
| Job boards     | Welcome to the Jungle, HelloWork, Indeed | Connecteurs Apify, cycle quotidien, plafonds par défaut 15 / 15 / 20     |
| Désactivée     | LinkedIn                                 | Connecteur écrit et testé, statut `DISABLED` au registre après mesure    |

Les job boards sont lus par leurs connecteurs, pas par le crawler de l'agent. Une source découverte par l'agent est d'abord présentée au registre (`packages/job-connectors/src/board-access.ts`) : un job board connu sans connecteur actif est refusé, et un locataire d'ATS qui agrège les offres d'autrui n'est pas enregistré (`aggregator-tenants.ts`). Le cycle des job boards est **allumé par défaut** depuis le 2026-10-07 (`SCRAPED_SOURCES_ENABLED`, `packages/config/src/env.ts`) ; sans `APIFY_API_TOKEN`, il ne collecte rien.

## L'agent

Pipeline du cahier des charges (`CAHIER_DES_CHARGES.md` §4) : Search → Discover → Crawl → Read → Extract → Analyze → Validate → Deduplicate → Store → Publish → Report.

L'implémentation est un pipeline **déterministe**, dans `packages/orchestrator/src/run-agent.ts` :

| Étape        | Implémentation                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Search       | `generateSearchQueries` (`@findit/agent`)                                                                                         |
| Discover     | `scoreSources` écarte les sources sous le seuil ; le modèle choisit ensuite, parmi les 12 meilleures candidates, celles à visiter |
| Crawl        | `@findit/crawler` : HTTP, repli Playwright, `robots.txt`, suivi des liens, bornes `maxDepth`/`maxPages`/`maxRuntimeMs`            |
| Read/Extract | `extractJobsFromPage` page par page (`@findit/extract`), via DeepSeek ; les écoles sont écartées                                  |
| Validate     | `isValidOffer`                                                                                                                    |
| Deduplicate  | titre normalisé, au sein du run                                                                                                   |
| Store        | `persistOffers` (`@findit/persist`)                                                                                               |
| Memory       | `AgentRunStore` / `AgentMemory` : une URL déjà vue n'est pas re-crawlée dans le run                                               |

Une étape qui échoue est consignée dans `AgentError` et n'interrompt pas le run. Un run se termine en `SUCCEEDED`, `FAILED` ou `STOPPED` (borne de temps atteinte).

La **reprise en cascade** (cahier des charges, section 4.7) est portée par `packages/orchestrator/src/recovery.ts`. Pour chaque page : relecture bornée quand le crawl l'a rendue vide, puis extraction déterministe des `schema.org JobPosting` déclarés en JSON-LD (`@findit/extract`), puis extraction par DeepSeek. Seul un échec est relancé ; une stratégie qui a tourné sans rien trouver passe la main. Quand tout est épuisé, la page est abandonnée avec sa raison dans `AgentError` et `retried` vaut `true`. En amont, une porte déterministe (`mentionsPerimeterContract`, exclusion des listes d'ATS) écarte la page sans appeler le modèle.

## Périmètre métier

Contrats alternance et stage ; métiers front-end, back-end, full-stack, ingénierie logicielle, autres métiers du développement, mobile, data analyst, data engineer ; Île-de-France (75, 77, 78, 91, 92, 93, 94, 95). Voir `packages/shared/src/job-scope.ts`.

Le flux public affiche par défaut les **alternances des métiers du développement** sur **72 heures** (`freshness` par défaut : `LAST_72H`). La fenêtre de 24 h (`LAST_24H`) est un resserrement possible, et 72 h est le plafond absolu : une offre plus ancienne n'est jamais exposée.

## Décisions tranchées

- **Posts LinkedIn** : canal refusé après mesure — 6 posts pour 0 offre et 0,03005 $, avec l'identité de l'auteur toujours rendue. Motif et chiffres : [docs/legal-compliance.md](docs/legal-compliance.md).
- **Offres LinkedIn** : connecteur désactivé après mesure — 0 offre francilienne pour 0,02810 $, l'acteur ignorant la zone demandée (`packages/job-connectors/src/registry.ts`).
- **Journal de dépense** : volontairement conservateur, le coût n'est jamais effacé (`HANDOFF.md`).
- **`force-dynamic`** : conservé sur l'accueil (`apps/web/src/app/page.tsx`).

## Stack technique

- **Monorepo** : pnpm workspaces + Turborepo
- **Web** : Next.js 16 (App Router), React 19 ; Vercel en production
- **API** : NestJS 11 sur Fastify 5, Helmet, CORS ; Vercel en production, entrée serverless
- **Worker** : NestJS + BullMQ 5, concurrence 1 (les cycles ne se chevauchent pas) ; Railway en production
- **Base de données** : PostgreSQL en ligne (Neon) via Prisma 7 et l'adaptateur `pg` ; image `pgvector/pgvector:pg18` en local
- **File d'attente** : Redis 8 (`redis:8.8.0-alpine` en local, service Redis sur Railway)
- **IA** : DeepSeek API via `@findit/ai` (`DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, défaut `deepseek-flash`)
- **Recherche web** : Brave (`BraveSearchProvider`, `@findit/job-connectors`)
- **Crawl** : `@findit/crawler`, HTTP puis Playwright 1.63 en repli
- **Scraping job boards** : connecteurs Apify, plafonds de dépense `SCRAPING_BUDGET_MONTHLY_USD` / `SCRAPING_BUDGET_CYCLE_USD`
- **Qualité** : ESLint 10, Prettier 3.9, Vitest 4, TypeScript 6
- **Infra locale** : Docker Compose

## Installation locale

Prérequis : Node.js `>= 24.18 < 25`, pnpm 11.13.1 (via Corepack), Docker Desktop (Redis, et PostgreSQL local si vous n'utilisez pas la base en ligne).

```powershell
corepack enable
corepack prepare pnpm@11.13.1 --activate
Copy-Item .env.example .env   # puis renseigner DATABASE_URL, REDIS_URL, INTERNAL_API_KEY, DEEPSEEK_API_KEY
pnpm install
pnpm setup:hooks
pnpm infra:up        # Redis, et PostgreSQL local si vous n'utilisez pas la base en ligne
pnpm db:migrate
pnpm registry:sync   # synchronise le registre de conformité des connecteurs
```

`pnpm db:seed` insère des offres de DÉMONSTRATION (`isDemo = true`) : c'est un outil de développement, aucun chemin de production ne l'appelle.

Lancement :

```powershell
pnpm dev
```

- Web : http://localhost:3100
- API : http://localhost:4000
- Santé API : http://localhost:4000/health

Toutes les variables d'environnement sont documentées dans `.env.example` et validées par Zod au démarrage. L'API exige `DATABASE_URL`, `INTERNAL_API_KEY` (32 caractères minimum) et `DEEPSEEK_API_KEY` ; `REDIS_URL` ne concerne que le worker. L'espace personnel `/moi` s'active avec `PROFILE_PASSWORD` et `SESSION_SECRET` (32 caractères minimum) côté web ; sans eux, le site public tourne et la page annonce « espace personnel non configuré ».

## Qualité

```powershell
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Ces cinq commandes sont la porte de qualité ; le workflow `.github/workflows/ci.yml` les rejoue. Mesuré le 2026-10-07 : `pnpm test` réussit 38 tâches Turborepo sur 38, `pnpm build` 21 sur 21. L'état d'exécution de GitHub Actions n'est pas vérifiable depuis ce dépôt.

## Structure du monorepo

```
apps/
  web/      Interface Next.js (port 3100) ; racine du projet Vercel `finditfr`
  api/      API NestJS/Fastify (port 4000) ; racine `finditfr-api`
    api/    Relais serverless Vercel (un gestionnaire unique + cinq relais par préfixe)
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
Dockerfile.worker      Image du worker (racine de build : la racine du dépôt)
railway.env.example    Variables du service worker sur Railway
infrastructure/        Emplacements réservés (Docker, monitoring, scripts)
docs/                  Architecture, déploiement, conformité légale
```

Détail de l'architecture : [docs/architecture.md](docs/architecture.md). Déploiement : [docs/deployment.md](docs/deployment.md). Conformité des sources : [docs/legal-compliance.md](docs/legal-compliance.md).

## Limites connues

- **Pas de comptes ni de rôles** : un mot de passe unique garde `/moi` et `/dashboard`. Les routes publiques (liste, fiche) et les API `/api/jobs`, `/api/agent`, `/api/matching` restent ouvertes ; seul `/api/profile` exige l'en-tête `x-internal-key`.
- **Worker sans port** : sa santé se lit dans ses journaux et dans les `ConnectorRun`, pas par un `GET /health`.
- **Contournement de routage Vercel** : les cinq relais du dossier `api/` sont un palliatif, pas une architecture.
- **Reprise en cascade partielle** (§4.7 du CDC) : la relecture d'une page vide, l'extraction `JobPosting` JSON-LD avant le LLM et la relance des échecs sont livrées. Manque l'invocation de connecteurs spécialisés en repli.
- **Boucle pilotée par le LLM, étapes codées** (§5 du CDC) : le modèle choisit les requêtes et les sources à visiter sur un nombre de tours borné ; crawl, extraction, validation, déduplication et stockage restent déterministes. Le plan déterministe sert de repli si la réponse du modèle est inutilisable.
- **Questions ouvertes** : Q-2 (comptes multiples) et Q-3 (sources de départ) ; Q-1 (hébergement) est tranchée par le déploiement ci-dessus.
- La base de production est en ligne (Neon) et le rôle applicatif n'en est pas propriétaire : une migration de structure doit passer par une connexion propriétaire (documenté dans `HANDOFF.md` et `docs/architecture.md`).

## Licence

Aucune licence n'est déclarée dans ce dépôt pour le moment.

---

Par [Daniel Nagoloum Talla](https://github.com/nagoloumdaniel) · [Portfolio](https://nagoloum.vercel.app)
