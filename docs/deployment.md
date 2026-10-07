# DÃƒÂ©ploiement de Findit (Web Intelligence Agent) depuis un environnement vierge

Ce document dÃƒÂ©crit l'installation complÃƒÂ¨te sur une machine propre, la mise en production et le
retour arriÃƒÂ¨re. Les secrets sont dÃƒÂ©signÃƒÂ©s par leur nom de variable, jamais par leur valeur.

## 1. PrÃƒÂ©requis

| Outil          | Version        | RÃƒÂ´le                    |
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

## 3. Variables d'environnement (`.env` ÃƒÂ  la racine)

Obligatoires :

- `DATABASE_URL` - PostgreSQL. La base de production est en ligne (Neon) et la connexion exige TLS
  (`sslmode=require`). Une URL distante sans TLS doit faire ÃƒÂ©chouer le dÃƒÂ©marrage.
- `REDIS_URL` - file BullMQ du worker.
- `DEEPSEEK_API_KEY` - clÃƒÂ© de plateforme DeepSeek. Elle est obligatoire pour l'API (`parseApiEnv`,
  qui alimente le matching) ; cÃƒÂ´tÃƒÂ© worker elle n'est requise que si l'agent tourne.
- `INTERNAL_API_KEY` - clÃƒÂ© **serveur ÃƒÂ  serveur** de l'espace personnel. L'API l'exige (minimum 32
  caractÃƒÂ¨res) et `ProfileKeyGuard` la compare en temps constant : le web l'envoie en en-tÃƒÂªte
  `x-internal-key` sur `/api/profile`, le navigateur ne la voit jamais. Elle ne doit pas ÃƒÂªtre
  prÃƒÂ©fixÃƒÂ©e `NEXT_PUBLIC_`, sinon Next l'inlinerait dans les bundles clients.
- `PROFILE_PASSWORD` - mot de passe unique de `/moi`. Optionnel : sans lui, le site public tourne et
  la page annonce Ã‚Â« espace personnel non configurÃƒÂ© Ã‚Â».
- `SESSION_SECRET` - secret de signature du cookie de session (32 caractÃƒÂ¨res minimum). La signature
  engage **aussi** le mot de passe : changer l'un ou l'autre rÃƒÂ©voque les cookies dÃƒÂ©jÃƒÂ  ÃƒÂ©mis.
- `NEXT_PUBLIC_API_URL`, `CORS_ORIGIN`, `WEB_PORT` (3100), `API_PORT` (4000).

IA (DeepSeek) :

- `DEEPSEEK_MODEL` - `deepseek-flash` par dÃƒÂ©faut, `deepseek-v4-pro` pour le raisonnement fort.
- `DEEPSEEK_INPUT_USD_PER_MTOK` / `DEEPSEEK_OUTPUT_USD_PER_MTOK` - tarif du compte, en dollars par
  million de tokens. Facultatifs : les tokens consommÃƒÂ©s sont relevÃƒÂ©s dans tous les cas et inscrits
  dans le dÃƒÂ©tail des actions `EXTRACT`, mais un coÃƒÂ»t ne se dÃƒÂ©duit pas sans tarif. Sans eux,
  `AgentRun.costMicroUsd` reste ÃƒÂ  zÃƒÂ©ro. `.env.example` retient 0,30 $/M en entrÃƒÂ©e et 1,20 $/M en
  sortie (crÃƒÂªte et cache manquÃƒÂ©), soit le pire cas, dans la mÃƒÂªme logique que la garde de budget
  Apify : le coÃƒÂ»t affichÃƒÂ© ne peut pas ÃƒÂªtre sous-estimÃƒÂ©. La grille du fournisseur reste externe au
  dÃƒÂ©pÃƒÂ´t :
  [api-docs.deepseek.com/quick_start/pricing](https://api-docs.deepseek.com/quick_start/pricing).

Agent autonome (worker) :

- `AGENT_RUN_ENABLED` - ÃƒÂ©teint par dÃƒÂ©faut (`false`). Ãƒâ‚¬ `true`, le worker monte une planification
  quotidienne qui dÃƒÂ©pense des appels LLM et des requÃƒÂªtes web rÃƒÂ©els.
- `AGENT_COLLECTION_CRON` - cron du run, `0 8 * * *` par dÃƒÂ©faut, fuseau `JOB_COLLECTION_TIMEZONE`
  (`Europe/Paris`).
- `AGENT_OBJECTIVE` - objectif en langage naturel ; dÃƒÂ©faut
  `alternance et stage dÃƒÂ©veloppeur en ÃƒÅ½le-de-France`.
- `AGENT_DISCOVERY_ONLY` - `false` par dÃƒÂ©faut, `true` dans `.env.example`. Ãƒâ‚¬ `true`, l'agent
  planifie, cherche, sÃƒÂ©lectionne et enregistre les entreprises au registre, sans crawler ni
  extraire.

Ces variables sont dÃƒÂ©clarÃƒÂ©es dans `.env.example`.

Optionnelles :

- `BRAVE_SEARCH_API_KEY` - dÃƒÂ©couverte de sources web par recherche Brave. Sans elle, ni le cycle ATS
  ni l'agent ne dÃƒÂ©couvrent de nouvelles sources (`AGENT_RUN_ENABLED=true` sans clÃƒÂ© Brave laisse
  l'agent sans rÃƒÂ©sultats de recherche).
- `FRANCETRAVAIL_CLIENT_ID` / `FRANCETRAVAIL_CLIENT_SECRET` - API officielle France Travail
  (inscription gratuite sur francetravail.io, produit Ã‚Â« Offres d'emploi v2 Ã‚Â») ; sans elles, la
  source est simplement absente du cycle.
- `APIFY_API_TOKEN` - jeton du compte Apify dÃƒÂ©diÃƒÂ©, pour les job boards. Sans lui, aucun job board
  n'est collectÃƒÂ©, mÃƒÂªme interrupteur allumÃƒÂ©. Un run dÃƒÂ©pense du crÃƒÂ©dit rÃƒÂ©el : `SCRAPED_SOURCES_ENABLED`
  est **ÃƒÂ  `true` par dÃƒÂ©faut** depuis le 2026-10-07, parce que c'est la seule famille de sources qui
  a rendu des offres acceptÃƒÂ©es lors des mesures. RÃƒÂ©glages :
  `SCRAPED_COLLECTION_CRON` (6 h, heure de Paris), `SCRAPING_WTTJ_MAX_ITEMS` (15),
  `SCRAPING_HELLOWORK_MAX_ITEMS` (15), `SCRAPING_INDEED_MAX_ITEMS` (20), et les plafonds de
  dÃƒÂ©pense `SCRAPING_BUDGET_MONTHLY_USD` (4,5 pour le plan gratuit) et `SCRAPING_BUDGET_CYCLE_USD`
  (0,15). Les plafonds d'items ont ÃƒÂ©tÃƒÂ© resserrÃƒÂ©s le 2026-10-07 : deux cycles identiques dos ÃƒÂ  dos
  ont rendu les mÃƒÂªmes offres sans en ajouter aucune, la premiÃƒÂ¨re page concentrant la fraÃƒÂ®cheur.
  Remettre `SCRAPED_SOURCES_ENABLED` ÃƒÂ  `false` et redÃƒÂ©marrer le worker retire la planification.
- `TELEGRAM_*` - alertes et rÃƒÂ©sumÃƒÂ© de run ; simulation par dÃƒÂ©faut tant que
  `TELEGRAM_NOTIFICATIONS_ENABLED` et `TELEGRAM_DRY_RUN` ne sont pas rÃƒÂ©glÃƒÂ©s.

RÃƒÂ¨gle absolue : aucune valeur rÃƒÂ©elle dans `.env.example`, jamais - un incident a dÃƒÂ©jÃƒÂ  ÃƒÂ©tÃƒÂ© payÃƒÂ© et le
hook de prÃƒÂ©-commit le bloque.

## 4. Base, donnÃƒÂ©es, modÃƒÂ¨le

```bash
pnpm infra:up                                        # Redis, et PostgreSQL local si besoin
pnpm db:migrate                                      # migrations : additives sauf la suppression de l'espace privÃƒÂ©
pnpm registry:sync                                   # registre de conformitÃƒÂ© des connecteurs
pnpm --filter @findit/database db:import-companies   # annuaire (packages/database/data)
pnpm careers:scan                                    # trouve les ATS des sites carriÃƒÂ¨res
```

`pnpm infra:up` ne sert qu'ÃƒÂ  Redis et ÃƒÂ  une ÃƒÂ©ventuelle base locale : en production, `DATABASE_URL`
pointe sur la base en ligne, et c'est elle que les migrations visent.

Le rÃƒÂ´le applicatif n'est **pas propriÃƒÂ©taire du schÃƒÂ©ma** de la base en ligne. Une migration qui
change la structure ÃƒÂ©choue donc et laisse une ligne d'historique en ÃƒÂ©chec : appliquer le changement
avec une connexion propriÃƒÂ©taire, puis rÃƒÂ©concilier l'historique par `prisma migrate resolve`
(`--rolled-back` puis `--applied`). La procÃƒÂ©dure est rappelÃƒÂ©e dans [HANDOFF.md](../HANDOFF.md) Ã‚Â§7 et
[docs/architecture.md](architecture.md), Ã‚Â« Limites connues Ã‚Â».
`DATABASE_URL_OWNER` existe dans le `.env` local mais n'est dÃƒÂ©clarÃƒÂ© nulle part dans le code ni dans
`.env.example`.

`pnpm db:seed` insÃƒÂ¨re des offres de DÃƒâ€°MONSTRATION (marquÃƒÂ©es `isDemo`) - utile en dÃƒÂ©veloppement, ÃƒÂ  ne
pas jouer en production.

## 5. DÃƒÂ©marrage

DÃƒÂ©veloppement : `pnpm dev` (turbo lance web, api, worker).

Production :

```bash
pnpm build
pnpm --filter @findit/api start      # node dist/main.js, port API_PORT (4000)
pnpm --filter @findit/worker start   # node dist/main.js
pnpm --filter @findit/web start      # run-next.mjs : port WEB_PORT (3100)
```

Le web passe par `apps/web/run-next.mjs`, qui charge le `.env` racine et transmet `WEB_PORT` ÃƒÂ 
Next ; lancer `next start` directement contourne ce chargement.

ContrÃƒÂ´les de vie : `GET /health` sur l'API ; la home rÃƒÂ©pond sur 3100.

## 6. Exposition publique

DÃƒÂ©ploiement en ligne au 2026-10-07 :

- **Web** sur Vercel, projet `finditfr`, ÃƒÂ  l'adresse **https://finditfr.vercel.app**. La racine du
  projet est `apps/web` ; l'installation et le build partent de la racine du monorepo (le web importe
  `@findit/config` via son `dist`, donc l'installer seul ne suffit pas). `apps/web/vercel.json` porte
  ces commandes, les rÃƒÂ©glages du projet vivent cÃƒÂ´tÃƒÂ© Vercel.
- **API** sur Vercel, projet `finditfr-api`, ÃƒÂ  l'adresse **https://finditfr-api.vercel.app**. Racine
  `apps/api` ; l'entrÃƒÂ©e serverless est `apps/api/api/[...chemin].ts` (voir plus bas). Variables posÃƒÂ©es
  sur le projet : `DATABASE_URL`, `DEEPSEEK_API_KEY`, `INTERNAL_API_KEY`, `CORS_ORIGIN`,
  `API_PORT`, `NODE_ENV`. Aucune ne va dans le dÃƒÂ©pÃƒÂ´t.
- **Worker** : nulle part pour l'instant. BullMQ a besoin d'un processus permanent, que Vercel
  n'offre pas. La collecte planifiÃƒÂ©e ne tourne donc que sur une machine locale.

**Le piÃƒÂ¨ge de routage, et comment il est contournÃƒÂ©.** Le routage de Vercel dans le dossier `api/` ne
laisse passer **qu'un seul segment** aprÃƒÂ¨s `/api` : mesurÃƒÂ© le 2026-10-07, avec les deux formes de
catch-all, `/api/jobs` rÃƒÂ©pondait 200 tandis que `/api/jobs/stats` renvoyait un 404 **sans corps** Ã¢â‚¬â€
donc ÃƒÂ©mis par la plateforme, pas par Nest (qui rÃƒÂ©pond toujours du JSON). Cinq relais d'une ligne
rÃƒÂ©tablissent la profondeur manquante : `api/jobs/[...chemin].ts`, `api/agent/[...chemin].ts`,
`api/agent/runs/[...chemin].ts`, `api/matching/[...chemin].ts`,
`api/matching/history/[...chemin].ts`, chacun rÃƒÂ©exportant le gestionnaire unique. **Ãƒâ‚¬ supprimer** le
jour oÃƒÂ¹ la plateforme route les catch-all sur plusieurs segments : c'est un contournement, pas une
architecture.

**HÃ©berger le worker** (brique ouverte au 2026-10-07). C'est la **seule** brique qui exige un processus permanent, et elle a besoin d'un **Redis hÃ©bergÃ©** â€” seul le worker parle Ã  Redis, jamais l'API ni le web.

- **Image** : `Dockerfile.worker`, construit depuis la **racine** du dÃ©pÃ´t (`docker build -f Dockerfile.worker -t findit-worker .`). Elle part de l'image officielle Playwright parce que le worker exÃ©cute l'agent, qui crawle avec Chromium ; une image Node nue obligerait Ã  rÃ©installer le navigateur Ã  chaque dÃ©marrage.
- **VÃ©rifiÃ©e en local** : le conteneur dÃ©marre, se connecte au Redis local via `host.docker.internal`, enregistre **les 3 planificateurs** et **consomme** (deux consommateurs comptÃ©s dans BullMQ pendant le test, celui du conteneur et celui de la machine).
- **Taille : 4,71 Go.** Ã€ savoir avant de choisir un hÃ©bergeur ou un disque : la base Playwright et Chromium pÃ¨sent l'essentiel.
- **Aucun port n'est exposÃ©** : le worker consomme et planifie, il n'Ã©coute rien. Sa santÃ© se lit dans ses journaux, dans les `ConnectorRun` Ã©crits en base et dans les planificateurs enregistrÃ©s dans Redis â€” pas par un `GET /health`.
- **Variables** : celles du schÃ©ma worker (`DATABASE_URL`, `REDIS_URL`, `APIFY_API_TOKEN`, `BRAVE_SEARCH_API_KEY`, `DEEPSEEK_API_KEY`, `AGENT_*`, `SCRAPED_*`, `FRANCETRAVAIL_*`, `TELEGRAM_*` si les notifications sont voulues, `APP_URL`). Les valeurs sont celles du `.env` local ; **aucune ne doit entrer dans le dÃ©pÃ´t**.
- **Aucun cron externe n'est nÃ©cessaire** : les planificateurs BullMQ s'enregistrent au dÃ©marrage (report idempotent). Il suffit que le service reste allumÃ©.
- **CoÃ»ts, honnÃªtement** : sur Render, le type Â« Background Worker Â» est **payant** â€” l'offre gratuite ne couvre que les services web. Railway facture Ã  l'usage et sait lire un Dockerfile. Fly.io donne une petite allocation et s'accompagne d'un Redis managÃ© (Upstash, par exemple). Le Redis managÃ© suffit : BullMQ n'exige rien d'exotique.

Notes d'exploitation :

- HTTPS par reverse proxy (Caddy/nginx) devant 3100 uniquement.
- L'API 4000 ne s'expose JAMAIS directement : en local, le web l'atteint en interne.
- L'authentification existe depuis le 2026-10-07 : un mot de passe unique protège **l'espace personnel /moi et le dashboard d'exploitation /dashboard**. Le POURQUOI de cette extension : seul /moi était gardé, et en ligne /dashboard, /dashboard/logs, /dashboard/config et /dashboard/crawls répondaient **200 sans mot de passe** — journaux, configuration et état interne lisibles par quiconque connaît l'URL (constat du 2026-10-07, corrigé par proxy.ts, épinglé par un test). Restent **publics** : la liste des offres, la fiche d'une offre et les routes de l'API qu'elles utilisent. Un contrôle : /dashboard doit répondre 307 vers /connexion sans session.
- L'offre gratuite de Render endort le service : le premier appel aprÃƒÂ¨s une veille paie le
  dÃƒÂ©marrage de Nest et la connexion ÃƒÂ  la base.

## 7. Sauvegardes et retour arriÃƒÂ¨re

- Sauvegarde : `pg_dump` de la base (offres, entreprises et registre sont le patrimoine ÃƒÂ  sauver).
- Retour arriÃƒÂ¨re applicatif : `git checkout <commit prÃƒÂ©cÃƒÂ©dent>` puis `pnpm install && pnpm build` et
  redÃƒÂ©marrage. Les migrations courantes sont additives, mais
  `20261006120000_agent_and_remove_private` est destructive : un binaire antÃƒÂ©rieur ÃƒÂ  cette migration
  n'est plus compatible avec le schÃƒÂ©ma.
- Ne jamais faire de `migrate reset` en production.

## 8. VÃƒÂ©rification post-dÃƒÂ©ploiement

```bash
pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Puis sur le rÃƒÂ©el : `GET /health`, une collecte ATS (`ConnectorRun` en base), et - si l'agent est
allumÃƒÂ© - un run (`AgentRun`) avec `DEEPSEEK_API_KEY` et `BRAVE_SEARCH_API_KEY`. Les job boards
tournent par dÃƒÂ©faut : vÃƒÂ©rifier un `ConnectorRun` du cycle `scraped-collection` quand
`APIFY_API_TOKEN` est fourni ; `pnpm board:proof` reste l'exÃƒÂ©cution ÃƒÂ  la demande, hors cron. Les
scores de CV se testent par `POST /api/matching/score` avec un corps `{ cvText }`. Hors saison,
l'absence d'offres exploitables est un rÃƒÂ©sultat normal, pas une panne.
