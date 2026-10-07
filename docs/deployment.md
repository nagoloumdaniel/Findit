# DÃ©ploiement de Findit (Web Intelligence Agent) depuis un environnement vierge

Ce document dÃ©crit l'installation complÃ¨te sur une machine propre, la mise en production et le
retour arriÃ¨re. Les secrets sont dÃ©signÃ©s par leur nom de variable, jamais par leur valeur.

## 1. PrÃ©requis

| Outil          | Version        | RÃ´le                      |
| -------------- | -------------- | -------------------------- |
| Node.js        | >= 24.18, < 25 | Runtime de toutes les apps |
| pnpm           | 11.13.1        | Gestionnaire du monorepo   |
| Docker Compose | v2             | PostgreSQL et Redis locaux |

## 2. Installation

```bash
git clone https://github.com/nagoloumdaniel/Findit.git
cd Findit
pnpm install
pnpm setup:hooks        # hook anti-secret, une fois
cp .env.example .env    # puis renseigner les variables ci-dessous
```

## 3. Variables d'environnement (`.env` Ã  la racine)

Obligatoires :

- `DATABASE_URL` - PostgreSQL. La base de production est en ligne (Neon) et la connexion exige TLS
  (`sslmode=require`). Une URL distante sans TLS doit faire Ã©chouer le dÃ©marrage.
- `REDIS_URL` - file BullMQ du worker.
- `DEEPSEEK_API_KEY` - clÃ© de plateforme DeepSeek. Elle est obligatoire pour l'API (`parseApiEnv`,
  qui alimente le matching) ; cÃ´tÃ© worker elle n'est requise que si l'agent tourne.
- `INTERNAL_API_KEY` - clÃ© **serveur Ã  serveur** de l'espace personnel. L'API l'exige (minimum 32
  caractÃ¨res) et `ProfileKeyGuard` la compare en temps constant : le web l'envoie en en-tÃªte
  `x-internal-key` sur `/api/profile`, le navigateur ne la voit jamais. Elle ne doit pas Ãªtre
  prÃ©fixÃ©e `NEXT_PUBLIC_`, sinon Next l'inlinerait dans les bundles clients.
- `PROFILE_PASSWORD` - mot de passe unique de `/moi`. Optionnel : sans lui, le site public tourne et
  la page annonce Â« espace personnel non configurÃ© Â».
- `SESSION_SECRET` - secret de signature du cookie de session (32 caractÃ¨res minimum). La signature
  engage **aussi** le mot de passe : changer l'un ou l'autre rÃ©voque les cookies dÃ©jÃ  Ã©mis.
- `NEXT_PUBLIC_API_URL`, `CORS_ORIGIN`, `WEB_PORT` (3100), `API_PORT` (4000).

IA (DeepSeek) :

- `DEEPSEEK_MODEL` - `deepseek-flash` par dÃ©faut, `deepseek-v4-pro` pour le raisonnement fort.
- `DEEPSEEK_INPUT_USD_PER_MTOK` / `DEEPSEEK_OUTPUT_USD_PER_MTOK` - tarif du compte, en dollars par
  million de tokens. Facultatifs : les tokens consommÃ©s sont relevÃ©s dans tous les cas et inscrits
  dans le dÃ©tail des actions `EXTRACT`, mais un coÃ»t ne se dÃ©duit pas sans tarif. Sans eux,
  `AgentRun.costMicroUsd` reste Ã  zÃ©ro. `.env.example` retient 0,30 $/M en entrÃ©e et 1,20 $/M en
  sortie (crÃªte et cache manquÃ©), soit le pire cas, dans la mÃªme logique que la garde de budget
  Apify : le coÃ»t affichÃ© ne peut pas Ãªtre sous-estimÃ©. La grille du fournisseur reste externe au
  dÃ©pÃ´t :
  [api-docs.deepseek.com/quick_start/pricing](https://api-docs.deepseek.com/quick_start/pricing).

Agent autonome (worker) :

- `AGENT_RUN_ENABLED` - Ã©teint par dÃ©faut (`false`). Ã€ `true`, le worker monte une planification
  quotidienne qui dÃ©pense des appels LLM et des requÃªtes web rÃ©els.
- `AGENT_COLLECTION_CRON` - cron du run, `0 8 * * *` par dÃ©faut, fuseau `JOB_COLLECTION_TIMEZONE`
  (`Europe/Paris`).
- `AGENT_OBJECTIVE` - objectif en langage naturel ; dÃ©faut
  `alternance et stage dÃ©veloppeur en ÃŽle-de-France`.
- `AGENT_DISCOVERY_ONLY` - `false` par dÃ©faut, `true` dans `.env.example`. Ã€ `true`, l'agent
  planifie, cherche, sÃ©lectionne et enregistre les entreprises au registre, sans crawler ni
  extraire.

Ces variables sont dÃ©clarÃ©es dans `.env.example`.

Optionnelles :

- `BRAVE_SEARCH_API_KEY` - dÃ©couverte de sources web par recherche Brave. Sans elle, ni le cycle ATS
  ni l'agent ne dÃ©couvrent de nouvelles sources (`AGENT_RUN_ENABLED=true` sans clÃ© Brave laisse
  l'agent sans rÃ©sultats de recherche).
- `FRANCETRAVAIL_CLIENT_ID` / `FRANCETRAVAIL_CLIENT_SECRET` - API officielle France Travail
  (inscription gratuite sur francetravail.io, produit Â« Offres d'emploi v2 Â») ; sans elles, la
  source est simplement absente du cycle.
- `APIFY_API_TOKEN` - jeton du compte Apify dÃ©diÃ©, pour les job boards. Sans lui, aucun job board
  n'est collectÃ©, mÃªme interrupteur allumÃ©. Un run dÃ©pense du crÃ©dit rÃ©el : `SCRAPED_SOURCES_ENABLED`
  est **Ã  `true` par dÃ©faut** depuis le 2026-10-07, parce que c'est la seule famille de sources qui
  a rendu des offres acceptÃ©es lors des mesures. RÃ©glages :
  `SCRAPED_COLLECTION_CRON` (6 h, heure de Paris), `SCRAPING_WTTJ_MAX_ITEMS` (15),
  `SCRAPING_HELLOWORK_MAX_ITEMS` (15), `SCRAPING_INDEED_MAX_ITEMS` (20), et les plafonds de
  dÃ©pense `SCRAPING_BUDGET_MONTHLY_USD` (4,5 pour le plan gratuit) et `SCRAPING_BUDGET_CYCLE_USD`
  (0,15). Les plafonds d'items ont Ã©tÃ© resserrÃ©s le 2026-10-07 : deux cycles identiques dos Ã  dos
  ont rendu les mÃªmes offres sans en ajouter aucune, la premiÃ¨re page concentrant la fraÃ®cheur.
  Remettre `SCRAPED_SOURCES_ENABLED` Ã  `false` et redÃ©marrer le worker retire la planification.
- `TELEGRAM_*` - alertes et rÃ©sumÃ© de run ; simulation par dÃ©faut tant que
  `TELEGRAM_NOTIFICATIONS_ENABLED` et `TELEGRAM_DRY_RUN` ne sont pas rÃ©glÃ©s.

RÃ¨gle absolue : aucune valeur rÃ©elle dans `.env.example`, jamais - un incident a dÃ©jÃ  Ã©tÃ© payÃ© et le
hook de prÃ©-commit le bloque.

## 4. Base, donnÃ©es, modÃ¨le

```bash
pnpm infra:up                                        # Redis, et PostgreSQL local si besoin
pnpm db:migrate                                      # migrations : additives sauf la suppression de l'espace privÃ©
pnpm registry:sync                                   # registre de conformitÃ© des connecteurs
pnpm --filter @findit/database db:import-companies   # annuaire (packages/database/data)
pnpm careers:scan                                    # trouve les ATS des sites carriÃ¨res
```

`pnpm infra:up` ne sert qu'Ã  Redis et Ã  une Ã©ventuelle base locale : en production, `DATABASE_URL`
pointe sur la base en ligne, et c'est elle que les migrations visent.

Le rÃ´le applicatif n'est **pas propriÃ©taire du schÃ©ma** de la base en ligne. Une migration qui
change la structure Ã©choue donc et laisse une ligne d'historique en Ã©chec : appliquer le changement
avec une connexion propriÃ©taire, puis rÃ©concilier l'historique par `prisma migrate resolve`
(`--rolled-back` puis `--applied`). La procÃ©dure est rappelÃ©e dans [HANDOFF.md](../HANDOFF.md) Â§7 et
[docs/architecture.md](architecture.md), Â« Limites connues Â».
`DATABASE_URL_OWNER` existe dans le `.env` local mais n'est dÃ©clarÃ© nulle part dans le code ni dans
`.env.example`.

`pnpm db:seed` insÃ¨re des offres de DÃ‰MONSTRATION (marquÃ©es `isDemo`) - utile en dÃ©veloppement, Ã  ne
pas jouer en production.

## 5. DÃ©marrage

DÃ©veloppement : `pnpm dev` (turbo lance web, api, worker).

Production :

```bash
pnpm build
pnpm --filter @findit/api start      # node dist/main.js, port API_PORT (4000)
pnpm --filter @findit/worker start   # node dist/main.js
pnpm --filter @findit/web start      # run-next.mjs : port WEB_PORT (3100)
```

Le web passe par `apps/web/run-next.mjs`, qui charge le `.env` racine et transmet `WEB_PORT` Ã 
Next ; lancer `next start` directement contourne ce chargement.

ContrÃ´les de vie : `GET /health` sur l'API ; la home rÃ©pond sur 3100.

## 6. Exposition publique

DÃ©ploiement en ligne au 2026-10-07 :

- **Web** sur Vercel, projet `finditfr`, Ã  l'adresse **https://finditfr.vercel.app**. La racine du
  projet est `apps/web` ; l'installation et le build partent de la racine du monorepo (le web importe
  `@findit/config` via son `dist`, donc l'installer seul ne suffit pas). `apps/web/vercel.json` porte
  ces commandes, les rÃ©glages du projet vivent cÃ´tÃ© Vercel.
- **API** sur Vercel, projet `finditfr-api`, Ã  l'adresse **https://finditfr-api.vercel.app**. Racine
  `apps/api` ; l'entrÃ©e serverless est `apps/api/api/[...chemin].ts` (voir plus bas). Variables posÃ©es
  sur le projet : `DATABASE_URL`, `DEEPSEEK_API_KEY`, `INTERNAL_API_KEY`, `CORS_ORIGIN`,
  `API_PORT`, `NODE_ENV`. Aucune ne va dans le dÃ©pÃ´t.
- **Worker** : nulle part pour l'instant. BullMQ a besoin d'un processus permanent, que Vercel
  n'offre pas. La collecte planifiÃ©e ne tourne donc que sur une machine locale.

**Le piÃ¨ge de routage, et comment il est contournÃ©.** Le routage de Vercel dans le dossier `api/` ne
laisse passer **qu'un seul segment** aprÃ¨s `/api` : mesurÃ© le 2026-10-07, avec les deux formes de
catch-all, `/api/jobs` rÃ©pondait 200 tandis que `/api/jobs/stats` renvoyait un 404 **sans corps** â€”
donc Ã©mis par la plateforme, pas par Nest (qui rÃ©pond toujours du JSON). Cinq relais d'une ligne
rÃ©tablissent la profondeur manquante : `api/jobs/[...chemin].ts`, `api/agent/[...chemin].ts`,
`api/agent/runs/[...chemin].ts`, `api/matching/[...chemin].ts`,
`api/matching/history/[...chemin].ts`, chacun rÃ©exportant le gestionnaire unique. **Ã€ supprimer** le
jour oÃ¹ la plateforme route les catch-all sur plusieurs segments : c'est un contournement, pas une
architecture.

**Héberger le worker** (brique ouverte au 2026-10-07). C'est la **seule** brique qui exige un processus permanent, et elle a besoin d'un **Redis hébergé** — seul le worker parle à Redis, jamais l'API ni le web.

- **Image** : `Dockerfile.worker`, construit depuis la **racine** du dépôt (`docker build -f Dockerfile.worker -t findit-worker .`). Elle part de l'image officielle Playwright parce que le worker exécute l'agent, qui crawle avec Chromium ; une image Node nue obligerait à réinstaller le navigateur à chaque démarrage.
- **Vérifiée en local** : le conteneur démarre, se connecte au Redis local via `host.docker.internal`, enregistre **les 3 planificateurs** et **consomme** (deux consommateurs comptés dans BullMQ pendant le test, celui du conteneur et celui de la machine).
- **Taille : 4,71 Go.** À savoir avant de choisir un hébergeur ou un disque : la base Playwright et Chromium pèsent l'essentiel.
- **Aucun port n'est exposé** : le worker consomme et planifie, il n'écoute rien. Sa santé se lit dans ses journaux, dans les `ConnectorRun` écrits en base et dans les planificateurs enregistrés dans Redis — pas par un `GET /health`.
- **Variables** : celles du schéma worker (`DATABASE_URL`, `REDIS_URL`, `APIFY_API_TOKEN`, `BRAVE_SEARCH_API_KEY`, `DEEPSEEK_API_KEY`, `AGENT_*`, `SCRAPED_*`, `FRANCETRAVAIL_*`, `TELEGRAM_*` si les notifications sont voulues, `APP_URL`). Les valeurs sont celles du `.env` local ; **aucune ne doit entrer dans le dépôt**.
- **Aucun cron externe n'est nécessaire** : les planificateurs BullMQ s'enregistrent au démarrage (report idempotent). Il suffit que le service reste allumé.
- **Coûts, honnêtement** : sur Render, le type « Background Worker » est **payant** — l'offre gratuite ne couvre que les services web. Railway facture à l'usage et sait lire un Dockerfile. Fly.io donne une petite allocation et s'accompagne d'un Redis managé (Upstash, par exemple). Le Redis managé suffit : BullMQ n'exige rien d'exotique.

Notes d'exploitation :

- HTTPS par reverse proxy (Caddy/nginx) devant 3100 uniquement.
- L'API 4000 ne s'expose JAMAIS directement : en local, le web l'atteint en interne.
- L'authentification existe depuis le 2026-10-07, mais elle ne couvre que `/moi` (mot de passe
  unique). Le dashboard `/dashboard` et les routes publiques de l'API restent ouverts : une instance
  publique doit protÃ©ger le reste par l'authentification du reverse proxy ou en n'exposant pas le
  dashboard.
- L'offre gratuite de Render endort le service : le premier appel aprÃ¨s une veille paie le
  dÃ©marrage de Nest et la connexion Ã  la base.

## 7. Sauvegardes et retour arriÃ¨re

- Sauvegarde : `pg_dump` de la base (offres, entreprises et registre sont le patrimoine Ã  sauver).
- Retour arriÃ¨re applicatif : `git checkout <commit prÃ©cÃ©dent>` puis `pnpm install && pnpm build` et
  redÃ©marrage. Les migrations courantes sont additives, mais
  `20261006120000_agent_and_remove_private` est destructive : un binaire antÃ©rieur Ã  cette migration
  n'est plus compatible avec le schÃ©ma.
- Ne jamais faire de `migrate reset` en production.

## 8. VÃ©rification post-dÃ©ploiement

```bash
pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Puis sur le rÃ©el : `GET /health`, une collecte ATS (`ConnectorRun` en base), et - si l'agent est
allumÃ© - un run (`AgentRun`) avec `DEEPSEEK_API_KEY` et `BRAVE_SEARCH_API_KEY`. Les job boards
tournent par dÃ©faut : vÃ©rifier un `ConnectorRun` du cycle `scraped-collection` quand
`APIFY_API_TOKEN` est fourni ; `pnpm board:proof` reste l'exÃ©cution Ã  la demande, hors cron. Les
scores de CV se testent par `POST /api/matching/score` avec un corps `{ cvText }`. Hors saison,
l'absence d'offres exploitables est un rÃ©sultat normal, pas une panne.
