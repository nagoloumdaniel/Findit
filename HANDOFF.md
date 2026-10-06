# Passation - Web Intelligence Agent

Document destiné à un agent qui reprend. Il dit ce qu'est le projet, comment on y
travaille, ce qui est réellement fait, ce qui reste, et les pièges déjà payés.

À jour au 2026-10-07. **Pivot** : Findit (agrégateur à scrapers figés + espace
candidat privé) devient le **Web Intelligence Agent** (agent IA de collecte web).
Le dépôt et les paquets gardent le nom `findit` / `@findit/*`. Le cahier des
charges et la roadmap font foi : [CAHIER_DES_CHARGES.md](CAHIER_DES_CHARGES.md) et
[roadmap.md](roadmap.md).

## 1. Décisions tranchées (2026-10-06)

- **Espace privé candidat supprimé sauf matching/scoring de CV** : profil, lettres,
  suivi de candidatures, rendu PDF, `/espace`, `WorkspaceGuard` supprimés ; le
  matching et le scoring de CV (score CV ↔ offre) sont **conservés**, pilotés par
  DeepSeek (cahier des charges, section 4.11).
- **LLM = DeepSeek API uniquement** (plus d'Ollama local). `@findit/ai` est le
  client DeepSeek réel (`createDeepSeekModel`), importé par le worker, l'API
  matching et `@findit/matching` ; il n'est plus orphelin.
- **MVP V1 d'abord** : Scheduler + Search + Crawl + Extract + LLM classification +
  Deduplication + PostgreSQL + Dashboard, sur 10 à 20 sources.
- **Offres d'écoles exclues** : `looksLikeSchool` (`@findit/extract`) et
  `detectSchoolRisk` (`@findit/job-classification`) écartent écoles et organismes
  de formation.

## 2. État réel

### Livré et vérifié

- **Pipeline de l'agent** (`packages/orchestrator/src/run-agent.ts`) : plan des
  recherches (`planner.ts`, modèle DeepSeek avec repli déterministe borné à
  `maxQueries`), recherche Brave, scoring des sources, mémoire `crawlKey` (ignore
  casse, `www.`, fragment, slash final et paramètres de suivi, **conserve la
  requête**), porte de conformité du registre (`board-access.ts`), résolution de
  l'URL finale avant crawl (`resolveUrl` → `packages/crawler/src/resolve.ts`),
  choix des sources (`selector.ts`, modèle ou ordre du score), crawl borné
  (`@findit/crawler` : HTTP + repli Playwright, robots.txt), cascade de reprise
  (`recovery.ts`), porte déterministe avant le modèle (`extract/contract.ts` +
  racine de board ATS), extraction structurée (`@findit/extract`), validation
  (`isValidOffer`), déduplication par titre normalisé, découverte vers le registre
  (`discoverSource` → `apps/worker/src/collection/register-discovery.ts`),
  persistance (`@findit/persist`). Erreurs consignées dans `AgentError`, statuts
  RUNNING / SUCCEEDED / FAILED / STOPPED.
- **Mode découverte seule** (décision du 2026-10-07) : l'agent planifie, cherche,
  choisit et enregistre au registre, sans crawler ni extraire. Réglage
  `AGENT_DISCOVERY_ONLY` (`packages/config/src/env.ts` l.137, défaut `false` ;
  activé dans `.env` et `.env.example`). Le sélecteur n'est plus appelé dans ce
  mode (`run-agent.ts` l.488), verrouillé par test
  (`packages/orchestrator/src/run-agent.test.ts` l.1624-1664).
- **Registre alimenté par l'agent** : `registerDiscoveredSource` rend
  `{registered, created}` (`packages/job-connectors/src/discovered-sources.ts`
  l.46-101) ; les agrégateurs déguisés en entreprises sont écartés par
  `isAggregatorTenant` (`aggregator-tenants.ts` l.18-24), branché dans
  `register-discovery.ts` l.55-58 (liste courte et citée : `lever/jobgether`).
- **Contrat et écoles dans l'extraction** : `SYSTEM_PROMPT` de
  `packages/extract/src/extract.ts` (l.78-90) exclut les écoles et ne retient que
  l'alternance et le stage, tout en gardant une offre dont le contrat n'est pas
  nommé (la validation tranche, l.85). Seuls Greenhouse, Lever et Workday
  s'enregistrent par jeton ; Workable se collecte par requête et n'a rien à faire
  au registre.
- **Observabilité et fiabilité** : `AgentService.analytics()` agrège coût des runs
  et tokens des actions `EXTRACT` (`parseUsageFromDetail`), affichés par les pages
  Analytics et Agent ; `@findit/ai` cumule `usage.input_tokens` /
  `usage.output_tokens` et les facture dans `AgentAction.costMicroUsd` puis
  `AgentRun.costMicroUsd` (coût seulement si les tarifs `DEEPSEEK_*_USD_PER_MTOK`
  sont fournis, tokens tracés dans tous les cas). `resolveLocation` lit le code
  postal français (« 92000 Nanterre, France » → 92) ; `parsePublishedAt` exige une
  forme ISO et rend la date illisible plutôt que de l'interpréter à
  l'américaine. Bornes de la cascade : `maxRecoveries` (5), `maxAttemptsPerStep`
  et `maxTotalAttempts` (`packages/orchestrator/src/config.ts`).
- **Migration `20261006120000_agent_and_remove_private` écrite** : DROP des tables
  privées (CandidateProfile, Resume, SourceResume, JobMatch, CoverLetter,
  Application, ApplicationEvent, ResumeAnalysis, SourceCoverLetter,
  SourceResumeMatch + 4 enums) et CREATE de Source, AgentRun, AgentAction,
  AgentError, AgentMemory, SearchQuery, CrawlJob, CrawlPage, Extraction, Contact.
  Plus aucun modèle `User` au schéma.
- **Web** (`apps/web`, Next.js 16, port 3100) : `/`, `/offres/[slug]`,
  `/dashboard` et ses sections `{agent, analytics, config, crawls, jobs, logs,
matching, sources}`. Pas de `/espace`, pas de `/candidatures`.
- **API** (`apps/api`, NestJS sur Fastify, port 4000) : `GET /health`,
  `GET /api/jobs{,/stats,/filters,/:slug}`, `GET /api/agent/{runs,stats,analytics,
sources,runs/:id}`, `POST /api/matching/score`. Pas d'authentification.
- **Worker** (`apps/worker`, NestJS + BullMQ) : concurrence 1, trois
  planifications — ATS natifs (`JOB_COLLECTION_CRON`, `0 */4 * * *`), job boards
  Apify (`SCRAPED_COLLECTION_CRON`, `0 6 * * *`, **allumé par défaut** depuis le
  2026-10-07, jeton Apify requis), agent (`AGENT_COLLECTION_CRON`, `0 8 * * *`, si
  `AGENT_RUN_ENABLED`). Notifications Telegram. Run unique hors BullMQ :
  `apps/worker/run-agent-once.ts`.
- **CSS mort retiré le 2026-10-07** : 24 règles `.workspace*` (177 lignes,
  vérifié : 0 référence restante, `pnpm --filter @findit/web build` compile). Les
  44 autres classes de l'ancien espace privé (`resume-*`, `letter-*`,
  `application-*`, `match-*`, `triage-*`, `cv-search*`) avaient déjà disparu. Un
  premier retrait annoncé le 2026-10-06 n'était pas dans l'arbre — vérification
  incomplète, corrigée depuis.
- **Docs** : cahier des charges et roadmap réécrits (pivot + MVP V1).

### Reste à faire

- **Authentification absente** (Q-2 ouverte).
- **Connecteurs spécialisés en repli** (section 4.7, étape 3) non câblés : la
  relecture bornée, l'extraction `JobPosting` JSON-LD et l'abandon journalisé sont
  livrés (`recovery.ts`), mais l'agent n'invoque pas les connecteurs ATS/job boards
  comme stratégie de secours. Les étapes 1 et 2 (HTTP, navigateur) vivent dans le
  crawler.
- **Boucle d'outils partielle (section 5)** : le modèle choisit les recherches
  (`createLlmQueryPlanner`, `planner.ts`) et les sources à crawler
  (`createLlmSourceSelector`, `selector.ts`), **voit ce que le tour a produit**
  (requêtes exécutées, sources notées, offres retenues, pages visitées) et décide
  via `refine` s'il en faut un autre — `null` arrête. Chaque plan est consigné
  (`AgentAction` DISCOVER, coût compris) avec son numéro de tour. Bornes :
  `maxPlanRounds` (3), part du budget de pages par tour
  (`maxPages / maxPlanRounds`), bornes de temps. Restent fixes : l'extraction
  (cascade déterministe spécialisée → LLM) et l'arrêt.
- **Application de la migration à la base en ligne** : le rôle applicatif n'est pas
  propriétaire du schéma ; appliquer la migration structurelle via la connexion
  propriétaire, puis `migrate resolve`. L'état en ligne n'est pas vérifiable depuis
  ce dépôt et n'est pas affirmé ici.
- **Résolu — Greenhouse a deux hôtes** : le registre est unique par
  `(entreprise, domaine)`, or `boards.greenhouse.io` et `job-boards.greenhouse.io`
  sont deux domaines. Mesuré le 2026-10-07 : `doctolib` portait deux
  `CompanySource`, donc une collecte en double. Corrigé en deux temps :
  `canonicalAtsHost` (`packages/job-connectors/src/ats-hosts.ts`) ramène les deux
  hôtes Greenhouse à un seul — le connecteur, lui, construit sa requête depuis le
  jeton, l'hôte n'identifie que la ligne du registre — et la ligne redondante a été
  retirée (94 → 93 sources ; `doctolib` n'en a plus qu'une).
- **Dette — matching de CV non suivi, et son coût non plus** :
  `apps/api/src/matching/matching.service.ts` construit un modèle DeepSeek, l'appelle,
  et ne lit jamais `model.usage()` : aucun jeton, aucun coût, aucun log. Le `cvText`
  reçu n'est pas persisté non plus, donc la page Matching reste un collage sans
  historique. Suivre ce coût demande une table (aucune ne convient :
  `AgentRun`/`AgentAction` sont sémantiquement réservés à l'agent, `ConnectorRun`
  aux connecteurs), donc une **migration structurelle** — à appliquer avec la
  connexion propriétaire puis `migrate resolve`, comme le rappelle §7.
- **Dette — hôtes inconnus non enregistrés** : `collectDiscoveries` calcule
  `unknownHosts` (`packages/job-connectors/src/discovery.ts` l.136-141), qu'aucun
  appelant ne consomme ; une visite éventuelle reste gouvernée par `robots.txt` via
  le crawler et `board-access.ts`.
- **Questions ouvertes** : Q-1 (hébergement), Q-2 (auth), Q-3 (sources MVP), en
  section 15 du cahier des charges.

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

- `apps/web` - Next.js 16, port 3100 (site public + dashboard).
- `apps/api` - NestJS sur Fastify, port 4000 (offres, agent, matching).
- `apps/worker` - NestJS + BullMQ (scheduler, collecte, agent).

Les 17 paquets de `packages/` :

- `agent` - requêtes de recherche, scoring des sources, stores run/mémoire.
- `ai` - client DeepSeek (`createDeepSeekModel`) et erreurs associées.
- `config` - schémas d'environnement, `loadRootEnv()`.
- `crawler` - crawl borné HTTP + rendu Playwright, robots.txt, résolution d'URL.
- `database` - client Prisma + migrations + seed.
- `extract` - extraction structurée des offres par page, exclusion des écoles.
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
- `shared` - périmètre des offres partagé.
- `ui` - composants partagés (`PageShell`).

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

Claude Code est branché sur un compte DeepSeek
(`@deepseek-ai/dsh-subagent-claude-code`, profil `desktop` par défaut). Deux
scripts du dépôt, vérifiés présents :

- [scripts/update-claude-subagent.cjs](scripts/update-claude-subagent.cjs) :
  aligne le bundle sous-agent sur la version de DeepSeek Harness après une mise à
  jour (`node scripts/update-claude-subagent.cjs`, ou `--check` pour constater).
- [scripts/compare-deepseek-models.cjs](scripts/compare-deepseek-models.cjs) :
  compare `deepseek-flash` et `deepseek-v4-pro` sur quatre questions de
  raisonnement, à contexte identique
  (`node scripts/compare-deepseek-models.cjs <clé> [filtre] [--dry]`).

Non vérifiable depuis le dépôt, donc à reconfirmer côté plateforme : l'alias des
noms de modèles Claude (`claude-opus-*` → `deepseek-v4-pro`,
`claude-sonnet-*`/`claude-haiku-*` → `deepseek-flash`), la prise en charge de la
vision, et le fait que la clé de compte n'est pas une clé API.

## 7. Pièges déjà payés

- **`.env` non lu** : appeler `loadRootEnv()` avant toute lecture de `process.env`.
- **`next build` cassé par `NODE_ENV`** : `apps/web/run-next.mjs` retire `NODE_ENV` du `.env`.
- **Injection NestJS silencieusement cassée** : écrire `@Inject(MonService)` explicite.
- **Champs JSON Prisma** : stocker des objets validés par Zod, jamais de sortie IA brute.
- **Port 4000 occupé** : `Get-NetTCPConnection -LocalPort 4000`.
- **Le rôle applicatif n'est pas propriétaire du schéma** (base en ligne) : une
  migration structurelle échoue ; l'appliquer avec la connexion propriétaire, puis
  `migrate resolve`. Cela vaut pour la migration `20261006120000`.
- **Hook de pré-push local** : `.githooks/pre-push` rejoue `format:check`,
  `typecheck`, `lint` et `test`.
- **Un « vert » peut venir du cache Turborepo** : forcer (`--force`) et une tâche par
  invocation pour une preuve.
- **Node de la machine v24.10.0** alors que le dépôt exige `>= 24.18 < 25`.
- **Un test peut flotter sous charge** : relancer en run frais avant de conclure.

## 8. Mesures récentes (datées)

Toutes les mesures ci-dessous sont datées ; elles ne sont pas rejouées à chaque
lecture du document.

- **Tests** — `pnpm test --force` (run frais) le 2026-10-06 : **38/38 tâches
  Turborepo, 580 tests verts** (job-connectors 190, job-normalization 51,
  job-pipeline 43, crawler 37, agent 36, api 32, job-classification 26, worker 26,
  config 24, notifications 22, extract 18, web 16, ai 15, job-deduplication 13,
  shared 10, persist 10, matching 7, orchestrator 2, database 1, ui 1). **À
  re-mesurer** : 21 fichiers de test ont changé depuis.
- **Git** — 2026-10-07 : branche `main`, 189 commits, HEAD `9771b78` (2026-10-07
  01:04).
- **Consigne de contrat dans l'extraction** (2026-10-06) : offres extraites
  226 → 5, tokens de sortie ~13 k → 2,4 k, coût 12 866 → 5 419 µ$, rejets 178 → 5.
- **Mode découverte seule** (2026-10-07) : run allégé — 3 tours, 15 recherches,
  0 crawl, 0 extraction, 1 222 µ$, `lever/jobgether` ignoré ; aucune source
  nouvelle (94 → 94). POURQUOI : 0 offre acceptée sur 4 251 pages d'entreprises
  pour ~1 600 µ$, contre 10 entreprises au registre pour 812 µ$.
- **Recouvrement des job boards** (2026-10-07) : deux cycles identiques dos à dos
  → 57 offres découvertes, 13 acceptées, 0 nouvelle, 0,052 $ puis 0,064 $
  (WTTJ 7/2, HelloWork 40/8, Indeed 10/3). Un cycle aux plafonds d'alors
  (30/40/100) avait rendu 57 découvertes, 13 acceptées, 0,06 $ et +1 offre
  nouvelle (23 → 24) ; vingt minutes plus tôt, 8 offres par board apportaient 5
  offres nouvelles pour 0,014 $. D'où les plafonds **15 / 15 / 20** (WTTJ /
  HelloWork / Indeed, `env.ts` l.111-115) et le levier sur la **cadence** (un
  cycle par jour) : ~1,80 $/mois à 0,06 $ le cycle, sous le plafond de 4,5 $.
- **Classe de source** (2026-10-06) : boards d'entreprises (Lever, Greenhouse)
  4 251 découvertes / **0** acceptée / 0 $ ; France Travail (8 métiers, filtre
  alternance) 13 / 2 déjà connues / 0 $ ; job boards scrape (Indeed, WTTJ,
  HelloWork) 23 / **12** / 14 200 µ$. Un cycle de boards a fait passer la base de
  18 à 23 offres (HelloWork 7/8, Indeed 3/8, WTTJ 2/7). Élargir France Travail de
  1 à 8 métiers n'a rendu aucune offre nouvelle.
- **Sources fraîchement découvertes** (2026-10-06) : 10 collectes sur 10, 4 251
  offres, 0 acceptée. Motifs : 3 899 sans contrat du périmètre (91 %), 154
  freelance, 99 executive, 29 CDI, 8 contractor, 6 CDD, 4 employee, 2 intern,
  3 refus de localisation. Le « 0 inséré » est la structure du marché atteint.
- **Agrégateur `jobgether`** (2026-10-07) : 3 501 des 4 251 offres d'une collecte
  de 10 sources. Filtre posé, ligne retirée du registre (95 → 94 sources), plus
  aucune source `jobgether`.
- **Agent → registre** (2026-10-06) : 84 → 94 `CompanySource` (+10) en un run de
  812 µ$, là où 25 runs précédents n'en avaient créé aucune. `created` distingue
  le neuf du revu : sans lui, 36 annonces pour 10 sources créées.
- **Sélection par le modèle** (2026-10-06) : liste numérotée au lieu d'URL →
  862 → 575 µ$ (−33 %), rendement identique ; sur un run isolé, le coût total ne
  baisse que de 100 µ$ (1 687 → 1 587) car plan et extraction varient au token
  près. Candidates limitées aux 12 meilleures : sans plafond, la seule première
  sélection coûtait 1 012 µ$ sur 29 sources.
- **Planificateur de recherches** (2026-10-06) : un plan qui commence par des
  requêtes génériques envoie le crawl sur des agrégateurs (403) — le prompt impose
  donc les `site:` d'abord (80 offres extraites en 6 pages, 3 928 µ$). Sans part
  de budget par tour, le premier tour prenait les 8 pages et `refine` n'était
  jamais appelé ; avec elle, le même run a fait 3 tours, le modèle affinant vers
  les `site:` ATS (12 866 µ$).
- **Runs de contrôle** (2026-10-06) : 1 687 µ$ (3 tours, 5 pages, 0 doublon,
  2 offres extraites, 0 insérée, contre 2 493 µ$ puis 5 419 µ$) ; 1 028 µ$ (3
  tours, 8 pages, 0 extraite, aucun refus de conformité) ; 2 025 µ$ (3 sélections,
  6 pages, 2 extraites, 0 insérée). Découverte ciblée : 782 µ$ pour 8 pages, 1
  offre extraite, 0 insérée.
- **Mémoire et anti-doublon** (2026-10-06) : une même page crawlée trois fois
  avant la clé normalisée ; `jobs.lever.co/theodo` et `...?` comptées deux fois ;
  `wideCrawl` lisait 15 pages pour 6 comptées. Alias Ivalua : cinq adresses
  (`/company/careers/`, `/company/careers`, `/carrieres/`, `/carrieres`,
  `ivalua.com/company/careers/`) mènent à la même URL finale.
- **Contrat entre guillemets** (2026-10-06) : contre Brave sur `jobs.lever.co`,
  `développeur alternance` rendait 1 titre du périmètre sur 10, `développeur
"alternance"` 6 ; `-CDI` n'apportait rien, `stage OR alternance` restait à 3/10.
  Vérifié sur le modèle réel : 10 requêtes, toutes citant le contrat.
- **Portes et filtres** (2026-10-06) : porte déterministe — 127 offres extraites
  d'un board hors périmètre, 101 rejetées faute de contrat, 0 insérée ; « 0
  insérée » — sur 178 rejets, 156 CDI, 12 métiers hors périmètre, 6 dates
  absentes, 2 freelances, 1 date trop ancienne, 1 titre ; pages `?error=true`
  écartées — 1 résultat sur 8 contre Brave, 0 sur les trois autres requêtes ;
  conformité — LinkedIn et Glassdoor fermés, Indeed et HelloWork ouverts.
- **Coût du modèle** (2026-10-06) : un appel `deepseek-flash` a rendu 11 tokens
  d'entrée, 1 de sortie, 1 appel ; le coût n'est calculé que si
  `DEEPSEEK_INPUT_USD_PER_MTOK` / `DEEPSEEK_OUTPUT_USD_PER_MTOK` sont fournis.

## 9. Vérifier son travail

```bash
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
