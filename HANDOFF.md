# Passation - Web Intelligence Agent

Document destiné à un agent qui reprend le travail. Il dit ce qu'est le projet,
comment on y travaille, ce qui est **réellement** fait, ce qui a déjà été tranché
et pourquoi, et les pièges déjà payés.

À jour au 2026-10-06. **Pivot majeur** : Findit (agrégateur d'offres d'alternance
à scrapers figés + espace candidat privé) devient le **Web Intelligence Agent**
(agent IA autonome de collecte web). Le cahier des charges et la roadmap ont été
réécrits : [CAHIER_DES_CHARGES.md](CAHIER_DES_CHARGES.md) et
[roadmap.md](roadmap.md) font foi.

## 1. Décisions tranchées (2026-10-06)

- **Espace privé candidat supprimé sauf matching/scoring de CV** : profil,
  lettres, suivi de candidatures, rendu PDF, `/espace`, `WorkspaceGuard` supprimés ;
  le matching et le scoring de CV (score CV ↔ offre) sont **conservés**, pilotés par
  DeepSeek (cahier des charges, section 4.11). Le code déterministe retiré sera
  réécrit en agent IA.
- **LLM = DeepSeek API uniquement** (plus d'Ollama local). Le paquet `@findit/ai`
  est orphelin, à réécrire sur DeepSeek.
- **MVP V1 d'abord** : Scheduler + Search + Crawl + Extract + LLM classification +
  Deduplication + PostgreSQL + Dashboard, sur 10 à 20 sources.
- **Offres d'écoles exclues** : écoles, organismes de formation, termes « école ».

## 2. État réel (2026-10-06)

### Fait et vérifié

- Docs réécrites : cahier des charges, roadmap (pivot + MVP V1 en 8 phases).
- Espace candidat supprimé (7 modules API, 3 paquets, le web `/espace` et
  `candidatures`, 11 tables + 4 enums Prisma). `PromptVersion` conservé (lié aux
  décisions de classification).
- Typecheck, lint, test : **25/25 verts** après la suppression.

### Conservé et réutilisable comme outils de l'agent

- Monorepo (Next.js + NestJS + TypeScript + PostgreSQL/Prisma + Redis/BullMQ + Docker).
- Worker : scheduler cron + BullMQ.
- `job-connectors` : recherche web (Brave), découverte, robots.txt, registre de
  conformité, garde de budget, connecteurs ATS/job boards (→ « extraction spécialisée »).
- `job-normalization`, `job-classification` (dont détection d'écoles),
  `job-deduplication`, `job-pipeline` (ingestion), `notifications` (Telegram).

### Pas encore fait

- Le MVP V1 lui-même : AI Planner, Search/Discovery agent, crawler générique
  (Playwright + Cheerio), extraction LLM (DeepSeek), dashboard admin, schéma
  remanié (sources, crawl_jobs, crawl_pages, search_queries, agent_runs…).
- Migration de suppression des tables privées en base (rôle applicatif non
  propriétaire du schéma, voir §7).
- Nettoyage restant : CSS mort (`globals.css` classes `.workspace*`), `pnpm-lock.yaml`.
- Questions ouvertes Q-1 (hébergement), Q-2 (auth), Q-3 (sources MVP).

## 3. Règles de travail (non négociables)

1. **Français**, réponses courtes, sans remplissage. Précision technique intacte.
2. **Une brique à la fois, sur ordre explicite.** Livrer, montrer, attendre.
3. **Vérifier sur le réel** : base, API, modèle réels. Aucun mock non signalé.
4. **Rien d'inventé** : une donnée manquante ou une sortie invalide lève une erreur.
5. **Commit et push seulement sur demande.** Historique linéaire sur `main`.
6. **Le registre de conformité fait foi** ([docs/legal-compliance.md](docs/legal-compliance.md)).
7. **Ne jamais toucher au port 3000** : il appartient à un autre projet. Le site est sur 3100.

## 4. Architecture (ce qui reste)

Monorepo **pnpm workspaces + Turborepo**. Node `>=24.18 <25`, pnpm `11.13.1`.

- `apps/web` - Next.js 16, port 3100 (liste publique des offres).
- `apps/api` - NestJS sur Fastify, port 4000 (offres uniquement, plus d'espace privé).
- `apps/worker` - NestJS + BullMQ (scheduler, collecte).
- `packages/` - `config`, `database` (Prisma), `shared`, `ui`, `job-connectors`,
  `job-normalization`, `job-classification`, `job-deduplication`, `job-pipeline`,
  `notifications`, `ai` (orphelin, à réécrire sur DeepSeek).

## 5. Environnement

```bash
pnpm install
pnpm infra:up           # postgres + redis via docker compose
pnpm db:migrate
pnpm dev                # turbo, toutes les apps
```

`.env` vit à la racine ; `loadRootEnv()` de `@findit/config` le retrouve. Le LLM
DeepSeek se configure via la clé de plateforme (voir §6).

## 6. Outillage DeepSeek

Claude Code est branché sur un compte DeepSeek (`@deepseek-ai/dsh-subagent-claude-code`,
profil `desktop`). L'API DeepSeek redirige les noms de modèles Claude vers les siens :
`claude-opus-*` → `deepseek-v4-pro`, `claude-sonnet-*`/`claude-haiku-*` → `deepseek-flash`.
`deepseek-v4-pro` ne supporte pas la vision, `deepseek-flash` oui. La clé de compte
n'est pas une clé API : une clé de plateforme est obligatoire. Après une mise à jour
du Harness, lancer [scripts/update-claude-subagent.cjs](scripts/update-claude-subagent.cjs).

## 7. Pièges déjà payés

- **`.env` non lu** : appeler `loadRootEnv()` avant toute lecture de `process.env`.
- **`next build` cassé par `NODE_ENV`** : `run-next.mjs` retire `NODE_ENV` du `.env`.
- **Injection NestJS silencieusement cassée** : écrire `@Inject(MonService)` explicite.
- **Champs JSON Prisma** : stocker des objets validés par Zod, jamais de sortie IA brute.
- **Port 4000 occupé** : `Get-NetTCPConnection -LocalPort 4000`.
- **Le rôle applicatif n'est pas propriétaire du schéma** (base en ligne) : une
  migration structurelle échoue ; l'appliquer avec la connexion propriétaire, puis
  `migrate resolve`. La suppression des tables privées devra passer par là.
- **Hook de pré-push rejoue `format:check`** : `pnpm format:check` avant de pousser.
- **Un « vert » peut venir du cache Turborepo** : forcer (`--force`) et une tâche par
  invocation pour une preuve.
- **Node de la machine v24.10.0** alors que le dépôt exige `>= 24.18 < 25`.
- **Un test peut flotter sous charge** : relancer en run frais avant de conclure.

## 8. Vérifier son travail

```bash
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
