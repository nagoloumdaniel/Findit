# Findit

[![CI](https://github.com/nagoloumdaniel/Findit/actions/workflows/ci.yml/badge.svg)](https://github.com/nagoloumdaniel/Findit/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/Node-24.18%20LTS-339933?logo=node.js&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-11.13.1-F69220?logo=pnpm&logoColor=white)
![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-EF4444?logo=turborepo&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis%2FBullMQ-queues-DC382D?logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-non%20specifiee-lightgrey)

> Agrégateur d'offres d'alternance et de stage en développement en Île-de-France, avec collecte automatisée et extension privée d'analyse de CV.

## Description

Findit centralise les offres d'alternance et de stage de développement en Île-de-France et les affiche sur un site public. Par-dessus vit une extension privée, réservée au propriétaire : analyse du CV, correspondance avec chaque offre, lettre de motivation factuelle, suivi des candidatures. L'application ne postule jamais à la place de l'utilisateur : elle affiche les informations utiles d'une offre et redirige vers la source d'origine.

Le **socle public est fonctionnel** : collecte depuis des sources autorisées au registre (Greenhouse, Lever, Workable, Workday, France Travail), normalisation, classification, déduplication persistée, API et interface de recherche. L'**extension privée est livrée** : import et structuration du CV par IA locale, score explicable sans IA, lettre factuelle avec garde-fou anti-invention, export PDF, suivi des candidatures.

Restent à construire : l'analyse des dépôts GitHub, l'export DOCX, le versionnement et le chiffrement du binaire du CV, l'hébergement public, et l'élargissement du scraping aux job boards (livré pour Welcome to the Jungle, mais éteint par défaut, et un site par brique).

Il n'existe **aucun déploiement public** à ce jour. Le site tourne en local sur le port 3100 et s'appuie sur une base **PostgreSQL en ligne (Neon, TLS obligatoire)** ; Redis reste local.

## Fonctionnalités

| Élément                         | État       | Détail                                                                      |
| ------------------------------- | ---------- | --------------------------------------------------------------------------- |
| Monorepo et contrôles qualité   | Disponible | Format, lint, typecheck, tests, build                                       |
| Base PostgreSQL en ligne        | Disponible | Neon, TLS obligatoire, migrations additives uniquement                      |
| Redis local                     | Disponible | Service Docker avec healthcheck, file BullMQ                                |
| Configuration validée           | Disponible | Schémas Zod par runtime, échec rapide                                       |
| API publique des offres         | Disponible | `GET /api/jobs`, statistiques, filtres, détail                              |
| Interface publique              | Disponible | Recherche par texte ou par CV, filtres repliables, pagination, détail       |
| Registre de conformité          | Disponible | Table `Connector` synchronisée depuis `docs/legal-compliance.md`            |
| Connecteurs ATS natifs          | Disponible | Greenhouse, Lever, Workable, Workday, France Travail                        |
| Connecteur job board            | Éteint     | Welcome to the Jungle via Apify, livré, derrière l'interrupteur du cycle    |
| Normalisation et classification | Disponible | Contrat, métier, lieu, école, décision d'ingestion                          |
| Déduplication                   | Disponible | Décision écrite, source canonique élue, sources secondaires tracées         |
| Alertes Telegram                | Disponible | Nouvelles offres idempotentes ; bot `/start`, `/status`, `/latest`, `/help` |
| Espace privé                    | Disponible | Porté par le proxy serveur, la clé n'atteint jamais le navigateur           |
| Import de CV                    | Disponible | Upload PDF/DOCX/TXT, extraction, structuration IA, suppression, rétention   |
| IA (DeepSeek API)               | Disponible | Client `@findit/ai`, sortie structurée revalidée                            |
| Score et lettre                 | Disponible | Score explicable sans IA, lettre factuelle, refus de toute invention        |
| Documents PDF                   | Disponible | CV et lettre, rendu déterministe ; l'export DOCX manque                     |
| Suivi des candidatures          | Disponible | Dossiers avec instantanés et historique daté                                |
| Analyse GitHub                  | Absent     | À construire                                                                |

Périmètre validé : contrats alternance et stage ; métiers front-end, back-end, full-stack, ingénierie logicielle, autres métiers du développement, mobile, data analyst, data engineer ; Île-de-France (75, 77, 78, 91, 92, 93, 94, 95). Le flux affiche par défaut les alternances des métiers du développement sur **3 jours** ; la fenêtre de 24 h reste un resserrement possible, et 3 jours est le plafond absolu : une offre plus ancienne n'est jamais exposée.

## Stack technique

- **Monorepo** : pnpm workspaces + Turborepo
- **Web** : Next.js 16 (App Router), React 19
- **API** : NestJS 11 sur Fastify 5
- **Worker** : NestJS + BullMQ (collecte planifiée, découverte web optionnelle via Brave)
- **Base de données** : PostgreSQL en ligne (Neon) via Prisma 7 ; image `pgvector/pgvector:pg18` pour le développement local
- **File d'attente / cache** : Redis 8 local
- **IA** : DeepSeek API via `@findit/ai` (clé `DEEPSEEK_API_KEY`)
- **Scraping** : connecteurs natifs, Apify pour les job boards (plafond de dépense), ScrapeGraphAI prévu pour les sites carrières
- **Qualité** : ESLint, Prettier, Vitest ; workflow CI écrit, exécution bloquée par le compte GitHub
- **Infra locale** : Docker Compose

## Démo

Aucun déploiement public n'existe. En local : web http://localhost:3100, API http://localhost:4000.

## Installation locale

Prérequis : Node.js `>= 24.18 < 25`, pnpm 11.13.1 (via Corepack), Docker Desktop (Redis, et PostgreSQL local si vous n'utilisez pas la base en ligne).

```powershell
corepack enable
corepack prepare pnpm@11.13.1 --activate
Copy-Item .env.example .env   # puis renseigner DATABASE_URL, REDIS_URL et INTERNAL_API_KEY
pnpm install
pnpm setup:hooks
pnpm infra:up        # Redis, et PostgreSQL local si vous n'utilisez pas la base en ligne
pnpm db:migrate
pnpm registry:sync   # synchronise le registre de conformité des connecteurs
```

`pnpm db:seed` insère des offres de DÉMONSTRATION (`isDemo = true`) : c'est un outil de développement, aucun chemin de production ne l'appelle. La base en ligne ne porte que des offres réelles.

Lancement :

```powershell
pnpm dev
```

- Web : http://localhost:3100
- API : http://localhost:4000
- Santé API : http://localhost:4000/health

Toutes les variables d'environnement sont documentées dans `.env.example` et validées par Zod au démarrage.

Qualité :

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Ces cinq commandes sont la vraie porte : le workflow `.github/workflows/ci.yml` les rejoue, mais GitHub Actions est actuellement désactivé pour le compte du dépôt, donc la CI ne s'exécute pas.

## Structure du monorepo

```
apps/
  web/      Interface Next.js (port 3100)
  api/      API NestJS/Fastify (port 4000)
  worker/   Collecte planifiée, BullMQ, notifications
packages/
  ai/                  Client IA DeepSeek, sortie structurée revalidée
  config/              Schémas de configuration Zod
  database/            Schéma Prisma, migrations, seed, annuaire d'employeurs
  documents/           Modèles de CV et de lettre, rendu PDF déterministe
  job-classification/  Classification métier, contrat, lieu, école
  job-connectors/      Connecteurs ATS, registre, garde-fou d'accès, connecteur Apify
  job-deduplication/   Similarité et décision de doublon
  job-normalization/   Normalisation des offres
  job-pipeline/        Pipeline d'ingestion et lien de candidature
  matching-engine/     Score de correspondance CV/offre, sans IA, explicable
  notifications/       Alertes et commandes Telegram
  resume-parser/       Emplacement réservé, README seulement
  shared/              Périmètre métier partagé (job-scope)
  ui/                  Composants d'interface partagés
infrastructure/        Emplacements réservés (Docker, monitoring, scripts), vides pour l'instant
docs/                  Architecture, déploiement, conformité légale
```

Détail de l'architecture : [docs/architecture.md](docs/architecture.md). Conformité des sources collectées : [docs/legal-compliance.md](docs/legal-compliance.md).

## Licence

Aucune licence n'est déclarée dans ce dépôt pour le moment.

---

Par [Daniel Nagoloum Talla](https://github.com/nagoloumdaniel) · [Portfolio](https://nagoloum.vercel.app)
