# Architecture Findit

Ce document decrit l'architecture reelle du depot au 2026-07-24. La source de verite detaillee reste [roadmap.md](../roadmap.md), et [HANDOFF.md](../HANDOFF.md) sert a la reprise courte.

## Flux principal

```text
Utilisateur public
    |
    v
Next.js web (port 3100)
    |
    v
API NestJS/Fastify (port 4000)
    |
    +--> PostgreSQL / Prisma

Worker NestJS
    |
    +--> BullMQ / Redis
    |
    +--> Decouverte Brave transitoire, si BRAVE_SEARCH_API_KEY existe
    |
    +--> Registre Connector / CompanySource
    |
    +--> Connecteurs autorises
          +--> Greenhouse
          +--> Lever
          +--> Workable, teste mais pas encore lance par le cycle actuel
    |
    +--> Normalisation / classification / ingestion / ProcessingLog
    |
    +--> Telegram, si explicitement active
```

Le web ne se connecte jamais directement a PostgreSQL ou Redis. Il appelle l'API. L'API porte les routes synchrones et les validations d'entree. Le worker porte les traitements asynchrones et les integrations externes.

## Flux prive

```text
Client autorise
    |
    +--> x-workspace-key
    |
    v
API NestJS/Fastify
    |
    +--> WorkspaceGuard
    +--> CandidateProfile
    +--> SourceResume : upload PDF/DOCX/TXT + extraction texte
    +--> POST /api/resumes/:id/structure
    +--> IA locale Ollama pour structurer le CV en JSON valide
```

L'espace prive est minimal et backend uniquement. Il utilise `INTERNAL_API_KEY` comme secret local via l'en-tete `x-workspace-key`, avec comparaison a temps constant. Il ne remplace pas encore une authentification utilisateur complete.

## Perimetre metier

Le contrat partage `@findit/shared` fixe le perimetre commun.

| Axe       | Valeurs                                                                       |
| --------- | ----------------------------------------------------------------------------- |
| Contrats  | `ALTERNANCE`, `INTERNSHIP`                                                    |
| Metiers   | `FRONTEND`, `BACKEND`, `FULLSTACK`, `MOBILE`, `DATA_ANALYST`, `DATA_ENGINEER` |
| Zone      | Ile-de-France : 75, 77, 78, 91, 92, 93, 94, 95                                |
| Fraicheur | 24 heures par defaut, 72 heures maximum                                       |

Les offres hors perimetre sont refusees par la classification ou par les contraintes de stockage.

## Applications

| Application   | Role                                  | Etat                                                                        |
| ------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| `apps/web`    | Interface publique Next.js App Router | Liste, recherche, filtres, pagination, detail et etats d'erreur             |
| `apps/api`    | API NestJS/Fastify                    | Routes offres, sante, profil prive, CV source et structure CV               |
| `apps/worker` | Traitements asynchrones               | Cron 4 h, BullMQ, cycle de collecte, decouverte Brave optionnelle, Telegram |

## Packages

| Package                      | Role                                                       | Etat reel                                                                 |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| `@findit/shared`             | Contrats de perimetre                                      | Actif                                                                     |
| `@findit/config`             | Schemas Zod et chargement `.env` racine                    | Actif                                                                     |
| `@findit/database`           | Prisma, migrations, client et seed                         | Actif avec modele metier                                                  |
| `@findit/ui`                 | Composants d'interface reutilisables                       | Actif                                                                     |
| `@findit/job-connectors`     | Registre, garde-fou, robots, decouverte et connecteurs ATS | Greenhouse/Lever/Workable testes ; Workable non lance par le cycle actuel |
| `@findit/job-normalization`  | Nettoyage et comparaison des offres                        | Actif                                                                     |
| `@findit/job-classification` | Decisions contrat, metier, lieu, ecole et risque           | Actif                                                                     |
| `@findit/job-deduplication`  | Similarite et decision de doublon                          | Partiel, persistance absente                                              |
| `@findit/job-pipeline`       | Ingestion et logs de traitement                            | Actif                                                                     |
| `@findit/notifications`      | Formatage et envoi Telegram                                | Partiel, commandes absentes                                               |
| `@findit/ai`                 | Client Ollama et sorties structurees Zod                   | Actif, utilise par la route de structuration CV                           |
| `@findit/resume-parser`      | Extraction/structuration CV cible                          | Placeholder                                                               |
| `@findit/matching-engine`    | Score explicable offre/profil                              | Placeholder                                                               |

## Routes HTTP presentes

| Methode | Chemin                       | Auth              | Etat                            |
| ------- | ---------------------------- | ----------------- | ------------------------------- |
| `GET`   | `/health`                    | Publique          | Sante API                       |
| `GET`   | `/api/jobs`                  | Publique          | Liste et recherche d'offres     |
| `GET`   | `/api/jobs/stats`            | Publique          | Compteurs                       |
| `GET`   | `/api/jobs/filters`          | Publique          | Valeurs de filtres              |
| `GET`   | `/api/jobs/:slug`            | Publique          | Detail d'offre                  |
| `GET`   | `/api/profile`               | `x-workspace-key` | Profil candidat                 |
| `PUT`   | `/api/profile`               | `x-workspace-key` | Creation/remplacement profil    |
| `PATCH` | `/api/profile`               | `x-workspace-key` | Mise a jour partielle profil    |
| `POST`  | `/api/resumes/upload`        | `x-workspace-key` | Upload et extraction texte      |
| `GET`   | `/api/resumes`               | `x-workspace-key` | Liste des CV sources            |
| `GET`   | `/api/resumes/:id`           | `x-workspace-key` | Detail d'un CV source           |
| `POST`  | `/api/resumes/:id/structure` | `x-workspace-key` | Structuration JSON du CV source |

Routes absentes : suppression CV, matching, generation de documents, GitHub, candidatures, admin, webhook ou commandes Telegram.

## Donnees et conformite

- Les sources collectables viennent du registre de [docs/legal-compliance.md](legal-compliance.md), synchronise par `pnpm registry:sync`.
- Une source non autorisee par le registre ne doit pas s'executer.
- Brave sert uniquement a decouvrir des sources. Les resultats de recherche restent transitoires et ne sont pas stockes comme offres.
- Les domaines decouverts doivent passer les controles robots et signaux de contenu avant enregistrement.
- Les offres de demonstration restent marquees `isDemo = true` et ne doivent pas etre confondues avec des employeurs reels.

## Configuration et ports

Chaque runtime lit la configuration via `@findit/config` et echoue vite si une variable requise est invalide.

| Runtime | Variables principales                                                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web     | `WEB_PORT`, `NEXT_PUBLIC_API_URL`                                                                                                                                |
| API     | `API_PORT`, `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGIN`, `INTERNAL_API_KEY`, `RESUME_RETENTION_HOURS`, `AI_PROVIDER`, `OLLAMA_BASE_URL`, `AI_MODEL_*`             |
| Worker  | `DATABASE_URL`, `REDIS_URL`, `JOB_COLLECTION_CRON`, `JOB_COLLECTION_TIMEZONE`, `BRAVE_SEARCH_API_KEY`, `WEB_SEARCH_MAX_QUERIES_PER_RUN`, `TELEGRAM_*`, `APP_URL` |

Findit utilise `3100` pour le web et `4000` pour l'API en local. Le port `3000` ne doit pas etre utilise pour ce projet.

## Limites connues

- La base locale auditee ne prouve pas encore une collecte reelle publiee : elle contient des offres de demonstration.
- Workable est actif dans le registre et teste, mais pas raccorde a `TOKEN_CONNECTORS` dans le cycle worker.
- `DuplicateGroup` et `DuplicateDecision` existent cote schema, mais l'ingestion n'ecrit pas encore ces tables.
- Le CV source n'a pas encore de suppression API, de retention effective ni de stockage chiffre du binaire.
- L'IA locale existe pour la structuration CV ; elle n'est pas encore utilisee pour le matching ou la generation.
- Il n'y a pas encore de CI/CD `.github`.
