# Déploiement de Findit (Web Intelligence Agent) depuis un environnement vierge

Ce document décrit l'installation complète sur une machine propre, la mise en production et le
retour arrière. Les secrets sont désignés par leur nom de variable, jamais par leur valeur.

## 1. Prérequis

| Outil          | Version        | Rôle                       |
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

## 3. Variables d'environnement (`.env` à la racine)

Obligatoires :

- `DATABASE_URL` - PostgreSQL. La base de production est en ligne (Neon) et la connexion exige TLS
  (`sslmode=require`). Une URL distante sans TLS doit faire échouer le démarrage.
- `REDIS_URL` - file BullMQ du worker.
- `DEEPSEEK_API_KEY` - clé de plateforme DeepSeek. Elle est obligatoire pour l'API (`parseApiEnv`,
  qui alimente le matching) ; côté worker elle n'est requise que si l'agent tourne.
- `INTERNAL_API_KEY` - **variable héritée**. `parseApiEnv` l'exige encore (minimum 32 caractères) et
  l'API refuse de démarrer sans elle, mais plus aucun code ne la lit : il n'y a plus de proxy Next
  `/api/ws/*` ni de garde `WorkspaceGuard`. La retirer pour de bon suppose de modifier le schéma
  dans `packages/config/src/env.ts`.
- `NEXT_PUBLIC_API_URL`, `CORS_ORIGIN`, `WEB_PORT` (3100), `API_PORT` (4000).

IA (DeepSeek) :

- `DEEPSEEK_MODEL` - `deepseek-flash` par défaut, `deepseek-v4-pro` pour le raisonnement fort.

Agent autonome (worker) :

- `AGENT_RUN_ENABLED` - éteint par défaut (`false`). À `true`, le worker monte une planification
  quotidienne qui dépense des appels LLM et des requêtes web réels.
- `AGENT_COLLECTION_CRON` - cron du run, `0 8 * * *` par défaut, fuseau `JOB_COLLECTION_TIMEZONE`
  (`Europe/Paris`).
- `AGENT_OBJECTIVE` - objectif en langage naturel ; défaut
  `alternance et stage développeur en Île-de-France`.

Ces trois variables sont lues par `packages/config/src/env.ts` mais absentes de `.env.example` :
les ajouter au `.env` est nécessaire pour changer les défauts de l'agent.

Optionnelles :

- `BRAVE_SEARCH_API_KEY` - découverte de sources web par recherche Brave. Sans elle, ni le cycle ATS
  ni l'agent ne découvrent de nouvelles sources (`AGENT_RUN_ENABLED=true` sans clé Brave laisse
  l'agent sans résultats de recherche).
- `FRANCETRAVAIL_CLIENT_ID` / `FRANCETRAVAIL_CLIENT_SECRET` - API officielle France Travail
  (inscription gratuite sur francetravail.io, produit « Offres d'emploi v2 ») ; sans elles, la
  source est simplement absente du cycle.
- `APIFY_API_TOKEN` - jeton du compte Apify dédié, pour les job boards. Sans lui, aucun job board
  n'est collecté, même interrupteur allumé. Un run dépense du crédit réel : le cycle quotidien des
  job boards reste éteint tant que `SCRAPED_SOURCES_ENABLED` n'est pas à `true`. Réglages :
  `SCRAPED_COLLECTION_CRON` (6 h, heure de Paris), `SCRAPING_WTTJ_MAX_ITEMS` (30),
  `SCRAPING_HELLOWORK_MAX_ITEMS` (40), `SCRAPING_INDEED_MAX_ITEMS` (100), et les plafonds de
  dépense `SCRAPING_BUDGET_MONTHLY_USD` (4,5 pour le plan gratuit) et `SCRAPING_BUDGET_CYCLE_USD`
  (0,15). Remettre l'interrupteur à `false` et redémarrer le worker retire la planification.
- `TELEGRAM_*` - alertes et résumé de run ; simulation par défaut tant que
  `TELEGRAM_NOTIFICATIONS_ENABLED` et `TELEGRAM_DRY_RUN` ne sont pas réglés.
- `SCRAPEGRAPH_API_KEY` - déclarée dans le schéma worker et `.env.example`, mais lue nulle part
  ailleurs dans le code à ce jour.

Règle absolue : aucune valeur réelle dans `.env.example`, jamais - un incident a déjà été payé et le
hook de pré-commit le bloque.

## 4. Base, données, modèle

```bash
pnpm infra:up                                        # Redis, et PostgreSQL local si besoin
pnpm db:migrate                                      # migrations, additives uniquement
pnpm registry:sync                                   # registre de conformité des connecteurs
pnpm --filter @findit/database db:import-companies   # annuaire (packages/database/data)
pnpm careers:scan                                    # trouve les ATS des sites carrières
```

`pnpm infra:up` ne sert qu'à Redis et à une éventuelle base locale : en production, `DATABASE_URL`
pointe sur la base en ligne, et c'est elle que les migrations visent.

Le rôle applicatif n'est **pas propriétaire du schéma** de la base en ligne. Une migration qui
change la structure échoue donc et laisse une ligne d'historique en échec : appliquer le changement
avec une connexion propriétaire, puis réconcilier l'historique par `prisma migrate resolve`
(`--rolled-back` puis `--applied`). La procédure est rappelée dans [HANDOFF.md](../HANDOFF.md) §7 et
[docs/architecture.md](architecture.md), « Limites connues ».
`DATABASE_URL_OWNER` existe dans le `.env` local mais n'est déclaré nulle part dans le code ni dans
`.env.example`.

`pnpm db:seed` insère des offres de DÉMONSTRATION (marquées `isDemo`) - utile en développement, à ne
pas jouer en production.

## 5. Démarrage

Développement : `pnpm dev` (turbo lance web, api, worker).

Production :

```bash
pnpm build
pnpm --filter @findit/api start      # node dist/main.js, port API_PORT (4000)
pnpm --filter @findit/worker start   # node dist/main.js
pnpm --filter @findit/web start      # run-next.mjs : port WEB_PORT (3100)
```

Le web passe par `apps/web/run-next.mjs`, qui charge le `.env` racine et transmet `WEB_PORT` à
Next ; lancer `next start` directement contourne ce chargement.

Contrôles de vie : `GET /health` sur l'API ; la home répond sur 3100.

## 6. Exposition publique

- HTTPS par reverse proxy (Caddy/nginx) devant 3100 uniquement.
- L'API 4000 ne s'expose JAMAIS directement : le web l'atteint en local.
- Aucune authentification n'existe : le dashboard `/dashboard` et toutes les routes de l'API sont
  ouverts. Une instance publique doit soit protéger le site entier par l'authentification du
  reverse proxy, soit ne pas exposer le dashboard.

## 7. Sauvegardes et retour arrière

- Sauvegarde : `pg_dump` de la base (offres, entreprises et registre sont le patrimoine à sauver).
- Retour arrière applicatif : `git checkout <commit précédent>` puis `pnpm install && pnpm build` et
  redémarrage. Les migrations étant additives uniquement, un binaire ancien tourne sur un schéma
  plus récent.
- Ne jamais faire de `migrate reset` en production.

## 8. Vérification post-déploiement

```bash
pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Puis sur le réel : `GET /health`, une collecte ATS (`ConnectorRun` en base), et - si l'agent est
allumé - un run (`AgentRun`) avec `DEEPSEEK_API_KEY` et `BRAVE_SEARCH_API_KEY`. Les job boards se
vérifient à la demande par `pnpm board:proof`. Les scores de CV se testent par
`POST /api/matching/score` avec un corps `{ cvText }`. Hors saison, l'absence d'offres exploitables
est un résultat normal, pas une panne.
