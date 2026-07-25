# Findit

Findit centralise les offres d'alternance et de stage de developpement en Ile-de-France, puis prepare une extension privee pour analyser un CV, des projets et des candidatures.

L'application ne postule jamais a la place de l'utilisateur. Elle affiche les informations utiles d'une offre et redirige vers la source d'origine. Les fonctions privees doivent rester factuelles : aucun CV, score, message ou document ne doit inventer une competence, une experience ou un resultat.

## Etat actuel

Le socle public est avance et testable :

- monorepo pnpm/Turborepo, Next.js, NestJS/Fastify, worker NestJS/BullMQ ;
- PostgreSQL et Redis locaux via Docker Compose ;
- schema Prisma, migrations, contraintes et index metier ;
- API publique des offres avec liste, recherche, filtres, statistiques et detail ;
- interface publique Next.js sur le port `3100` ;
- registre de conformite synchronisable en base ;
- connecteurs Greenhouse, Lever et Workable avec tests et garde-fou d'autorisation ;
- pipeline de normalisation, classification, detection d'ecoles, ingestion et logs ;
- worker planifie toutes les 4 heures avec decouverte Brave optionnelle ;
- alertes Telegram de nouvelles offres, eteintes et en simulation par defaut ;
- espace prive minimal protege par `x-workspace-key` ;
- profil candidat unique et import de CV source PDF/DOCX/TXT avec extraction de texte ;
- structuration JSON du CV source via une route privee et l'IA locale ;
- client IA local Ollama dans `@findit/ai`, eteint par defaut.

Les limites actuelles restent importantes :

- la base locale auditee ne contient que des offres de demonstration ;
- Workable est teste comme connecteur, mais le cycle worker courant n'execute encore que Greenhouse et Lever ;
- la deduplication calcule une decision, sans persistance `DuplicateGroup` / `DuplicateDecision` dans l'ingestion ;
- le CV source n'a pas encore de suppression, de retention effective ni de stockage chiffre du binaire ;
- aucun score offre/profil, aucune generation de CV/lettre, aucun suivi de candidature et aucune analyse GitHub ne sont encore branches ;
- les commandes Telegram (`/start`, `/status`, `/latest`, `/help`) sont absentes.

## Perimetre valide

- **Contrats** : alternance et stage.
- **Metiers** : Front-end, Back-end, Full-stack, Developpement mobile, Data Analyst, Data Engineer.
- **Zone** : Ile-de-France (75, 77, 78, 91, 92, 93, 94, 95).
- **Fraicheur** : 24 heures par defaut, 72 heures au maximum via un filtre.

Ce perimetre est defini dans `packages/shared/src/job-scope.ts` et consomme par les autres packages.

## Architecture

- `apps/web` : interface Next.js App Router, port `3100`.
- `apps/api` : API NestJS avec Fastify, port `4000`.
- `apps/worker` : collecte planifiee, BullMQ, Redis, decouverte et notifications.
- `packages` : configuration, base de donnees, contrats, UI et modules metier.
- `infrastructure` : Docker, scripts et monitoring local.

Detail dans [docs/architecture.md](docs/architecture.md).

## Prerequis

- Node.js 24.18 ou version corrective plus recente de la branche 24 LTS.
- pnpm 11.13.1 via Corepack.
- Docker Desktop avec Docker Compose.
- Ollama local seulement pour les briques IA activees.

## Installation locale

```powershell
corepack enable
corepack prepare pnpm@11.13.1 --activate
Copy-Item .env.example .env
pnpm install
pnpm setup:hooks
pnpm infra:up
pnpm db:migrate
pnpm registry:sync
pnpm db:seed
```

`pnpm setup:hooks` active le garde-fou anti-secret (`.githooks/pre-commit`). Il refuse notamment l'ajout d'un fichier `.env` suivi ou d'une chaine ressemblant a une cle d'API.

`pnpm registry:sync` reporte le registre de [docs/legal-compliance.md](docs/legal-compliance.md) dans la table `Connector`. Cette table decide quels connecteurs peuvent s'executer : une source non inscrite et non autorisee ne doit pas etre collectee.

`pnpm infra:up` demarre PostgreSQL et Redis. `pnpm infra:down` les arrete.

## Donnees de demonstration

`pnpm db:seed` insere des offres fictives pour rendre l'interface visible sans collecte reelle locale. Elles portent `isDemo = true`, utilisent le domaine `demo.invalid`, et ne correspondent a aucun employeur reel.

La commande est rejouable et ne supprime que ce qu'elle a cree. Elle ne doit jamais detruire une offre reelle.

Le jeu contient aussi une offre expiree et une offre en quarantaine afin de verifier les filtres. Les cas non stockables, comme CDI, poste hors perimetre ou offre sans date de publication, relevent des tests du pipeline.

## Variables d'environnement

Toutes les variables sont documentees dans `.env.example` et validees par Zod au demarrage. Le fichier `.env` local n'est jamais committe.

| Variable                                         | Utilisee par          | Role                                                       |
| ------------------------------------------------ | --------------------- | ---------------------------------------------------------- |
| `NODE_ENV`                                       | api, worker           | Mode d'execution                                           |
| `WEB_PORT`                                       | web                   | Port du site, `3100` par defaut                            |
| `API_PORT`                                       | api                   | Port de l'API, `4000` par defaut                           |
| `DATABASE_URL`                                   | api, worker, database | Connexion PostgreSQL                                       |
| `REDIS_URL`                                      | api, worker           | Connexion Redis et BullMQ                                  |
| `NEXT_PUBLIC_API_URL`                            | web                   | URL publique de l'API                                      |
| `CORS_ORIGIN`                                    | api                   | Origine autorisee, alignee sur `WEB_PORT`                  |
| `INTERNAL_API_KEY`                               | api                   | Cle de l'espace prive et des usages internes               |
| `RESUME_RETENTION_HOURS`                         | api                   | Duree de conservation prevue du CV source                  |
| `AI_PROVIDER`, `OLLAMA_BASE_URL`, `AI_MODEL_*`   | api                   | IA locale Ollama, desactivee par defaut                    |
| `SEARCH_API_PROVIDER`, `SEARCH_API_KEY`          | api                   | Variables historiques de recherche, desactivees par defaut |
| `BRAVE_SEARCH_API_KEY`                           | worker                | Decouverte web Brave, facultative et cote serveur          |
| `JOB_COLLECTION_CRON`, `JOB_COLLECTION_TIMEZONE` | worker                | Planification de la collecte                               |
| `WEB_SEARCH_MAX_QUERIES_PER_RUN`                 | worker                | Plafond de requetes Brave par cycle                        |
| `TELEGRAM_*`                                     | worker                | Alertes Telegram, eteintes et en simulation par defaut     |
| `APP_URL`                                        | worker                | URL inseree dans les notifications                         |
| `POSTGRES_*`, `REDIS_PORT`                       | Docker Compose        | Services locaux                                            |

## Developpement

```powershell
pnpm dev
```

- Web : `http://localhost:3100`
- API : `http://localhost:4000`
- Sante API : `http://localhost:4000/health`

Ne pas utiliser le port `3000` pour Findit.

## Qualite

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Pour eviter une course entre Next.js build et typecheck autour de `.next/types`, lancer les controles lourds separement quand une validation complete est necessaire.

## Fonctionnalites

| Element                                    | Etat       | Detail                                                          |
| ------------------------------------------ | ---------- | --------------------------------------------------------------- |
| Monorepo et controles qualite              | Disponible | Installation, format, lint, tests, typecheck et build           |
| PostgreSQL et Redis locaux                 | Disponible | Services Docker avec healthchecks                               |
| Configuration validee                      | Disponible | Schemas Zod par runtime, echec rapide                           |
| API publique des offres                    | Disponible | `GET /api/jobs`, stats, filtres et detail                       |
| Interface publique                         | Disponible | Liste, recherche, filtres, pagination, detail, etats vides      |
| Registre de conformite                     | Disponible | `Connector` synchronise depuis `docs/legal-compliance.md`       |
| Greenhouse et Lever                        | Disponible | Connecteurs raccordes au cycle worker                           |
| Workable                                   | Partiel    | Connecteur teste, non execute par le cycle worker actuel        |
| Normalisation et classification            | Disponible | Contrat, metier, lieu, ecole, decision d'ingestion              |
| Deduplication                              | Partiel    | Decision pure presente, persistance non branchee                |
| Telegram                                   | Partiel    | Alertes de nouvelles offres, commandes absentes                 |
| Espace prive                               | Partiel    | Backend protege par `x-workspace-key`, pas encore d'UI          |
| CV source                                  | Partiel    | Upload, extraction texte et structure JSON ; pas de suppression |
| IA locale                                  | Partiel    | Package Ollama utilise par la route de structuration CV         |
| Matching, GitHub, generation, candidatures | Absent     | Fonctionnalites a construire                                    |

## Methode de travail

Le projet avance une brique a la fois sous ordre utilisateur explicite. Apres implementation, les commandes reelles sont presentees. La roadmap est cochee apres validation utilisateur. Les commits et pushs ne sont faits que sur demande explicite.

Voir [HANDOFF.md](HANDOFF.md) pour la reprise courte et [roadmap.md](roadmap.md) pour la source de verite detaillee.
