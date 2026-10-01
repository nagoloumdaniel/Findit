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

> Agrégateur d'offres d'alternance et de stage en développement en Île-de-France, avec collecte automatisée et extension privée en construction pour l'analyse de CV.

## Description

Findit centralise les offres d'alternance et de stage de développement en Île-de-France et prépare une extension privée pour analyser un CV, des projets et des candidatures. L'application ne postule jamais à la place de l'utilisateur : elle affiche les informations utiles d'une offre et redirige vers la source d'origine.

Le **socle public est fonctionnel et testable** : collecte automatisée (Greenhouse, Lever), normalisation, classification, déduplication (décision calculée, persistance non branchée), API et interface de recherche. L'**extension privée est en cours** : upload de CV et structuration JSON via IA locale (Ollama, désactivée par défaut) sont en place, mais le matching offre/profil, la génération de CV/lettre, le suivi de candidatures et l'analyse GitHub restent à construire.

Aucune démo publique n'est disponible pour le moment.

## Fonctionnalités

| Élément | État | Détail |
| --- | --- | --- |
| Monorepo et contrôles qualité | Disponible | Installation, format, lint, tests, typecheck, build |
| PostgreSQL et Redis locaux | Disponible | Services Docker avec healthchecks |
| Configuration validée | Disponible | Schémas Zod par runtime, échec rapide |
| API publique des offres | Disponible | `GET /api/jobs`, statistiques, filtres, détail |
| Interface publique | Disponible | Liste, recherche, filtres, pagination, détail |
| Registre de conformité | Disponible | Table `Connector` synchronisée depuis `docs/legal-compliance.md` |
| Connecteurs Greenhouse et Lever | Disponible | Raccordés au cycle planifié du worker |
| Connecteur Workable | Partiel | Testé, pas encore exécuté par le cycle worker |
| Normalisation et classification | Disponible | Contrat, métier, lieu, école, décision d'ingestion |
| Déduplication | Partiel | Décision calculée, persistance non branchée |
| Alertes Telegram | Partiel | Nouvelles offres notifiées ; commandes (`/start`, etc.) absentes |
| Espace privé | Partiel | Backend protégé par `x-workspace-key`, pas encore d'UI |
| Import de CV | Partiel | Upload, extraction texte (PDF/DOCX/TXT), structuration JSON via IA locale ; pas de suppression |
| IA locale (Ollama) | Partiel | Désactivée par défaut, utilisée par la route de structuration CV |
| Matching, analyse GitHub, génération, suivi de candidatures | Absent | À construire |

Périmètre validé : contrats alternance et stage, métiers front-end/back-end/full-stack/mobile/data, Île-de-France (75, 77, 78, 91, 92, 93, 94, 95), fraîcheur 24h par défaut (72h max).

## Stack technique

- **Monorepo** : pnpm workspaces + Turborepo
- **Web** : Next.js 16 (App Router), React 19
- **API** : NestJS 11 sur Fastify 5
- **Worker** : NestJS + BullMQ (collecte planifiée, découverte web optionnelle via Brave)
- **Base de données** : PostgreSQL 18 (image `pgvector/pgvector`) via Prisma 7
- **File d'attente / cache** : Redis 8
- **IA** : client Ollama local (`@findit/ai`), désactivé par défaut
- **Qualité** : ESLint, Prettier, Vitest, CI GitHub Actions
- **Infra locale** : Docker Compose

## Démo

Pas de démo publique disponible : le projet est en développement actif, sans déploiement exposé.

## Installation locale

Prérequis : Node.js 24.18 (LTS 24.x), pnpm 11.13.1 (via Corepack), Docker Desktop. Ollama uniquement si vous activez les briques IA.

```powershell
corepack enable
corepack prepare pnpm@11.13.1 --activate
Copy-Item .env.example .env
pnpm install
pnpm setup:hooks
pnpm infra:up        # démarre PostgreSQL et Redis via Docker Compose
pnpm db:migrate
pnpm registry:sync   # synchronise le registre de conformité des connecteurs
pnpm db:seed         # offres de démonstration (isDemo = true)
```

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

## Structure du monorepo

```
apps/
  web/      Interface Next.js (port 3100)
  api/      API NestJS/Fastify (port 4000)
  worker/   Collecte planifiée, BullMQ, notifications
packages/
  ai/                  Client IA local (Ollama)
  config/              Schémas de configuration Zod
  database/            Schéma Prisma, migrations, seed
  documents/           Extraction de documents (CV)
  job-classification/  Classification métier/contrat/lieu
  job-connectors/      Connecteurs Greenhouse, Lever, Workable
  job-deduplication/   Détection de doublons
  job-normalization/   Normalisation des offres
  job-pipeline/        Pipeline d'ingestion
  matching-engine/      Moteur de correspondance (en construction)
  notifications/       Alertes Telegram
  resume-parser/       Analyse de CV
  shared/               Périmètre métier partagé (job-scope)
  ui/                   Composants d'interface partagés
infrastructure/        Docker, scripts, monitoring local
docs/                   Architecture, déploiement, conformité légale
```

Détail de l'architecture : [docs/architecture.md](docs/architecture.md). Conformité des sources collectées : [docs/legal-compliance.md](docs/legal-compliance.md).

## Licence

Aucune licence n'est déclarée dans ce dépôt pour le moment.

---

Par [Daniel Nagoloum Talla](https://github.com/nagoloumdaniel) · [Portfolio](https://nagoloum.vercel.app)
