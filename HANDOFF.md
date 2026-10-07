# Passation - Web Intelligence Agent

Document destiné à un agent qui reprend. Il dit ce qu'est le projet, comment on y
travaille, ce qui est réellement fait, ce qui reste, et les pièges déjà payés.

À jour au 2026-10-07. **Pivot** : Findit (agrégateur à scrapers figés + espace
candidat privé) devient le **Web Intelligence Agent**. Le dépôt et les paquets
gardent le nom `findit` / `@findit/*`. Trois documents complètent cette passation,
sans la répéter : [README.md](README.md) (fonctionnalités et déploiement),
[CAHIER_DES_CHARGES.md](CAHIER_DES_CHARGES.md) (le périmètre qui fait foi) et
[roadmap.md](roadmap.md) (reste à faire et mesures détaillées).

## 1. Décisions tranchées

- **Espace privé candidat supprimé sauf matching/scoring de CV** : profil, lettres,
  suivi de candidatures, rendu PDF, `/espace`, `WorkspaceGuard` supprimés ; le
  matching CV ↔ offre est conservé, piloté par DeepSeek (CDC §4.11).
- **LLM = DeepSeek API uniquement** (plus d'Ollama local). `@findit/ai` est le
  client (`createDeepSeekModel`), importé par le worker, l'API matching et
  `@findit/matching`.
- **MVP V1 d'abord** : Scheduler + Search + Crawl + Extract + LLM classification +
  Deduplication + PostgreSQL + Dashboard, sur 10 à 20 sources.
- **Offres d'écoles exclues** : `looksLikeSchool` (`@findit/extract`) et
  `detectSchoolRisk` (`@findit/job-classification`), plus une liste citée
  d'employeurs-écoles et des formulations décisives (« entreprises partenaires »,
  frais de formation, promesse de placement).
- **LinkedIn désactivé, posts LinkedIn refusés** : mesuré, 0 offre francilienne
  pour ~0,028 $. Statut `DISABLED` dans `packages/job-connectors/src/registry.ts`
  (il survit à `pnpm registry:sync`) ; les posts sont refusés (0 offre sur 6,
  `docs/legal-compliance.md`).
- **Journal de dépense conservateur** : le coût consigné est la borne haute, jamais
  effacée (une source inconnue reste au tarif maximal) ; il protège la garde de
  budget et sur-évalue volontairement la dépense réelle.
- **Un seul mot de passe plutôt qu'une authentification** : `PROFILE_PASSWORD`
  échangé contre un cookie signé HMAC-SHA-256 (`SESSION_SECRET`, 30 jours,
  `httpOnly`) ; `apps/web/src/proxy.ts` protège `/moi` **et** `/dashboard`. Pas de
  comptes, pas de multi-utilisateurs (Q-2 ouverte).
- **`force-dynamic` conservé** sur l'accueil et la fiche d'offre, faute de gain
  mesuré à le retirer.

## 2. État réel

### Livré et vérifié

- **Pipeline de l'agent** (`packages/orchestrator/src/run-agent.ts`) : plan des
  recherches (`planner.ts`, modèle DeepSeek avec repli déterministe borné à
  `maxQueries`), recherche Brave, scoring, mémoire `crawlKey` (ignore casse,
  `www.`, fragment, slash final et paramètres de suivi, **conserve la requête**),
  porte de conformité du registre (`board-access.ts`), résolution de l'URL finale
  avant crawl (`resolveUrl` → `packages/crawler/src/resolve.ts`), choix des
  sources (`selector.ts`), crawl borné (HTTP + repli Playwright, robots.txt),
  cascade de reprise (`recovery.ts` : relecture bornée, `JobPosting` JSON-LD avant
  le LLM, relance des seuls échecs, abandon journalisé `retried`), porte
  déterministe (`extract/contract.ts` + racine de board ATS), extraction, validité
  (`isValidOffer`), déduplication par titre normalisé, découverte vers le registre
  (`discoverSource`), persistance (`@findit/persist`). Erreurs dans `AgentError`,
  statuts RUNNING / SUCCEEDED / FAILED / STOPPED. Bornes : `maxRecoveries` (5),
  `maxAttemptsPerStep`, `maxTotalAttempts` (`packages/orchestrator/src/config.ts`).
- **Mode découverte seule** (`AGENT_DISCOVERY_ONLY`, défaut schéma `false`, activé
  dans `.env` et `.env.example`) : le premier cycle planifie, cherche et enregistre
  au registre sans crawler ni extraire. Le sélecteur n'est plus appelé dans ce mode
  (`run-agent.ts`), verrouillé par test (`run-agent.test.ts`).
- **Registre** : `registerDiscoveredSource` rend `{registered, created}`
  (`discovered-sources.ts`) ; `isAggregatorTenant` (`aggregator-tenants.ts`) écarte
  les locataires d'ATS qui publient les offres d'autrui (`lever/jobgether`) ;
  `canonicalAtsHost` (`ats-hosts.ts`) ramène les deux hôtes Greenhouse à un seul.
  Workable n'est pas enregistrable (collecte par requête, pas par jeton).
- **Extraction** : `SYSTEM_PROMPT` (`packages/extract/src/extract.ts`) exclut les
  écoles et ne retient que l'alternance et le stage, tout en gardant une offre dont
  le contrat n'est pas nommé (la validation tranche).
- **Observabilité et fiabilité** : `AgentService.analytics()` agrège coût et tokens
  (`parseUsageFromDetail`) ; `@findit/ai` cumule l'usage et le facture dans
  `AgentAction.costMicroUsd` puis `AgentRun.costMicroUsd` (coût si les tarifs
  `DEEPSEEK_*_USD_PER_MTOK` sont fournis, tokens toujours tracés) ; le matching
  écrit une ligne `ModelCall` et conserve son historique (`MatchingRun`, rétention
  `MATCHING_RETENTION_HOURS`, défaut 72 h) ; `resolveLocation` lit le code postal
  français, `parsePublishedAt` exige une forme ISO.
- **Web** (`apps/web`, Next.js 16, port 3100) : site public (`/`, `/offres/[slug]`),
  espace personnel `/moi` (profil, compétences, CV, matchings passés),
  `/connexion`, dashboard `/dashboard` et ses 8 sections. Thème clair/sombre
  (sélecteur + script anti-flash, `motion.css`), 11 `loading.tsx`, cache public
  60 s / 300 s et `no-store` pour toute donnée de session (`lib/api.ts`).
- **API** (`apps/api`, NestJS sur Fastify, port 4000) : `GET /health`,
  `GET /api/jobs{,/stats,/filters,/:slug}`, `GET /api/agent/{runs,stats,analytics,
sources,runs/:id}`, `POST /api/matching/score`, `GET /api/matching/history{,/:id}`,
  `GET|PUT /api/profile` (gardé par `x-internal-key`, `timingSafeEqual`). Pas
  d'authentification d'utilisateur.
- **Worker** (`apps/worker`, NestJS + BullMQ) : concurrence 1, trois planifications
  — ATS natifs (`JOB_COLLECTION_CRON`, `0 */4 * * *`), job boards Apify
  (`SCRAPED_COLLECTION_CRON`, `0 6 * * *`, allumé par défaut, jeton Apify requis),
  agent (`AGENT_COLLECTION_CRON`, `0 8 * * *`, si `AGENT_RUN_ENABLED`). Telegram.
  Run unique hors BullMQ : `apps/worker/run-agent-once.ts`.
- **Base** : migrations `20261006120000_agent_and_remove_private` (DROP des tables
  privées, CREATE Source/AgentRun/AgentAction/AgentError/AgentMemory/SearchQuery/
  CrawlJob/CrawlPage/Extraction/Contact), puis `20261007020000_model_calls`,
  `20261007030000_matching_runs`, `20261007043000_profile`. Plus aucun modèle
  `User` au schéma.
- **En ligne** : web https://finditfr.vercel.app (Vercel, projet `finditfr`,
  racine `apps/web`) et API https://finditfr-api.vercel.app (projet
  `finditfr-api`) ; worker sur Railway (projet `findit-worker`, service `worker` +
  Redis), construit par Railpack depuis la racine. Détail et commandes :
  [README.md](README.md) et [docs/deployment.md](docs/deployment.md).
- **Qualité** (rejouée le 2026-10-07) : `pnpm format:check` vert ; `pnpm typecheck`
  38/38 ; `pnpm lint` 38/38 ; `pnpm test --force` 38/38 tâches, **779 tests** ;
  `pnpm build` 21/21 (servi par le cache Turbo).

### Reste à faire

- **Authentification** absente (Q-2) : le mot de passe unique ne distingue pas les
  utilisateurs.
- **Connecteurs spécialisés en repli** (CDC §4.7, étape 3) non câblés : les étapes
  1-2 (HTTP, navigateur) vivent dans le crawler, l'extraction spécialisée JSON-LD
  est livrée, mais l'agent n'invoque pas les connecteurs ATS/job boards en secours.
- **Boucle d'outils partielle** (CDC §5) : le modèle choisit les recherches
  (`createLlmQueryPlanner`) et les sources à crawler (`createLlmSourceSelector`),
  voit le résultat du tour et décide via `refine` ; l'extraction et l'arrêt restent
  fixes.
- **Dettes ouvertes** (détail : [roadmap.md](roadmap.md)) : **presque toutes résolues
  le 2026-10-07** — `.claude/` retiré du suivi et purgé de l'historique (dépôt 76,5 Mo
  → 1,3 Mo) ; `SCRAPEGRAPH_API_KEY` retirée du `.env` (évaluation non retenue, conservée
  dans `docs/legal-compliance.md`) ; couverture des contrôleurs de l'API portée à
  **100 %**, ce qui a révélé trois défauts de contrat corrigés (`history/:id` inconnu
  rendait 200 + `null` au lieu de 404 ; `POST /score` rendait 201 au lieu de 200 ;
  `:id` sans validation, désormais 400) ; règle de date **dédupliquée** (`linkedin.ts`
  importe `endOfDayIfDateOnly`) ; `canonicalAtsHost` couvre les deux variantes Greenhouse
  observées en base ; `unknownHosts`, calculé sans consommateur, est **journalisé** dans
  la ligne de cycle. **Reste ouvert** : ces hôtes inconnus sont journalisés mais
  toujours pas enregistrés au registre dynamique — un arbitrage, pas un oubli.
- **Questions ouvertes** : Q-1 (hébergement) est **tranchée** (Vercel + Railway) ;
  restent Q-2 (auth) et Q-3 (sources de départ du MVP).

## 3. Règles de travail (non négociables)

1. **Français**, réponses courtes, sans remplissage. Précision technique intacte.
2. **Une brique à la fois, sur ordre explicite.** Livrer, montrer, attendre.
3. **Vérifier sur le réel** : base, API, modèle réels. Aucun mock non signalé.
4. **Rien d'inventé** : une donnée manquante ou une sortie invalide lève une erreur.
5. **Commit et push seulement sur demande.** Historique linéaire sur `main`.
6. **Le registre de conformité fait foi** ([docs/legal-compliance.md](docs/legal-compliance.md)).
7. **Ne jamais toucher au port 3000** : il appartient à un autre projet. Le site est sur 3100.

## 4. Architecture

Monorepo **pnpm workspaces + Turborepo**. Node `>=24.18 <25`, pnpm `11.13.1`.

- `apps/web` - Next.js 16, port 3100 (site public, `/moi`, dashboard).
- `apps/api` - NestJS sur Fastify, port 4000 (offres, agent, matching, profil).
- `apps/worker` - NestJS + BullMQ (scheduler, collecte, agent).

Les 17 paquets de `packages/` :

- `agent` - requêtes de recherche, scoring, stores run/mémoire.
- `ai` - client DeepSeek (`createDeepSeekModel`) et suivi d'usage.
- `config` - schémas d'environnement, `loadRootEnv()`.
- `crawler` - crawl borné HTTP + Playwright, robots.txt, résolution d'URL.
- `database` - client Prisma + migrations + seed.
- `extract` - extraction structurée par page, exclusion des écoles.
- `job-classification` - classification (contrat, rôle) et détection d'écoles.
- `job-connectors` - connecteurs ATS/job boards, Brave, registre, garde de budget.
- `job-deduplication` - similarité et décision de doublon.
- `job-normalization` - HTML → texte, titres normalisés, localisation.
- `job-pipeline` - décision d'ingestion, slug, persistance pipeline.
- `matching` - structuration de CV et score CV ↔ offre (DeepSeek).
- `notifications` - Telegram (format, envoi, commandes).
- `orchestrator` - boucle `runAgent` (plan → search → select → crawl/extract →
  register/persist).
- `persist` - persistance des offres retenues par le run.
- `shared` - périmètre des offres (fenêtres de fraîcheur, contrats, lieux).
- `ui` - composants partagés (`PageShell`).

## 5. Environnement

```bash
pnpm install
pnpm db:migrate         # vise la base Neon (DATABASE_URL)
pnpm dev                # turbo, toutes les apps
```

`.env` vit à la racine ; `loadRootEnv()` de `@findit/config` le retrouve. Variables
attendues par le worker sur Railway : `railway.env.example`. Le LLM DeepSeek se
configure via la clé de plateforme (voir §6).

Il n'y a **plus de PostgreSQL ni de Redis local** : Docker Compose a été retiré du
dépôt (le conteneur de base était vide, rien n'a été perdu). La base est Neon et
exige TLS ; Redis est un service Railway. L'outillage local qui parle à Redis
(`pnpm board:proof`, agent lancé à la main) exige un **proxy TCP** activé sur le
service Redis de Railway, avec l'URL publique reportée dans `REDIS_URL` :
`REDIS_URL=redis://localhost:6379` ne résout plus rien.

## 6. Outillage DeepSeek

Claude Code est branché sur un compte DeepSeek
(`@deepseek-ai/dsh-subagent-claude-code`, profil `desktop` par défaut). Deux
scripts du dépôt :

- [scripts/update-claude-subagent.cjs](scripts/update-claude-subagent.cjs) : aligne
  le bundle sous-agent sur la version de DeepSeek Harness après une mise à jour
  (`node scripts/update-claude-subagent.cjs`, ou `--check`).
- [scripts/compare-deepseek-models.cjs](scripts/compare-deepseek-models.cjs) :
  compare `deepseek-flash` et `deepseek-v4-pro` sur quatre questions de
  raisonnement, à contexte identique (`node scripts/compare-deepseek-models.cjs
<clé> [filtre] [--dry]`).

Non vérifiable depuis le dépôt, donc à reconfirmer côté plateforme : l'alias des
noms de modèles Claude (`claude-opus-*` → `deepseek-v4-pro`,
`claude-sonnet-*`/`claude-haiku-*` → `deepseek-flash`), la prise en charge de la
vision, et le fait que la clé de compte n'est pas une clé API.

## 7. Pièges déjà payés

- **`.env` non lu** : appeler `loadRootEnv()` avant toute lecture de `process.env`.
  Sur Vercel, il n'y a pas de `.env` : `parseApiEnv(process.env)` suffit
  (`apps/api/api/[...chemin].ts`).
- **`next build` cassé par `NODE_ENV`** : `apps/web/run-next.mjs` retire `NODE_ENV` du `.env`.
- **Dev sur `0.0.0.0` + accès par `127.0.0.1`** : Next 16 bloque `/_next/webpack-hmr`,
  le client ne s'hydrate plus. Corrigé par `allowedDevOrigins` (`next.config.ts`).
- **`middleware.ts` ne s'hydrate pas sous Next 16** : la convention est `proxy.ts`
  (`apps/web/src/proxy.ts`).
- **Injection NestJS silencieusement cassée** : écrire `@Inject(MonService)` explicite.
- **Champs JSON Prisma** : stocker des objets validés par Zod, jamais de sortie IA brute.
- **Le rôle applicatif n'est pas propriétaire du schéma** (Neon) : appliquer une
  migration structurelle avec la connexion propriétaire, puis `migrate resolve`.
- **Routage Vercel à un seul segment** : `/api/jobs/stats` renvoyait un 404 sans
  corps ; cinq relais d'une ligne rétablissent la profondeur sous `apps/api/api/`.
- **`railway.json` n'est plus lu** (déprécié) : la construction se règle par
  variables Railpack (`RAILPACK_BUILD_CMD`, `RAILPACK_NODE_PLAYWRIGHT_INSTALL`) et
  le script `start` de la racine (`node apps/worker/dist/main.js`).
- **`.railwayignore` : un motif sans barre oblique n'est pas ancré** : `agent`
  excluait aussi `packages/agent`. Écrire `/agent`, `/.claude`.
- **`RAILPACK_START_CMD` mal interprétée par bash** : d'où le script `start` à la racine.
- **`prove-board` consomme `dist`** : reconstruire avant de mesurer, sinon on mesure
  l'ancien code.
- **Hook de pré-push local** : `.githooks/pre-push` rejoue `format:check`,
  `typecheck`, `lint` et `test`.
- **Un « vert » peut venir du cache Turborepo** : forcer (`--force`) pour une preuve.
- **Node de la machine v24.10.0** alors que le dépôt exige `>= 24.18 < 25`.
- **Image du worker volumineuse** : `Dockerfile.worker` part de Playwright (Chromium
  requis par l'agent), mesurée à 4,71 Go — à connaître avant de choisir un hébergeur.

## 8. Mesures récentes (datées)

Détail complet dans [roadmap.md](roadmap.md) §5 ; ci-dessous ce qui éclaire une
décision. Toutes datées, aucune n'est rejouée à la lecture.

- **Qualité (2026-10-07)** : `format:check` vert, `typecheck` 38/38, `lint` 38/38,
  `test --force` 38/38 (779 tests), `build` 21/21 (cache). Git : `main`, HEAD
  `79d7d30` (2026-10-07 08:18).
- **Cycle boards (2026-10-07, 06 h Paris)** : 34 découvertes, 9 acceptées,
  0,0312 $, **0 nouvelle offre** — le premier cycle réellement exécuté.
- **Recouvrement (2026-10-06/07)** : deux cycles identiques dos à dos → 57
  découvertes, 13 acceptées, 0 nouvelle, 0,052 $ puis 0,064 $. Plafonds resserrés
  à 15/15/20 (WTTJ/HelloWork/Indeed, `env.ts`) ; le levier est la cadence.
- **Valeur des familles de sources** : job boards scrapés 23 / 12 / 0,0142 $ ;
  France Travail 13 / 2 ; boards d'entreprises 4 251 / **0** (3 899 sans contrat du
  périmètre, 154 freelance, 99 executive, 29 CDI, 3 refus de localisation).
- **Agent → registre (2026-10-07)** : 84 → 94 `CompanySource` (+10) pour 812 µ$,
  contre 0 sur les 25 runs précédents ; registre nettoyé ensuite (95 → 94 par
  `isAggregatorTenant`, 94 → 93 par `canonicalAtsHost`).
- **Découverte seule (2026-10-07)** : 3 tours, 15 recherches, 0 crawl,
  0 extraction, 1 222 µ$.
- **LinkedIn (2026-10-07)** : deux runs bornés, 0,02810 $ réels, 0 offre
  francilienne (14/14 en Bretagne) ; barème établi (0,002 $/résultat + 0,00005 $ de
  démarrage) ; posts refusés (0/6, 0,03005 $) ; journal de dépense conservateur
  (0,04000 $ consignés contre 0,02805 $ réels).
- **Matching CV (2026-10-07)** : un matching complet = 16 516 + 6 668 tokens pour
  12 956 µ$ (0,013 $), invisible avant `ModelCall`.
- **Écoles (2026-10-07)** : 5 offres (ISCOD, IRIS, EEMI) rejetées sur 24 lues,
  publiées 24 → 19, aucun des 13 autres employeurs touché.
- **Coût de l'agent (2026-10-06)** : sélection compactée 862 → 575 µ$ ; runs de
  contrôle à 1 687 µ$, 1 028 µ$ et 2 025 µ$ ; découverte ciblée à 782 µ$ (contre
  5 419 µ$ avant ciblage) ; porte de contrat : 127 offres lues, 101 rejetées sans
  appel au modèle.
- **Web (2026-10-07)** : accueil en production 2 242 → 501 ms ; DCL médian local
  336,95 → 92,1 ms. `force-dynamic` conservé faute de gain mesuré.
- **Couverture (2026-10-07)** : notifications 68 → 92 %, API 79 → 86 % ; les
  contrôleurs de l'API restent faibles (20-50 %).

## 9. Vérifier son travail

```bash
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
