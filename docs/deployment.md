# Déploiement de Findit depuis un environnement vierge

Ce document décrit l'installation complète sur une machine propre, la mise en
production et le retour arrière. Les secrets sont désignés par leur nom de
variable, jamais par leur valeur.

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

- `DATABASE_URL` - PostgreSQL. La base de production est en ligne (Neon) et la
  connexion exige TLS (`sslmode=require`). Une URL distante sans TLS doit faire
  échouer le démarrage.
- `REDIS_URL` - file BullMQ du worker.
- `INTERNAL_API_KEY` - clé de l'espace privé. Le navigateur ne la voit
  jamais : le serveur Next la porte via le proxy `/api/ws/*`. La changer
  revient à révoquer l'accès.
- `NEXT_PUBLIC_API_URL`, `CORS_ORIGIN`, `WEB_PORT` (3100), `API_PORT` (4000).

IA (DeepSeek) :

- `DEEPSEEK_API_KEY` - clé de plateforme DeepSeek, jamais exposée.
- `DEEPSEEK_MODEL` - `deepseek-flash` par défaut, `deepseek-v4-pro` pour le
  raisonnement fort.

Optionnelles :

- `BRAVE_SEARCH_API_KEY` - découverte d'entreprises ; sans elle, la collecte
  se limite au registre connu.
- `FRANCETRAVAIL_CLIENT_ID` / `FRANCETRAVAIL_CLIENT_SECRET` - API officielle
  France Travail (inscription gratuite sur francetravail.io, produit « Offres
  d'emploi v2 ») ; sans elles, la source est simplement absente du cycle.
- `APIFY_API_TOKEN` - jeton du compte Apify dédié, pour les job boards. Sans
  lui, aucun job board n'est collecté. Un run dépense du crédit réel : le
  cycle quotidien des job boards reste éteint tant que `SCRAPED_SOURCES_ENABLED`
  n'est pas à `true`. Réglages : `SCRAPED_COLLECTION_CRON` (6 h, heure de Paris),
  `SCRAPING_WTTJ_MAX_ITEMS` (30), et les plafonds de dépense
  `SCRAPING_BUDGET_MONTHLY_USD` (4,5 pour le plan gratuit) et
  `SCRAPING_BUDGET_CYCLE_USD` (0,15). Remettre l'interrupteur à `false` et
  redémarrer le worker retire la planification.
- `SCRAPEGRAPH_API_KEY` - clé de l'API ScrapeGraphAI (plan gratuit : 500
  crédits). Réservée aux sites carrières ; voir `docs/legal-compliance.md`.
- `TELEGRAM_*` - alertes ; simulation par défaut tant que
  `TELEGRAM_NOTIFICATIONS_ENABLED` et `TELEGRAM_DRY_RUN` ne sont pas réglés.

Règle absolue : aucune valeur réelle dans `.env.example`, jamais - un
incident a déjà été payé et le hook de pré-commit le bloque.

## 4. Base, données, modèle

```bash
pnpm infra:up                                        # Redis, et PostgreSQL local si besoin
pnpm db:migrate                                      # migrations, additives uniquement
pnpm registry:sync                                   # registre de conformité des connecteurs
pnpm --filter @findit/database db:import-companies   # annuaire (packages/database/data)
pnpm careers:scan                                    # trouve les ATS des sites carrières
```

`pnpm infra:up` ne sert qu'à Redis et à une éventuelle base locale : en
production, `DATABASE_URL` pointe sur la base en ligne, et c'est elle que les
migrations visent.

Le rôle applicatif n'est **pas propriétaire du schéma** de la base en ligne. Une
migration qui change la structure échoue donc et laisse une ligne d'historique en
échec : appliquer le changement avec une connexion propriétaire, puis
réconcilier l'historique par `prisma migrate resolve` (`--rolled-back` puis
`--applied`). C'est arrivé deux fois, voir `roadmap.md` (TASK-301, TASK-305).

`pnpm db:seed` insère des offres de DÉMONSTRATION (marquées `isDemo`) - utile
en développement, à ne pas jouer en production.

## 5. Démarrage

Développement : `pnpm dev` (turbo lance web, api, worker).

Production :

```bash
pnpm build
pnpm --filter @findit/api exec node dist/main.js
pnpm --filter @findit/worker exec node dist/main.js
pnpm --filter @findit/web exec next start -p 3100
```

Contrôles de vie : `GET /health` sur l'API ; la home répond sur 3100.

## 6. Exposition publique

- HTTPS par reverse proxy (Caddy/nginx) devant 3100 uniquement.
- L'API 4000 ne s'expose JAMAIS directement : le web l'atteint en local.
- La page `/` étant aussi l'espace du propriétaire via le proxy à clé, une
  instance publique doit soit protéger le site entier (auth du reverse
  proxy), soit désactiver le proxy en retirant `INTERNAL_API_KEY` de
  l'environnement du web.

## 7. Sauvegardes et retour arrière

- Sauvegarde : `pg_dump` de la base (offres, entreprises et registre sont le
  patrimoine à sauver).
- Retour arrière applicatif : `git checkout <commit précédent>` puis
  `pnpm install && pnpm build` et redémarrage. Les migrations étant
  additives uniquement, un binaire ancien tourne sur un schéma plus récent.
- Ne jamais faire de `migrate reset` en production.

## 8. Vérification post-déploiement

```bash
pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Puis sur le réel : une collecte (`ConnectorRun` en base), un CV importé et
structuré, un score, une lettre, un PDF. En juillet, zéro offre exploitable
est un résultat normal (hors saison), pas une panne.
