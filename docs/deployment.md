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
- `INTERNAL_API_KEY` - clé **serveur à serveur** de l'espace personnel. L'API l'exige (minimum 32
  caractères) et `ProfileKeyGuard` la compare en temps constant : le web l'envoie en en-tête
  `x-internal-key` sur `/api/profile`, le navigateur ne la voit jamais. Elle ne doit pas être
  préfixée `NEXT_PUBLIC_`, sinon Next l'inlinerait dans les bundles clients.
- `PROFILE_PASSWORD` - mot de passe unique de `/moi`. Optionnel : sans lui, le site public tourne et
  la page annonce « espace personnel non configuré ».
- `SESSION_SECRET` - secret de signature du cookie de session (32 caractères minimum). La signature
  engage **aussi** le mot de passe : changer l'un ou l'autre révoque les cookies déjà émis.
- `NEXT_PUBLIC_API_URL`, `CORS_ORIGIN`, `WEB_PORT` (3100), `API_PORT` (4000).

IA (DeepSeek) :

- `DEEPSEEK_MODEL` - `deepseek-flash` par défaut, `deepseek-v4-pro` pour le raisonnement fort.
- `DEEPSEEK_INPUT_USD_PER_MTOK` / `DEEPSEEK_OUTPUT_USD_PER_MTOK` - tarif du compte, en dollars par
  million de tokens. Facultatifs : les tokens consommés sont relevés dans tous les cas et inscrits
  dans le détail des actions `EXTRACT`, mais un coût ne se déduit pas sans tarif. Sans eux,
  `AgentRun.costMicroUsd` reste à zéro. `.env.example` retient 0,30 $/M en entrée et 1,20 $/M en
  sortie (crête et cache manqué), soit le pire cas, dans la même logique que la garde de budget
  Apify : le coût affiché ne peut pas être sous-estimé. La grille du fournisseur reste externe au
  dépôt :
  [api-docs.deepseek.com/quick_start/pricing](https://api-docs.deepseek.com/quick_start/pricing).

Agent autonome (worker) :

- `AGENT_RUN_ENABLED` - éteint par défaut (`false`). À `true`, le worker monte une planification
  quotidienne qui dépense des appels LLM et des requêtes web réels.
- `AGENT_COLLECTION_CRON` - cron du run, `0 8 * * *` par défaut, fuseau `JOB_COLLECTION_TIMEZONE`
  (`Europe/Paris`).
- `AGENT_OBJECTIVE` - objectif en langage naturel ; défaut
  `alternance et stage développeur en Île-de-France`.
- `AGENT_DISCOVERY_ONLY` - `false` par défaut, `true` dans `.env.example`. À `true`, l'agent
  planifie, cherche, sélectionne et enregistre les entreprises au registre, sans crawler ni
  extraire.

Ces variables sont déclarées dans `.env.example`.

Optionnelles :

- `BRAVE_SEARCH_API_KEY` - découverte de sources web par recherche Brave. Sans elle, ni le cycle ATS
  ni l'agent ne découvrent de nouvelles sources (`AGENT_RUN_ENABLED=true` sans clé Brave laisse
  l'agent sans résultats de recherche).
- `FRANCETRAVAIL_CLIENT_ID` / `FRANCETRAVAIL_CLIENT_SECRET` - API officielle France Travail
  (inscription gratuite sur francetravail.io, produit « Offres d'emploi v2 ») ; sans elles, la
  source est simplement absente du cycle.
- `APIFY_API_TOKEN` - jeton du compte Apify dédié, pour les job boards. Sans lui, aucun job board
  n'est collecté, même interrupteur allumé. Un run dépense du crédit réel : `SCRAPED_SOURCES_ENABLED`
  est **à `true` par défaut** depuis le 2026-10-07, parce que c'est la seule famille de sources qui
  a rendu des offres acceptées lors des mesures. Réglages :
  `SCRAPED_COLLECTION_CRON` (6 h, heure de Paris), `SCRAPING_WTTJ_MAX_ITEMS` (15),
  `SCRAPING_HELLOWORK_MAX_ITEMS` (15), `SCRAPING_INDEED_MAX_ITEMS` (20), et les plafonds de
  dépense `SCRAPING_BUDGET_MONTHLY_USD` (4,5 pour le plan gratuit) et `SCRAPING_BUDGET_CYCLE_USD`
  (0,15). Les plafonds d'items ont été resserrés le 2026-10-07 : deux cycles identiques dos à dos
  ont rendu les mêmes offres sans en ajouter aucune, la première page concentrant la fraîcheur.
  Remettre `SCRAPED_SOURCES_ENABLED` à `false` et redémarrer le worker retire la planification.
- `TELEGRAM_*` - alertes et résumé de run ; simulation par défaut tant que
  `TELEGRAM_NOTIFICATIONS_ENABLED` et `TELEGRAM_DRY_RUN` ne sont pas réglés.

Règle absolue : aucune valeur réelle dans `.env.example`, jamais - un incident a déjà été payé et le
hook de pré-commit le bloque.

## 4. Base, données, modèle

```bash
pnpm infra:up                                        # Redis, et PostgreSQL local si besoin
pnpm db:migrate                                      # migrations : additives sauf la suppression de l'espace privé
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

Déploiement en ligne au 2026-10-07 :

- **Web** sur Vercel, projet `finditfr`, à l'adresse **https://finditfr.vercel.app**. La racine du
  projet est `apps/web` ; l'installation et le build partent de la racine du monorepo (le web importe
  `@findit/config` via son `dist`, donc l'installer seul ne suffit pas). `apps/web/vercel.json` porte
  ces commandes, les réglages du projet vivent côté Vercel.
- **API** sur Vercel, projet `finditfr-api`, à l'adresse **https://finditfr-api.vercel.app**. Racine
  `apps/api` ; l'entrée serverless est `apps/api/api/[...chemin].ts` (voir plus bas). Variables posées
  sur le projet : `DATABASE_URL`, `DEEPSEEK_API_KEY`, `INTERNAL_API_KEY`, `CORS_ORIGIN`,
  `API_PORT`, `NODE_ENV`. Aucune ne va dans le dépôt.
- **Worker** : nulle part pour l'instant. BullMQ a besoin d'un processus permanent, que Vercel
  n'offre pas. La collecte planifiée ne tourne donc que sur une machine locale.

**Le piège de routage, et comment il est contourné.** Le routage de Vercel dans le dossier `api/` ne
laisse passer **qu'un seul segment** après `/api` : mesuré le 2026-10-07, avec les deux formes de
catch-all, `/api/jobs` répondait 200 tandis que `/api/jobs/stats` renvoyait un 404 **sans corps** —
donc émis par la plateforme, pas par Nest (qui répond toujours du JSON). Cinq relais d'une ligne
rétablissent la profondeur manquante : `api/jobs/[...chemin].ts`, `api/agent/[...chemin].ts`,
`api/agent/runs/[...chemin].ts`, `api/matching/[...chemin].ts`,
`api/matching/history/[...chemin].ts`, chacun réexportant le gestionnaire unique. **À supprimer** le
jour où la plateforme route les catch-all sur plusieurs segments : c'est un contournement, pas une
architecture.

**Le worker, plus tard.** Une image Docker a été construite et vérifiée pour héberger l'API sur une
plateforme à processus permanent (les cinq routes testées répondaient, y compris celles que Vercel
refusait alors). Elle a été retirée du dépôt quand Vercel a suffi ; elle reste dans l'historique Git
si le worker doit être hébergé un jour — c'est ce cas-là qui la justifiera, pas l'API.

Notes d'exploitation :

- HTTPS par reverse proxy (Caddy/nginx) devant 3100 uniquement.
- L'API 4000 ne s'expose JAMAIS directement : en local, le web l'atteint en interne.
- L'authentification existe depuis le 2026-10-07, mais elle ne couvre que `/moi` (mot de passe
  unique). Le dashboard `/dashboard` et les routes publiques de l'API restent ouverts : une instance
  publique doit protéger le reste par l'authentification du reverse proxy ou en n'exposant pas le
  dashboard.
- L'offre gratuite de Render endort le service : le premier appel après une veille paie le
  démarrage de Nest et la connexion à la base.

## 7. Sauvegardes et retour arrière

- Sauvegarde : `pg_dump` de la base (offres, entreprises et registre sont le patrimoine à sauver).
- Retour arrière applicatif : `git checkout <commit précédent>` puis `pnpm install && pnpm build` et
  redémarrage. Les migrations courantes sont additives, mais
  `20261006120000_agent_and_remove_private` est destructive : un binaire antérieur à cette migration
  n'est plus compatible avec le schéma.
- Ne jamais faire de `migrate reset` en production.

## 8. Vérification post-déploiement

```bash
pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Puis sur le réel : `GET /health`, une collecte ATS (`ConnectorRun` en base), et - si l'agent est
allumé - un run (`AgentRun`) avec `DEEPSEEK_API_KEY` et `BRAVE_SEARCH_API_KEY`. Les job boards
tournent par défaut : vérifier un `ConnectorRun` du cycle `scraped-collection` quand
`APIFY_API_TOKEN` est fourni ; `pnpm board:proof` reste l'exécution à la demande, hors cron. Les
scores de CV se testent par `POST /api/matching/score` avec un corps `{ cvText }`. Hors saison,
l'absence d'offres exploitables est un résultat normal, pas une panne.
