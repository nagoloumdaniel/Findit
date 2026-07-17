# Findit

Findit centralisera les alternances et les stages publiés récemment en Île-de-France pour les métiers Front-end, Back-end, Full-stack, Développement mobile, Data Analyst et Data Engineer.

L'application ne permettra jamais de postuler directement : elle affichera les informations essentielles d'une offre et redirigera vers la source d'origine. Elle prévoit aussi l'import d'un CV sans compte, un score de compatibilité indicatif et explicable, et la génération d'une lettre de motivation fondée uniquement sur des faits réels du CV et de l'offre.

## État actuel

Le dépôt contient l'initialisation technique et le modèle de données. Les tables existent mais aucune n'est alimentée : aucune offre réelle, collecte, analyse de CV, correspondance ou génération de lettre n'est disponible aujourd'hui. La page web affiche le périmètre validé et rien d'autre : aucun compteur, aucune statistique et aucune offre simulée.

## Périmètre validé

- **Contrats** : alternance et stage.
- **Métiers** : Front-end, Back-end, Full-stack, Développement mobile, Data Analyst, Data Engineer.
- **Zone** : Île-de-France (75, 77, 78, 91, 92, 93, 94, 95).
- **Fraîcheur** : 24 heures par défaut, 72 heures au maximum via un filtre.

Ce périmètre est défini une seule fois dans `packages/shared/src/job-scope.ts` et consommé par les autres packages.

## Architecture

- `apps/web` : interface Next.js App Router.
- `apps/api` : API NestJS avec Fastify.
- `apps/worker` : processus NestJS et fondation BullMQ.
- `packages` : contrats, configuration, base de données, UI et frontières métier réservées.
- `infrastructure` : Docker, scripts et monitoring.

Détail dans [docs/architecture.md](docs/architecture.md).

## Prérequis

- Node.js 24.18 ou version corrective plus récente de la branche 24 LTS.
- pnpm 11.13.1 (via Corepack).
- Docker Desktop avec Docker Compose.

## Installation

```powershell
corepack enable
corepack prepare pnpm@11.13.1 --activate
Copy-Item .env.example .env
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm db:seed
```

`pnpm infra:up` démarre PostgreSQL et Redis. `pnpm infra:down` les arrête.

## Données de démonstration

`pnpm db:seed` insère quelques offres fictives afin que l'interface soit visible avant que la collecte réelle n'existe. Elles portent toutes `isDemo = true`, sont rattachées à des entreprises inventées sur le domaine `demo.invalid`, et l'interface doit les signaler : elles ne correspondent à aucun employeur réel et il ne faut pas y postuler.

La commande est rejouable et ne supprime que ce qu'elle a créé. Elle ne touche jamais à une offre réelle.

Le jeu comprend aussi une offre expirée et une offre en quarantaine. Elles existent en base mais ne sortent d'aucun filtre : leur présence rend ce comportement vérifiable.

Les cas de rejet prévus par la spécification — un CDI, un poste DevOps, une offre sans date de publication, une offre hors Île-de-France — ne figurent pas dans le jeu de données parce qu'ils ne sont pas stockables : les enums, la contrainte `NOT NULL` sur `publishedAt` et la contrainte de contrôle sur le département les refusent à l'écriture. Ils relèvent des tests du pipeline de collecte.

## Variables d'environnement

Toutes les variables sont documentées dans `.env.example`. Elles sont validées par Zod au démarrage : une valeur requise absente ou invalide arrête le processus concerné avec une erreur explicite. Le fichier `.env` local n'est jamais commité.

| Variable                                                                                       | Utilisée par   | Rôle                                                     |
| ---------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------- |
| `NODE_ENV`                                                                                     | api, worker    | Mode d'exécution                                         |
| `API_PORT`                                                                                     | api            | Port d'écoute de l'API                                   |
| `DATABASE_URL`                                                                                 | api, database  | Connexion PostgreSQL                                     |
| `REDIS_URL`                                                                                    | api, worker    | Connexion Redis et BullMQ                                |
| `CORS_ORIGIN`                                                                                  | api            | Origine autorisée                                        |
| `INTERNAL_API_KEY`                                                                             | api            | Clé des futurs endpoints internes, 32 caractères minimum |
| `RESUME_RETENTION_HOURS`                                                                       | api            | Durée de conservation prévue d'un CV, de 1 à 168         |
| `NEXT_PUBLIC_API_URL`                                                                          | web            | URL publique de l'API                                    |
| `AI_PROVIDER`, `OPENAI_API_KEY`                                                                | api            | Fournisseur IA, désactivé par défaut                     |
| `SEARCH_API_PROVIDER`, `SEARCH_API_KEY`                                                        | api            | Moteur de découverte, désactivé par défaut               |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, `REDIS_PORT`, `WEB_PORT` | docker compose | Services locaux                                          |

Les valeurs de `.env.example` sont locales et non secrètes. `INTERNAL_API_KEY` et `POSTGRES_PASSWORD` doivent être remplacées hors développement local.

## Développement

```powershell
pnpm dev
```

- Web : `http://localhost:3000`
- Santé API : `http://localhost:4000/health`

## Qualité

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Fonctionnement

Le navigateur utilise le web Next.js. Le web appelle l'API NestJS et ne se connecte jamais directement à PostgreSQL ou Redis. L'API porte les accès synchrones et la validation des entrées. Le worker utilise BullMQ et Redis pour les traitements asynchrones. Chaque processus lit sa configuration via `@findit/config` et refuse de démarrer si elle est invalide.

## Fonctionnalités

| Élément                            | État       | Détail                                                                             |
| ---------------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| Monorepo et contrôles qualité      | Disponible | Installation, lint, tests, typecheck et build                                      |
| PostgreSQL et Redis locaux         | Disponible | Services Docker avec healthchecks                                                  |
| Configuration validée              | Disponible | Schémas Zod par runtime, échec rapide                                              |
| Santé API                          | Disponible | `GET /health`                                                                      |
| Page web de périmètre              | Disponible | Périmètre validé, sans offre ni compteur                                           |
| Système de couleurs et typographie | Disponible | Noir, blanc, gris et accents or ; contrastes WCAG AA vérifiés dans les deux thèmes |
| Modèle de données métier           | Disponible | 24 tables, migrations et index ; règles métier tenues par la base                  |
| Worker BullMQ                      | Préparée   | Connexion et fermeture propre, sans processeur métier                              |
| Similarité sémantique              | Préparée   | Extension pgvector activée, aucune colonne d'embedding                             |
| Recherche et filtres d'offres      | Absente    | Étape distincte de la roadmap                                                      |
| Collecte des sources               | Absente    | Aucun connecteur actif, aucune table alimentée                                     |
| Déduplication                      | Absente    | Tables présentes, aucun moteur                                                     |
| CV, score et lettre                | Absente    | Tables présentes, aucun traitement de données personnelles actif                   |

## Méthode de travail

Le projet avance une étape à la fois sous ordre utilisateur. Après implémentation et vérification, l'étape est présentée. Après validation utilisateur, la roadmap est cochée, puis un commit est créé et poussé sur `main`. Voir [roadmap.md](roadmap.md).
