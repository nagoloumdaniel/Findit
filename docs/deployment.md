# Déploiement de Findit depuis un environnement vierge

Ce document décrit l'installation complète sur une machine propre, la mise en
production et le retour arrière. Les secrets sont désignés par leur nom de
variable, jamais par leur valeur.

## 1. Prérequis

| Outil          | Version        | Rôle                            |
| -------------- | -------------- | ------------------------------- |
| Node.js        | >= 24.18, < 25 | Runtime de toutes les apps      |
| pnpm           | 11.13.1        | Gestionnaire du monorepo        |
| Docker Compose | v2             | PostgreSQL et Redis locaux      |
| Ollama         | >= 0.32        | IA locale (modèle `qwen2.5:7b`) |

Matériel constaté suffisant : 32 Go de RAM, GPU 6 Go (RTX 2060) - le modèle
tourne à ~21 tokens/s à chaud, le démarrage à froid charge 4,7 Go.

## 2. Installation

```bash
git clone https://github.com/Nagoloum/Findit.git
cd Findit
pnpm install
pnpm setup:hooks        # hook anti-secret, une fois
cp .env.example .env    # puis renseigner les variables ci-dessous
```

## 3. Variables d'environnement (`.env` à la racine)

Obligatoires :

- `DATABASE_URL` - PostgreSQL.
- `REDIS_URL` - file BullMQ du worker.
- `INTERNAL_API_KEY` - clé de l'espace privé. Le navigateur ne la voit
  jamais : le serveur Next la porte via le proxy `/api/ws/*`. La changer
  revient à révoquer l'accès.
- `NEXT_PUBLIC_API_URL`, `CORS_ORIGIN`, `WEB_PORT` (3100), `API_PORT` (4000).

IA locale :

- `AI_PROVIDER` - `disabled` par défaut ; `ollama` pour activer.
- `OLLAMA_BASE_URL` (http://localhost:11434, ne JAMAIS l'exposer
  publiquement), `AI_MODEL_EXTRACTION`, `AI_MODEL_REASONING`.

Optionnelles :

- `BRAVE_SEARCH_API_KEY` - découverte d'entreprises ; sans elle, la collecte
  se limite au registre connu.
- `FRANCETRAVAIL_CLIENT_ID` / `FRANCETRAVAIL_CLIENT_SECRET` - API officielle
  France Travail (inscription gratuite sur francetravail.io, produit « Offres
  d'emploi v2 ») ; sans elles, la source est simplement absente du cycle.
- `TELEGRAM_*` - alertes ; simulation par défaut tant que
  `TELEGRAM_NOTIFICATIONS_ENABLED` et `TELEGRAM_DRY_RUN` ne sont pas réglés.
- `RESUME_RETENTION_HOURS` - rétention des CV importés (24 par défaut).

Règle absolue : aucune valeur réelle dans `.env.example`, jamais - un
incident a déjà été payé et le hook de pré-commit le bloque.

## 4. Base, données, modèle

```bash
pnpm infra:up                 # postgres + redis
pnpm db:migrate               # migrations, additives uniquement
pnpm registry:sync            # registre de conformité des connecteurs
pnpm db:import-companies      # annuaire d'entreprises (packages/database/data)
pnpm careers:scan             # trouve les ATS des sites carrières (robots.txt respecté)
ollama pull qwen2.5:7b
```

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

`ollama serve` doit tourner en service (il meurt avec sa session s'il est
lancé à la main). Vérifier : `curl http://localhost:11434/api/tags`.

Contrôles de vie : `GET /health` sur l'API ; la home répond sur 3100.

## 6. Exposition publique

- HTTPS par reverse proxy (Caddy/nginx) devant 3100 uniquement.
- L'API 4000 et Ollama 11434 ne s'exposent JAMAIS directement : le web les
  atteint en local.
- La page `/` étant aussi l'espace du propriétaire via le proxy à clé, une
  instance publique doit soit protéger le site entier (auth du reverse
  proxy), soit désactiver le proxy en retirant `INTERNAL_API_KEY` de
  l'environnement du web.

## 7. Sauvegardes et retour arrière

- Sauvegarde : `pg_dump` de la base (les CV expirent seuls sous
  `RESUME_RETENTION_HOURS` ; les dossiers de candidature, offres et registre
  sont le patrimoine à sauver).
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
