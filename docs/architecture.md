# Architecture Findit

Ce document décrit l'architecture réelle du dépôt au 2026-10-06. La source de vérité détaillée reste [roadmap.md](../roadmap.md), et [HANDOFF.md](../HANDOFF.md) sert à la reprise courte.

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
    +--> PostgreSQL en ligne, Neon, TLS obligatoire, via Prisma

Worker NestJS
    |
    +--> BullMQ / Redis local
    |
    +--> Découverte Brave transitoire, si BRAVE_SEARCH_API_KEY existe
    |
    +--> Registre Connector / CompanySource
    |
    +--> Connecteurs autorisés
          +--> Greenhouse, Lever, Workable
          +--> France Travail, API officielle, si les identifiants existent
          +--> Workday, robots.txt du locataire relu avant chaque collecte
          +--> Welcome to the Jungle via Apify, job board, éteint par défaut
    |
    +--> Normalisation / classification / déduplication / ingestion / ProcessingLog
    |
    +--> Telegram, si explicitement activé
```

Le web ne se connecte jamais directement à PostgreSQL ou Redis. Il appelle l'API. L'API porte les routes synchrones et les validations d'entrée. Le worker porte les traitements asynchrones et les intégrations externes.

Deux planifications coexistent dans la même file, en concurrence 1 : les ATS natifs toutes les 4 h (`JOB_COLLECTION_CRON`), et les sources scrapées une fois par jour à 6 h heure de Paris (`SCRAPED_COLLECTION_CRON`). La seconde est montée seulement si `SCRAPED_SOURCES_ENABLED` vaut `true` et qu'un jeton Apify existe.

## Flux privé

```text
Navigateur du propriétaire
    |
    +--> Next.js : proxy serveur /api/ws/*
    |        la clé est posée côté serveur, jamais dans le navigateur
    |
    v
API NestJS/Fastify
    |
    +--> WorkspaceGuard, en-tête x-workspace-key, comparaison à temps constant
    +--> CandidateProfile
    +--> SourceResume : upload PDF/DOCX/TXT + extraction texte + rétention
    +--> POST /api/resumes/:id/structure
    +--> IA DeepSeek pour structurer le CV en JSON valide
    +--> SourceResumeMatch : score explicable, sans IA
    +--> SourceCoverLetter : lettre factuelle, garde-fou anti-invention
    +--> Application / ApplicationEvent : dossiers et historique daté
```

L'espace privé reste mono-propriétaire. Il utilise `INTERNAL_API_KEY` comme secret local, porté par le proxy serveur Next décrit ci-dessus, avec comparaison à temps constant. Il ne remplace pas encore une authentification utilisateur complète : une instance publique doit protéger le site entier ou retirer la clé de l'environnement du web (voir [deployment.md](deployment.md)).

Les documents PDF (CV et lettre) sont rendus par `@findit/documents`, en React-PDF pur Node, de façon déterministe : le design et les formules d'usage vivent dans le code, jamais dans l'IA.

## Périmètre métier

Le contrat partagé `@findit/shared` fixe le périmètre commun.

| Axe       | Valeurs                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| Contrats  | `ALTERNANCE`, `INTERNSHIP`                                                                                               |
| Métiers   | `FRONTEND`, `BACKEND`, `FULLSTACK`, `SOFTWARE_ENGINEERING`, `OTHER_DEVELOPER`, `MOBILE`, `DATA_ANALYST`, `DATA_ENGINEER` |
| Zone      | Île-de-France : 75, 77, 78, 91, 92, 93, 94, 95                                                                           |
| Fraîcheur | 3 jours par défaut, 24 heures comme resserrement possible, 3 jours comme plafond absolu                                  |

Stocker et montrer sont deux choses distinctes. Le périmètre dit ce qui a le droit d'exister en base ; le défaut d'affichage, lui, se limite aux alternances des cinq métiers du développement (`FRONTEND`, `BACKEND`, `FULLSTACK`, `SOFTWARE_ENGINEERING`, `OTHER_DEVELOPER`). Une offre hors de ce défaut reste collectée, stockée et atteignable par un filtre : changer d'avis est un réglage, jamais une migration.

Les offres hors périmètre sont refusées par la classification ou par les contraintes de stockage.

## Applications

| Application   | Rôle                                  | État                                                                                    |
| ------------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| `apps/web`    | Interface publique Next.js App Router | Page unique de recherche (texte ou CV), filtres repliables, détail, `/candidatures`     |
| `apps/api`    | API NestJS/Fastify                    | Offres, santé, profil privé, CV source, structuration, score, documents, lettres, suivi |
| `apps/worker` | Traitements asynchrones               | Cron 4 h pour les ATS, cron quotidien pour les sources scrapées, file BullMQ, Telegram  |

## Packages

| Package                      | Rôle                                                        | État réel                                                                |
| ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `@findit/shared`             | Contrats de périmètre                                       | Actif                                                                    |
| `@findit/config`             | Schémas Zod et chargement `.env` racine                     | Actif                                                                    |
| `@findit/database`           | Prisma, migrations, client, seed et annuaire d'employeurs   | Actif, migrations additives uniquement                                   |
| `@findit/ui`                 | Composants d'interface réutilisables                        | Actif                                                                    |
| `@findit/job-connectors`     | Registre, garde-fou d'accès, robots, découverte, ATS, Apify | Actif ; Welcome to the Jungle monté mais éteint par défaut               |
| `@findit/job-normalization`  | Nettoyage et comparaison des offres                         | Actif                                                                    |
| `@findit/job-classification` | Décisions contrat, métier, lieu, école et risque            | Actif                                                                    |
| `@findit/job-deduplication`  | Similarité et décision de doublon                           | Actif, décision écrite en base                                           |
| `@findit/job-pipeline`       | Ingestion, élection de la source canonique, lien d'apply    | Actif                                                                    |
| `@findit/notifications`      | Alertes Telegram et commandes du bot                        | Actif                                                                    |
| `@findit/ai`                 | Client DeepSeek et sorties structurées validées par Zod     | Actif, sert l'agent (extraction, analyse, matching/scoring)              |
| `@findit/documents`          | Modèles de CV et de lettre, rendu PDF déterministe          | Actif ; export DOCX absent                                               |
| `@findit/matching-engine`    | Score explicable offre/profil, sans IA                      | Actif                                                                    |
| `@findit/resume-parser`      | Extraction/structuration du CV                              | Emplacement réservé, README seulement : l'extraction vit dans `apps/api` |

## Routes HTTP présentes

| Méthode  | Chemin                               | Auth              | État                                   |
| -------- | ------------------------------------ | ----------------- | -------------------------------------- |
| `GET`    | `/health`                            | Publique          | Santé API                              |
| `GET`    | `/api/jobs`                          | Publique          | Liste et recherche d'offres            |
| `GET`    | `/api/jobs/stats`                    | Publique          | Compteurs                              |
| `GET`    | `/api/jobs/filters`                  | Publique          | Valeurs de filtres                     |
| `GET`    | `/api/jobs/:slug`                    | Publique          | Détail d'offre                         |
| `GET`    | `/api/profile`                       | `x-workspace-key` | Profil candidat                        |
| `PUT`    | `/api/profile`                       | `x-workspace-key` | Création/remplacement du profil        |
| `PATCH`  | `/api/profile`                       | `x-workspace-key` | Mise à jour partielle du profil        |
| `POST`   | `/api/resumes/upload`                | `x-workspace-key` | Upload et extraction texte             |
| `GET`    | `/api/resumes`                       | `x-workspace-key` | Liste des CV sources                   |
| `GET`    | `/api/resumes/:id`                   | `x-workspace-key` | Détail d'un CV source                  |
| `DELETE` | `/api/resumes/:id`                   | `x-workspace-key` | Suppression physique du CV source      |
| `POST`   | `/api/resumes/:id/structure`         | `x-workspace-key` | Structuration JSON du CV source        |
| `POST`   | `/api/resumes/:id/matches/:slug`     | `x-workspace-key` | Score d'une offre, recalculé et stocké |
| `POST`   | `/api/resumes/:id/matches`           | `x-workspace-key` | Score de toutes les offres publiées    |
| `GET`    | `/api/resumes/:id/matches`           | `x-workspace-key` | Scores stockés, meilleur d'abord       |
| `GET`    | `/api/resumes/:id/documents/cv.pdf`  | `x-workspace-key` | CV en PDF, régénéré à chaque appel     |
| `POST`   | `/api/resumes/:id/letters/:slug`     | `x-workspace-key` | Génération de la lettre                |
| `GET`    | `/api/resumes/:id/letters`           | `x-workspace-key` | Relecture des lettres stockées         |
| `GET`    | `/api/resumes/:id/letters/:slug/pdf` | `x-workspace-key` | Lettre en PDF                          |
| `POST`   | `/api/applications`                  | `x-workspace-key` | Création d'un dossier de candidature   |
| `GET`    | `/api/applications`                  | `x-workspace-key` | Liste des dossiers                     |
| `PATCH`  | `/api/applications/:id`              | `x-workspace-key` | Statut, notes                          |
| `DELETE` | `/api/applications/:id`              | `x-workspace-key` | Suppression du dossier                 |

Le site porte en plus `GET /`, `GET /offres/:slug`, `GET /candidatures` et le proxy `ALL /api/ws/*` (Next.js), qui relaie vers l'API en posant `INTERNAL_API_KEY` côté serveur.

Routes absentes : authentification utilisateur complète, analyse GitHub, export DOCX, administration, webhook ou commandes Telegram en HTTP.

## Données et conformité

- Les sources collectables viennent du registre de [docs/legal-compliance.md](legal-compliance.md), synchronisé par `pnpm registry:sync`.
- Une source non autorisée par le registre ne doit pas s'exécuter : la permission est portée par un type, pas par une déclaration.
- `OWNER_ACCEPTED_SCRAPING` désigne un accès **toléré, non autorisé** : le propriétaire assume le risque, et ce régime reste distinct de `PUBLIC_FEED`. `PROHIBITED`, `DISABLED_PENDING_PERMISSION`, `SEARCH_ENGINE_DISCOVERY_ONLY` et `MANUAL_IMPORT` sont refusés.
- Brave sert uniquement à découvrir des sources. Les résultats de recherche restent transitoires et ne sont pas stockés comme offres.
- Les domaines découverts doivent passer les contrôles robots et signaux de contenu avant enregistrement. Pour Workday, le `robots.txt` du locataire est relu avant chaque collecte.
- Les sources payantes (Apify) passent par une garde de budget : plafond par cycle et par mois, coût consigné dans `ConnectorRun`, dépassement qui arrête la source sans arrêter le cycle.
- Les offres de démonstration restent marquées `isDemo = true`. Elles ont été supprimées de la base en ligne le 2026-07-27 : aucune donnée de démonstration n'y subsiste, et `pnpm db:seed` reste un outil de développement manuel.

## Configuration et ports

Chaque runtime lit la configuration via `@findit/config` et échoue vite si une variable requise est invalide.

| Runtime | Variables principales                                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web     | `WEB_PORT`, `NEXT_PUBLIC_API_URL`, `INTERNAL_API_KEY` (proxy serveur)                                                                                                                                                                                   |
| API     | `API_PORT`, `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGIN`, `INTERNAL_API_KEY`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`                                                                                                                                        |
| Worker  | `DATABASE_URL`, `REDIS_URL`, `JOB_COLLECTION_CRON`, `JOB_COLLECTION_TIMEZONE`, `BRAVE_SEARCH_API_KEY`, `WEB_SEARCH_MAX_QUERIES_PER_RUN`, `APIFY_API_TOKEN`, `SCRAPED_SOURCES_ENABLED`, `SCRAPED_COLLECTION_CRON`, `SCRAPING_*`, `TELEGRAM_*`, `APP_URL` |

Findit utilise `3100` pour le web et `4000` pour l'API en local. Le port `3000` ne doit pas être utilisé pour ce projet.

La base est en ligne (Neon) et exige TLS. Redis reste local. Un `DATABASE_URL` distant sans TLS doit faire échouer le démarrage.

## Limites connues

- Le rôle applicatif de la base en ligne n'est pas propriétaire du schéma : une migration qui change la structure doit être appliquée avec une connexion propriétaire, puis réconciliée par `migrate resolve`. L'incident s'est produit deux fois.
- `DATABASE_URL_OWNER` existe dans le `.env` local mais n'est déclaré nulle part dans le code ni dans `.env.example`.
- Aucun connecteur de job board ne tourne : `SCRAPED_SOURCES_ENABLED` vaut `false`, donc Welcome to the Jungle ne s'exécute que par l'outil `pnpm board:proof`. La garde de budget est en revanche déjà câblée dans les deux cycles (`createCycleDeps`) ; elle n'est sollicitée que si un connecteur payant tourne.
- Le contenu d'une offre de job board s'afficherait aujourd'hui en entier sur le site public : la règle d'affichage (extrait court et lien vers l'origine, ou description complète réservée au matching privé) n'est pas tranchée.
- Le CV source n'a ni versionnement, ni chiffrement du binaire : seul le texte extrait est conservé.
- Le matching/scoring de CV et la génération des documents ne dépendent pas de règles déterministes, par choix de coût. L'IA DeepSeek sert l'agent (extraction, analyse, matching/scoring de CV).
- L'analyse GitHub et l'export DOCX n'existent pas.
- Le workflow CI est écrit mais GitHub Actions est désactivé pour le compte du dépôt : aucune exécution automatique.
- Le flux est presque vide : 3 offres publiées pour tout le site au 2026-10-06, alors que 92 cycles de collecte ont abouti. La contrainte est l'offre disponible sur les sources natives, pas la chaîne technique - d'où le chantier de scraping.
- Les tables privées sont vides : aucun profil, aucun CV, aucune lettre n'a encore été écrit, même si l'API pointe sur la base en ligne.
