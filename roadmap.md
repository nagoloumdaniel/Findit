# Roadmap Findit

## 1. Informations generales

| Champ                 | Valeur                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nom du projet         | Findit                                                                                                                                                   |
| Objectif              | Agreger des offres d'alternance et de stage developpeur en Ile-de-France, puis aider le proprietaire a analyser son CV, ses projets et ses candidatures. |
| Source de verite      | `roadmap.md`, alignee avec `HANDOFF.md` le 2026-07-25                                                                                                    |
| Branche analysee      | `main`                                                                                                                                                   |
| Commit analyse        | `b418bfc1b20ad1c2f405867ec9295fc452fa4379`                                                                                                               |
| Date du dernier audit | 2026-07-24                                                                                                                                               |
| Environnement teste   | Windows, PowerShell, Node `v24.18.0`, pnpm `11.13.1`, PostgreSQL Docker, Redis Docker                                                                    |
| Statut global         | Socle public avance et testable ; extension personnelle encore majoritairement a construire                                                              |
| Progression estimee   | 45 % environ, estimation d'audit et non mesure contractuelle                                                                                             |

Deux mondes restent separes :

- flux public des offres : liste, recherche, filtres, detail, collecte autorisee ;
- espace prive : profil, CV, analyse, generation, candidatures, notifications personnelles.

## 2. Methode et legende

- On avance une etape a la fois, sous ordre explicite de l'utilisateur.
- Une etape est implementee, puis verifiee par des commandes reelles dont le resultat est presente.
- Une case est cochee uniquement apres validation utilisateur de l'etape complete.
- Chaque fonctionnalite validee donne lieu a un commit et un push sur `main`, seulement sur demande.
- Aucune fonctionnalite n'est presentee comme terminee si elle repose encore sur un mock.
- Le registre de conformite fait foi : aucune source nouvelle n'est collectee sans inscription et date de verification.
- Ne jamais toucher au port `3000` : Findit utilise le port web `3100`.

Legende :

- [ ] A faire
- [~] En cours ou partiellement fait
- [x] Termine et valide
- [!] Bloque
- [-] Annule ou non pertinent

Priorites :

- `P0` : bloque le fonctionnement ou expose un risque critique.
- `P1` : indispensable pour une premiere version complete.
- `P2` : amelioration importante.
- `P3` : optimisation ou fonctionnalite secondaire.

Complexite indicative : `XS`, `S`, `M`, `L`, `XL`.

## 3. Resume executif

### Ce qui fonctionne

- Monorepo pnpm/Turborepo, TypeScript strict, lint, typecheck, tests et build.
- Infrastructure locale PostgreSQL + Redis via Docker Compose.
- Prisma 7.8.0, migrations appliquees, contraintes et index metier.
- API publique des offres : liste, filtres, statistiques, detail par slug.
- Frontend public Next.js : page liste, filtres par liens, recherche, pagination, detail d'offre, etats vides et etats API indisponible.
- Connecteurs Greenhouse, Lever et Workable avec validation de forme, cadence et registre de conformite.
- Garde-fou de collecte : un connecteur non autorise par le registre ne peut pas s'executer.
- Normalisation, classification contrat/metier, localisation Ile-de-France, detection d'ecoles et decision d'ingestion.
- Worker BullMQ : cron 4 h, scheduler idempotent, concurrence 1, cycle de decouverte puis collecte, logs structures.
- Notifications Telegram pour nouvelles offres uniquement, avec idempotence et mode simulation par defaut.
- Espace prive minimal : `WorkspaceGuard` sur `x-workspace-key`, comparaison a temps constant, profil candidat unique.
- Import de CV source prive : PDF, DOCX, TXT, limite de taille, extraction de texte, deduplication par empreinte.
- Structure JSON du CV source : route gardee, Ollama local, schema Zod strict, stockage des faits/warnings/confiance.
- Couche IA locale `@findit/ai` : Ollama, sortie structuree revalidee par Zod, erreurs explicites.

### Ce qui est partiellement fonctionnel

- Base locale : 6 offres presentes, toutes marquees `isDemo = true`; les logs de traitement existent mais aucune offre reelle publiee n'est presente dans l'environnement local audite.
- CV : texte extrait, structure JSON, suppression et retention effectives et prouvees sur le reel ; il manque encore versions et binaire chiffre.
- IA : le client local est teste avec faux transport et utilise par la route privee de structuration CV ; pas encore utilise pour matching ou generation.
- Telegram : l'alerte de nouvelles offres existe, mais les commandes bot (`/start`, `/status`, `/latest`, `/help`) sont absentes.
- Documentation : `HANDOFF.md`, cette roadmap, `README.md` et `docs/architecture.md` sont realignes.

### Ce qui est simule ou mocke

- Le jeu de donnees local audite contient uniquement des offres de demonstration.
- Les tests utilisent des doubles de `fetch`, de Prisma ou de BullMQ selon le module ; ces doubles sont acceptables car limites aux tests.
- Telegram est en simulation par defaut tant que `TELEGRAM_NOTIFICATIONS_ENABLED`, `TELEGRAM_DRY_RUN`, le token et le chat ne sont pas regles pour un envoi reel.

### Ce qui est casse

- Aucun echec applicatif bloquant n'est confirme par les controles automatises lances separement.
- Un smoke test runtime manuel via `Start-Process` a ete bloque par la politique locale d'execution ; il n'a pas demarre les serveurs et ne prouve pas un defaut applicatif.

### Ce qui manque

- Conservation chiffree et versionnee du binaire original du CV.
- Messages recruteurs et export DOCX (CV et lettre s'exportent deja en PDF).
- Analyse GitHub et selection de projets.
- Rappels et statistiques personnelles de candidature (le suivi avec statuts et historique est fait).
- Commandes Telegram.
- Recherche web en production complete, avec politique de non-stockage des resultats Brave maintenue.
- Administration, observabilite, monitoring, sauvegardes, CI/CD.

### Risques principaux

- Risque documentaire residuel : maintenir `HANDOFF.md`, `roadmap.md`, `README.md` et `docs/architecture.md` alignes a chaque brique.
- Risque fonctionnel : ferme le 2026-07-26 - Workable est raccorde au cycle et prouve sur le reseau reel.
- Risque donnees personnelles : le CV source se supprime et expire desormais, mais le binaire original n'est ni conserve chiffre ni versionne.
- Risque securite locale : ferme le 2026-07-26 - la variable obsolete `OPENAI_API_KEY` a ete retiree du `.env` local ; revoquer la cle chez OpenAI si elle etait reelle.
- Historique Git : un incident Brave a existe et est documente comme traite ; ne jamais remettre de valeur reelle dans `.env.example`.

## 4. Stack detectee

| Couche            | Technologie / version detectee                                    | Role                                       |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| Monorepo          | pnpm workspaces `11.13.1`, Turborepo `2.10.5`                     | Orchestration build/lint/test/typecheck    |
| Langage           | TypeScript `6.0.3`, Node `v24.18.0`                               | Code applicatif strict                     |
| Frontend          | Next.js `16.2.10`, React `19.2.7`                                 | Liste et detail publics d'offres           |
| Backend           | NestJS `11.1.28`, Fastify `5.10.0`                                | API HTTP et routes privees                 |
| Worker            | NestJS, BullMQ `5.80.5`                                           | Collecte planifiee et jobs asynchrones     |
| Base              | PostgreSQL `pgvector/pgvector:pg18`, Prisma `7.8.0`, `pg` adapter | Persistance, migrations, contraintes       |
| Cache / queue     | Redis `8.8.0-alpine`                                              | File BullMQ                                |
| Validation        | Zod `4.4.3`                                                       | Environnement, queries, body et sorties IA |
| CV                | `unpdf`, `mammoth`                                                | Extraction PDF/DOCX/TXT                    |
| IA                | Ollama local, modele par defaut `qwen2.5:7b`                      | Generation structuree et texte libre       |
| Notifications     | Telegram Bot API via `fetch`                                      | Alertes de nouvelles offres                |
| Qualite           | ESLint `10.7.0`, Prettier `3.9.5`, Vitest `4.1.10`                | Lint, format, tests                        |
| Deploiement local | Docker Compose                                                    | PostgreSQL et Redis locaux                 |

## 5. Architecture actuelle

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
    +--> Decouverte Brave transitoire, si cle presente
    |
    +--> Registre Connector / CompanySource
    |
    +--> Connecteurs autorises
          +--> Greenhouse
          +--> Lever
          +--> Workable, moteur teste mais non execute par le cycle actuel
    |
    +--> Normalisation / classification / ingestion
    |
    +--> Telegram, si active

Espace prive
    |
    +--> WorkspaceGuard x-workspace-key
    +--> Profil candidat unique
    +--> CV source : import + extraction texte + structure JSON
    +--> IA locale branchee pour la structuration CV
```

## 6. Etat des modules

| Module               | Frontend          | Backend/API                   | Base de donnees      | Tests | Statut reel                 | Priorite |
| -------------------- | ----------------- | ----------------------------- | -------------------- | ----- | --------------------------- | -------- |
| Socle monorepo       | N/A               | N/A                           | N/A                  | Oui   | Fonctionnel                 | P0       |
| Offres publiques     | Liste + detail    | `GET /api/jobs*`              | `Job`, `Company`     | Oui   | Fonctionnel avec donnees DB | P0       |
| Collecteurs ATS      | N/A               | Worker                        | `Connector*`         | Oui   | Fonctionnel                 | P1       |
| Normalisation        | N/A               | Pipeline                      | `ProcessingLog`      | Oui   | Fonctionnel                 | P0       |
| Classification       | N/A               | Pipeline                      | Decisions partielles | Oui   | Fonctionnel                 | P0       |
| Deduplication        | N/A               | Branchee a l'ingestion        | Tables ecrites       | Oui   | Fonctionnel                 | P1       |
| Worker cron          | N/A               | BullMQ worker                 | Runs/logs            | Oui   | Fonctionnel                 | P0       |
| Telegram alertes     | N/A               | Worker + package              | Notification table   | Oui   | Partiel, simulation defaut  | P1       |
| Espace prive         | Page /espace (CV) | Guard + profil                | `CandidateProfile`   | Oui   | Partiel, scores/lettres UI  | P1       |
| CV source            | Absent            | Upload/liste/detail/structure | `SourceResume`       | Oui   | Partiel                     | P1       |
| IA locale            | Absent            | Package + route CV            | Prompt tables        | Oui   | Partiel                     | P1       |
| Matching CV/offre    | Absent            | Moteur + routes gardees       | `SourceResumeMatch`  | Oui   | Backend fonctionnel         | P1       |
| GitHub               | Absent            | Absent                        | Absent               | Non   | Absent                      | P2       |
| Generation documents | Absent            | PDF CV + lettre generee       | `SourceCoverLetter`  | Oui   | Partiel, DOCX absent        | P1       |
| Suivi candidatures   | Absent            | CRUD + historique             | `Application*`       | Oui   | Backend fonctionnel         | P1       |
| Admin                | Absent            | Absent                        | Partiel via logs     | Non   | Absent                      | P3       |
| CI/CD                | Absent            | N/A                           | N/A                  | Non   | Absent                      | P2       |

## 7. API presentes

| Methode | Chemin                               | Controleur            | Validation                  | Authentification | Statut reel                |
| ------- | ------------------------------------ | --------------------- | --------------------------- | ---------------- | -------------------------- |
| GET     | `/health`                            | `HealthController`    | Aucune entree               | Publique         | Fonctionnel et teste       |
| GET     | `/api/jobs`                          | `JobsController`      | `jobQuerySchema`            | Publique         | Fonctionnel et teste       |
| GET     | `/api/jobs/stats`                    | `JobsController`      | Aucune entree               | Publique         | Fonctionnel et teste       |
| GET     | `/api/jobs/filters`                  | `JobsController`      | `freshnessQuerySchema`      | Publique         | Fonctionnel et teste       |
| GET     | `/api/jobs/:slug`                    | `JobsController`      | `jobSlugSchema` + freshness | Publique         | Fonctionnel et teste       |
| GET     | `/api/profile`                       | `ProfileController`   | Aucune entree               | `WorkspaceGuard` | Backend fonctionnel        |
| PUT     | `/api/profile`                       | `ProfileController`   | `profileInputSchema`        | `WorkspaceGuard` | Backend fonctionnel        |
| PATCH   | `/api/profile`                       | `ProfileController`   | `profilePatchSchema`        | `WorkspaceGuard` | Backend fonctionnel        |
| POST    | `/api/resumes/upload`                | `ResumeController`    | MIME/extension + taille     | `WorkspaceGuard` | Partiel : extraction texte |
| GET     | `/api/resumes`                       | `ResumeController`    | Aucune entree               | `WorkspaceGuard` | Backend fonctionnel        |
| GET     | `/api/resumes/:id`                   | `ResumeController`    | UUID                        | `WorkspaceGuard` | Backend fonctionnel        |
| POST    | `/api/resumes/:id/structure`         | `ResumeController`    | UUID                        | `WorkspaceGuard` | Fonctionnel, valide        |
| DELETE  | `/api/resumes/:id`                   | `ResumeController`    | UUID                        | `WorkspaceGuard` | Fonctionnel, valide        |
| POST    | `/api/resumes/:id/matches/:slug`     | `MatchingController`  | UUID + slug strict          | `WorkspaceGuard` | Fonctionnel, valide        |
| GET     | `/api/resumes/:id/matches`           | `MatchingController`  | UUID                        | `WorkspaceGuard` | Fonctionnel, valide        |
| GET     | `/api/resumes/:id/documents/cv.pdf`  | `DocumentsController` | UUID                        | `WorkspaceGuard` | Fonctionnel, valide        |
| POST    | `/api/resumes/:id/letters/:slug`     | `LettersController`   | UUID + slug strict          | `WorkspaceGuard` | Fonctionnel, valide        |
| GET     | `/api/resumes/:id/letters`           | `LettersController`   | UUID                        | `WorkspaceGuard` | Fonctionnel, valide        |
| GET     | `/api/resumes/:id/letters/:slug/pdf` | `LettersController`   | UUID + slug strict          | `WorkspaceGuard` | Fonctionnel, valide        |

Endpoints absents : authentification utilisateur complete, matching, generation, GitHub, candidatures, admin, commandes Telegram HTTP/webhook.

## 8. Etat base de donnees locale auditee

Compteurs releves le 2026-07-24 apres `pnpm infra:up`, `pnpm db:migrate` et `pnpm registry:sync` :

| Table                     | Lignes | Lecture d'audit                                    |
| ------------------------- | ------ | -------------------------------------------------- |
| `Connector`               | 13     | Registre synchronise                               |
| `CompanySource`           | 30     | Sources d'entreprise deja enregistrees             |
| `ConnectorRun`            | 60     | Historique de collectes                            |
| `Job`                     | 6      | 4 publiees, 1 expiree, 1 quarantaine ; toutes demo |
| `ProcessingLog`           | 4620   | Traces de decisions/rejets                         |
| `CandidateProfile`        | 0      | Aucun profil local                                 |
| `SourceResume`            | 0      | Aucun CV source local                              |
| `TelegramJobNotification` | 0      | Aucune notification locale                         |

## 9. Dette technique

| Element                         | Impact                        | Risque                               | Solution proposee                          | Priorite |
| ------------------------------- | ----------------------------- | ------------------------------------ | ------------------------------------------ | -------- |
| Pas de CI/CD `.github`          | Validations locales seulement | Regressions non detectees avant push | Ajouter workflow lint/typecheck/test/build | P2       |
| Pas d'observabilite exploitable | Diagnostic prod limite        | Incidents difficiles a expliquer     | Logs structures, metriques, health worker  | P2       |

## 10. Roadmap detaillee

### Phase 0 - Stabilisation et audit

- [~] Audit initial 2026-07-24 et source de verite documentaire
  - Priorite : P0
  - Complexite : S
  - Fichiers concernes : `HANDOFF.md`, `roadmap.md`, `README.md`, `docs/architecture.md`
  - Criteres d'acceptation :
    - Le rapport distingue ce qui est fonctionnel, partiel, simule, casse et absent.
    - Les commandes executees et leurs resultats sont consignes.
    - Aucune nouvelle case n'est cochee sans validation utilisateur.
  - Tests : `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm db:migrate`
  - Resultat : audit realise ; validation utilisateur attendue.

- [x] Restaurer la baseline format
  - Priorite : P0
  - Complexite : XS
  - Fichiers concernes : `packages/ai/src/ollama-client.test.ts`
  - Criteres d'acceptation :
    - `pnpm format:check` passe.
    - Aucune logique de test n'est changee sans necessite.
  - Tests : `pnpm format:check`, puis `pnpm --filter @findit/ai test`
  - Resultat : correction Prettier appliquee ; `pnpm format:check` et `pnpm --filter @findit/ai test` passent ; valide par ordre utilisateur du 2026-07-24.

- [x] Realigner la documentation historique
  - Priorite : P1
  - Complexite : S
  - Fichiers concernes : `README.md`, `docs/architecture.md`, eventuellement `docs/premium-extension-report.md`
  - Criteres d'acceptation :
    - Les docs ne disent plus que la collecte, le CV ou l'IA sont absents quand le code les contient.
    - Les limites actuelles restent explicites.
    - `HANDOFF.md` reste le resume de reprise court.
  - Tests : `pnpm format:check`, `git diff --check`
  - Resultat : `README.md` et `docs/architecture.md` realignes avec `HANDOFF.md` et l'audit courant ; valide par ordre utilisateur du 2026-07-24.

### Phase 1 - Fondations techniques

- [x] Monorepo pnpm/Turborepo, applications, packages, Docker, Prisma, configuration, README et controles qualite

- [x] Schema metier, migrations et index

- [ ] Ajouter une CI minimale
  - Priorite : P2
  - Complexite : M
  - Fichiers concernes : `.github/workflows/ci.yml`
  - Criteres d'acceptation :
    - La CI installe Node 24 et pnpm 11.13.1.
    - Elle lance `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
    - Les secrets ne sont pas necessaires pour les tests.
  - Tests : execution GitHub Actions apres push
  - Resultat :

### Phase 2 - Offres publiques

- [x] API des offres, recherche, filtres, liste et detail

- [x] Frontend public liste/detail avec etats vides et indisponibilite API

- [ ] Verifier visuellement le frontend sur desktop et mobile
  - Priorite : P2
  - Complexite : S
  - Fichiers concernes : `apps/web/src/app`, `apps/web/src/components`, `apps/web/src/app/globals.css`
  - Criteres d'acceptation :
    - La home et le detail s'affichent sur desktop et mobile.
    - Les textes ne se chevauchent pas.
    - Les etats vide/API indisponible sont lisibles.
  - Tests : build Next, verification navigateur ou Playwright
  - Resultat :

### Phase 3 - Collecte autorisee

- [x] Registre de conformite, Greenhouse, Lever, Workable documentes et testes

- [x] Garde-fou structurel refusant une source non autorisee

- [x] Lecture `robots.txt`, content signals et decouverte Brave transitoire

- [x] Brancher Workable dans le cycle worker reel
  - Priorite : P1
  - Complexite : M
  - Fichiers concernes : `apps/worker/src/collection/cycle-deps.ts`, `apps/worker/src/collection/run-cycle.ts`, `packages/job-connectors/src/workable.ts`
  - Dependances : decision claire sur les requetes Workable a executer par cycle
  - Criteres d'acceptation :
    - Le cycle sait lancer un connecteur `SearchTarget` sans casser les connecteurs par token.
    - La cadence reste bornee a une requete par seconde.
    - Les resultats passent par l'ingestion et les logs comme les autres sources.
  - Tests : tests worker + test connecteur Workable + smoke avec base/Redis reels
  - Resultat : `RawJob` porte l'employeur par offre (Workable le remplit, une offre de recherche sans entreprise est rejetee plutot qu'attribuee a un libelle de requete), le cycle execute deux recherches permanentes (alternance et stage developpeur, Ile-de-France) avec memes permis, ingestion et journaux ; prouve par un cycle reel le 2026-07-26 : 31 offres Workable ramenees du vrai reseau, zero echec, tri d'ingestion normal ; valide par ordre utilisateur du 2026-07-26.

### Phase 4 - Qualite des offres

- [x] Normalisation du texte, titre comparable, sections et localisation Ile-de-France

- [x] Classification contrat/metier, detection d'ecoles et ingestion en base

- [x] Deduplication
  - Priorite : P1
  - Complexite : M
  - Fichiers concernes : `packages/job-deduplication`, `packages/job-pipeline/src/persist.ts`, schema Prisma
  - Tests : tests unitaires + preuve d'integration reelle
  - Resultat : branchee a l'ingestion a la creation d'une offre - candidates de meme titre normalise (lot 25), fusion en statut DUPLICATE avec groupe et canonique, doute groupe en REVIEW (enum etendu par migration additive), decision ecrite avec score/detail/raisons, trace ProcessingLog ; prouve sur PostgreSQL reel (fusion a 0.94, nettoyage a zero trace) ; valide par ordre utilisateur du 2026-07-27.

### Phase 5 - Authentification et profil

- [x] Espace prive par en-tete `x-workspace-key`, comparaison a temps constant et profil candidat unique

- [ ] Ajouter une UI privee minimale pour le profil
  - Priorite : P1
  - Complexite : M
  - Fichiers concernes : `apps/web/src/app`, `apps/web/src/lib/api.ts`, `apps/api/src/profile`
  - Criteres d'acceptation :
    - Le profil se lit, se cree et se modifie depuis une page protegee.
    - La cle n'est jamais stockee dans le code.
    - Les erreurs 401/404/validation sont affichees clairement.
  - Tests : tests API + tests composants ou E2E
  - Resultat :

### Phase 6 - CV source

- [~] Import prive et extraction texte PDF/DOCX/TXT
  - Priorite : P1
  - Complexite : deja fait partiellement
  - Fait : upload garde, limite de taille, extraction, deduplication par empreinte.
  - Manque : versions, suppression, retention effective, chiffrement/conservation du binaire si necessaire.
  - Tests : `apps/api/src/resume/extract-text.test.ts`, tests controller/service a completer
  - Resultat :

- [x] Structurer le CV en JSON valide
  - Priorite : P1
  - Complexite : M
  - Fichiers concernes : `apps/api/src/resume`, `packages/ai/src`, `packages/database/prisma/schema.prisma`
  - Dependances : Ollama disponible si `AI_PROVIDER=ollama`
  - Criteres d'acceptation :
    - Le texte extrait est transforme en identite, formations, experiences, competences, langues et projets.
    - La sortie est validee par Zod et stockee.
    - Les champs absents restent absents ; rien n'est invente.
    - Les erreurs IA indisponible ou sortie invalide sont explicites.
  - Tests : tests schema, service, route gardee, test sortie invalide
  - Resultat : route `POST /api/resumes/:id/structure`, schema Zod strict, appel Ollama local et stockage `structuredFacts` / `structuredWarnings` / `structuredConfidence` / `structuredAt`; valide par ordre utilisateur du 2026-07-25.

- [x] Supprimer un CV source et appliquer une retention
  - Priorite : P1
  - Complexite : S
  - Fichiers concernes : `apps/api/src/resume`, `packages/database/prisma/schema.prisma`
  - Criteres d'acceptation :
    - `DELETE /api/resumes/:id` supprime ou marque la suppression selon la decision retenue.
    - Une retention automatique est documentee et testee.
    - Les routes liste/detail n'exposent plus un CV supprime.
  - Tests : tests API/service
  - Resultat : `DELETE /api/resumes/:id` avec suppression physique et detachement du profil, `expiresAt` a chaque import (`RESUME_RETENTION_HOURS`), purge des CV expires au passage sur les routes CV ; prouve le 2026-07-25 contre API et base reelles (401 sans cle, upload +24 h, 204 puis 404, expiration forcee puis zero ligne en base) ; valide par ordre utilisateur du 2026-07-25.

### Phase 7 - IA et scoring

- [x] Client IA local Ollama avec sortie structuree revalidee

- [x] Calculer un score explicable offre / profil sans IA
  - Priorite : P1
  - Complexite : L
  - Fichiers concernes : `packages/matching-engine`, `apps/api/src`, `packages/database/prisma/schema.prisma`
  - Dependances : CV structure, offres publiees, competences normalisees
  - Criteres d'acceptation :
    - Le score ne vient pas d'une valeur aleatoire ni d'une reponse brute IA.
    - Les criteres et pondérations sont explicites.
    - Les competences presentes, manquantes et recommandations sont stockees.
    - Un avertissement signale les donnees insuffisantes.
  - Tests : unitaires sur pondérations + integration `JobMatch`
  - Resultat : `@findit/matching-engine` (dictionnaire technique, 4 criteres ponderes 50/20/15/15, renormalisation, avertissement donnees insuffisantes), table `SourceResumeMatch` en cascade, routes gardees POST/GET `/api/resumes/:id/matches`; prouve le 2026-07-25 contre Ollama et base reels : 93/100 offre front-end demo, 36/100 back-end avec manques listes (SQL, PostgreSQL, API REST) ; correctif `@findit/ai` au passage (retrait des mots-cles `pattern`/`format`/`minLength`/`maxLength` du schema envoye, revalidation Zod conservee) ; valide par ordre utilisateur du 2026-07-25.

- [x] Expliquer le score dans l'interface
  - Priorite : P1
  - Complexite : M
  - Fichiers concernes : `apps/web`, `apps/api`
  - Criteres d'acceptation :
    - L'utilisateur voit le score, les raisons, les forces, les manques et les limites.
    - Aucun score n'est affiche sans base de calcul verifiable.
  - Tests : rendu + API
  - Resultat : section « Candidature » de /espace - score en grand avec confiance, criteres ponderes en francais, competences couvertes et manquantes en pastilles, recommandations, avertissement affiche tel quel ; lettres generees, relisibles et exportables en PDF depuis la meme page ; valide par ordre utilisateur du 2026-07-26.

### Phase 8 - GitHub et projets

- [ ] Synchroniser les depots GitHub publics
  - Priorite : P2
  - Complexite : L
  - Fichiers concernes : nouveau package ou module API dedie
  - Criteres d'acceptation :
    - Pagination GitHub geree.
    - README, langages et activite recente sont lus.
    - Les limites API et erreurs sont gerees.
    - Aucun token prive n'est stocke en clair.
  - Tests : connecteur avec doubles + contrat de stockage
  - Resultat :

- [ ] Selectionner les projets pertinents pour une offre
  - Priorite : P2
  - Complexite : M
  - Dependances : GitHub sync + matching
  - Criteres d'acceptation :
    - Les projets sont recommandes avec preuves issues du depot.
    - Les depots prives ne partent jamais vers une IA distante.
  - Tests : score projet/offre
  - Resultat :

### Phase 9 - Generation de candidature

- [x] Concevoir les modeles de CV et lettre
  - Priorite : P1
  - Complexite : L
  - Criteres d'acceptation :
    - Modeles preconçus, pas regeneres entierement par l'IA.
    - Rendu deterministe.
    - Les faits utilises sont traçables.
  - Tests : snapshots/rendu + validation donnees
  - Resultat : modele de CV fait et valide le 2026-07-26 - `@findit/documents`, A4 sobre en Helvetica integree, rendu React-PDF pur Node, champ absent = absent du PDF, tests qui relisent le texte du PDF rendu ; route gardee `GET /api/resumes/:id/documents/cv.pdf` (409 tant que le CV n'est pas structure, 401 sans cle), prouvee contre Ollama et base reels. Modele de lettre fait et valide le 2026-07-26 : formules d'adresse et de politesse dans le modele de document, jamais dans l'IA.

- [x] Generer une lettre de motivation factuelle
  - Priorite : P1
  - Complexite : M
  - Dependances : CV structure, offre, score
  - Criteres d'acceptation :
    - La lettre cite uniquement des faits du CV et de l'offre.
    - Les sorties IA invalides ou trop vagues sont refusees.
    - L'utilisateur peut relire avant utilisation.
  - Tests : service + cas donnees insuffisantes
  - Resultat : `POST /api/resumes/:id/letters/:slug` genere via le modele local (schema Zod avec bornes anti-vague), puis garde-fou anti-invention : toute technologie citee doit exister dans le CV structure (meme dictionnaire que le score), violation refusee en 502 sans stockage ; `SourceCoverLetter` en cascade, relecture par GET, PDF par `GET .../letters/:slug/pdf`. Prouve sur le reel le 2026-07-26 : lettre factuelle en 33 s, PDF relu fidele, cascade a zero ligne ; valide par ordre utilisateur du 2026-07-26.

- [~] Exporter CV et lettre en PDF/DOCX
  - Priorite : P1
  - Complexite : L
  - Criteres d'acceptation :
    - Export consultable et stable.
    - Aucun champ manquant n'est invente.
    - Les documents sont rattaches a l'historique.
  - Tests : generation fichier + inspection minimale
  - Resultat : exports PDF du CV et de la lettre faits et valides ; restent l'export DOCX et le rattachement a l'historique de candidatures (qui n'existe pas encore).

### Phase 10 - Suivi des candidatures

- [x] Creer le dossier de candidature
  - Priorite : P1
  - Complexite : M
  - Criteres d'acceptation :
    - Une candidature lie offre, CV, lettre, statut, notes et date.
    - Les statuts ont un historique.
    - Les offres expirees restent consultables dans le dossier.
  - Tests : API + base
  - Resultat : `Application` (instantanes offre/CV/score/lettre, lien vivant en SetNull) + `ApplicationEvent` (historique date, jamais reecrit), migration `20260726210000_application_tracking` sans derive ; routes gardees POST/GET/PATCH/DELETE `/api/applications`, `appliedAt` fixe une seule fois au passage a APPLIED ; prouve sur le reel avec le vrai CV du proprietaire le 2026-07-26 ; valide par ordre utilisateur du 2026-07-26. UI de suivi dans /espace en brique suivante.

- [ ] Ajouter rappels et statistiques personnelles
  - Priorite : P2
  - Complexite : M
  - Tests : worker + UI
  - Resultat :

### Phase 11 - Notifications

- [x] Alertes Telegram de nouvelles offres, idempotentes et en simulation par defaut

- [ ] Ajouter les commandes Telegram
  - Priorite : P2
  - Complexite : M
  - Commandes attendues : `/start`, `/status`, `/latest`, `/help`
  - Criteres d'acceptation :
    - Les commandes ne revelent aucune donnee privee sans verification.
    - Les erreurs Telegram ne journalisent pas le token.
  - Tests : parsing commande + envoi simule
  - Resultat :

### Phase 12 - Securite et donnees personnelles

- [x] Nettoyer l'environnement local obsolète
  - Priorite : P1
  - Complexite : XS
  - Fichiers concernes : `.env` local non committe
  - Criteres d'acceptation :
    - `OPENAI_API_KEY` est retiree si aucun fournisseur distant n'est retenu.
    - Les variables necessaires restent documentees dans `.env.example`.
  - Tests : `pnpm typecheck`, demarrage API/worker si necessaire
  - Resultat : ligne `OPENAI_API_KEY` retiree du `.env` local le 2026-07-26, API verifiee saine ensuite ; recommandation donnee de revoquer la cle chez OpenAI si elle etait reelle ; valide par ordre utilisateur du 2026-07-26.

- [ ] Formaliser retention, export et suppression des donnees
  - Priorite : P1
  - Complexite : M
  - Criteres d'acceptation :
    - CV, profil, documents et candidatures ont des regles de conservation.
    - Les suppressions sont testees.
    - Les limites juridiques sont signalees comme a valider juridiquement.
  - Tests : API + base
  - Resultat :

- [ ] Ajouter rate limiting et durcissement upload
  - Priorite : P2
  - Complexite : M
  - Criteres d'acceptation :
    - Taille, MIME, timeout et erreurs sont bornes.
    - Les routes privees et upload sont protegees contre abus.
  - Tests : API negative cases
  - Resultat :

### Phase 13 - Tests et qualite

- [ ] Ajouter tests d'integration API pour profil et CV
  - Priorite : P1
  - Complexite : M
  - Criteres d'acceptation :
    - 401 sans cle, 400 validation, 404 absence, succes nominal.
    - Upload PDF/DOCX/TXT couvert au niveau route.
  - Tests : Vitest API
  - Resultat :

- [ ] Ajouter tests E2E parcours public
  - Priorite : P2
  - Complexite : M
  - Criteres d'acceptation :
    - Liste, filtres, recherche, pagination et detail couverts.
    - Port `3100` utilise, jamais `3000`.
  - Tests : Playwright ou equivalent
  - Resultat :

### Phase 14 - Performance et observabilite

- [ ] Ajouter logs et metriques exploitables
  - Priorite : P2
  - Complexite : M
  - Criteres d'acceptation :
    - Chaque cycle expose correlationId, duree, compteurs, erreurs.
    - Les erreurs ne contiennent ni CV complet inutile, ni token, ni cle.
  - Tests : tests logs/sanitisation
  - Resultat :

- [ ] Optimiser requetes et index selon usage reel
  - Priorite : P3
  - Complexite : M
  - Dependances : volume reel d'offres
  - Tests : plan d'execution ou benchmark local
  - Resultat :

### Phase 15 - Deploiement

- [ ] Documenter deploiement vierge
  - Priorite : P2
  - Complexite : M
  - Criteres d'acceptation :
    - Prerequis, installation, variables, migrations, seed, demarrage web/API/worker et rollback sont documentes.
    - Les secrets sont decrits par nom de variable seulement.
  - Tests : reprise sur environnement propre
  - Resultat :

- [ ] Preparer production
  - Priorite : P2
  - Complexite : L
  - Criteres d'acceptation :
    - HTTPS, domaine, sauvegardes, logs, monitoring, migrations et rollback sont couverts.
    - Ollama n'est pas expose publiquement.
  - Tests : smoke production
  - Resultat :

### Phase 16 - Validation finale

- [ ] Parcours utilisateur complet depuis un environnement vierge
  - Priorite : P1
  - Complexite : XL
  - Criteres d'acceptation :
    - Installation documentee et reproductible.
    - Offres reelles collectees depuis sources autorisees.
    - Profil et CV structures.
    - Score explicable.
    - Lettre/document genere sans invention.
    - Candidature suivie.
    - Notifications pertinentes.
    - Donnees isolees et supprimables.
    - Lint, typecheck, tests, build et format passent.
  - Tests : suite complete + verification manuelle guidee
  - Resultat :

### Phase 17 - Cahier des charges v2 (recu le 2026-07-27, ordre du proprietaire)

- [ ] Charger la base d'entreprises reelles fournie par le proprietaire
  - Priorite : P1
  - Attente : la liste (≈400 entreprises + sites carrieres) doit etre fournie en texte/CSV - une image ne suffit pas pour recopier des URL sans risque d'invention.
  - Regle maintenue : seuls les sites sur Greenhouse/Lever/Workable ou dont robots.txt autorise FinditBot deviennent collectables ; les autres sont enregistres mais non collectes (registre de conformite).
- [ ] Supprimer les donnees de demonstration une fois de vraies offres presentes
- [x] Cle privee memorisee : plus de saisie a chaque visite (localStorage, bouton Verrouiller pour l'oublier)
- [ ] Page unique avec bouton Filtres (dates, metiers, contrats, departements, presence) repliables
- [ ] Cartes d'offres : lien externe seul quand l'extraction a echoue, page detail quand elle a reussi
- [ ] « Faire matcher mon CV » : recherche des offres les plus compatibles depuis le CV, scoring affiche sur chaque carte, avec toutes les actions (structurer, CV, lettre, suivi)
- [ ] Matching a l'offre unique conserve, avec les memes actions
- [ ] Ameliorations de CV detaillees et poussees, exploitables hors application
- [ ] Competences manquantes dans CV/lettres : AJUSTEMENT PROPOSE - jamais presentees comme acquises ; ajoutees seulement marquees « en cours d'acquisition » dans le document, avec popup detaillant chaque ajout, sa raison face a l'offre et les notions a apprendre. Un document qui affirme une competence non possedee reste refuse (regle « rien d'invente »). A valider par le proprietaire.
- [ ] Extraction : dates jamais plus precises que la source (« 2025 » reste « 2025 »)
- [ ] Commandes Telegram (/start, /status, /latest, /help)
- [ ] CI GitHub Actions (format, lint, typecheck, test, build)
- [ ] Documentation de deploiement vierge

## 11. Bugs connus

| ID   | Bug                                                 | Gravite | Reproduction                                    | Cause probable                                       | Correctif propose                        | Statut |
| ---- | --------------------------------------------------- | ------- | ----------------------------------------------- | ---------------------------------------------------- | ---------------------------------------- | ------ |
| B001 | `pnpm format:check` echouait                        | P0      | `pnpm format:check`                             | `packages/ai/src/ollama-client.test.ts` non Prettier | Reformater le fichier                    | Ferme  |
| B002 | Documentation historique obsolete                   | P1      | Lire `README.md` et `docs/architecture.md`      | Docs non realignees apres phases recentes            | Recrire les sections d'etat/architecture | Ferme  |
| B003 | Workable actif mais non execute par le cycle worker | P1      | Lire `apps/worker/src/collection/cycle-deps.ts` | `TOKEN_CONNECTORS` ne porte que Greenhouse/Lever     | Ajouter une voie `SearchTarget`          | Ferme  |
| B004 | Deduplication non persistee                         | P1      | `rg decideDuplicate apps packages`              | Moteur pur non appele par ingestion                  | Branchee dans `persistDecision`          | Ferme  |
| B005 | `.env` local contient `OPENAI_API_KEY` obsolete     | P1      | Comparaison cles `.env` / `.env.example`        | Ancien choix fournisseur distant                     | Retiree du `.env` local                  | Ferme  |
| B006 | Pas de CI/CD                                        | P2      | Absence de dossier `.github`                    | Non implemente                                       | Ajouter workflow GitHub Actions          | Ouvert |

## 12. Decisions techniques

| Date       | Decision                                             | Justification                                           | Consequences                                   |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| 2026-07-16 | Monorepo pnpm/Turborepo, Next.js, NestJS, worker     | Separation web/API/traitements et evolution par briques | Structure `apps/*` et `packages/*`             |
| 2026-07-17 | Alternance et stage restent stockables               | Ne pas detruire le perimetre valide et les stages reels | L'affichage par defaut favorise l'alternance   |
| 2026-07-17 | Registre de conformite obligatoire                   | Ne pas collecter sans permission constatee              | `Connector` decide ce qui peut tourner         |
| 2026-07-17 | Brave sert uniquement a decouvrir                    | Ses conditions interdisent de stocker les resultats     | Resultats transitoires, jamais en base         |
| 2026-07-24 | IA locale via Ollama `qwen2.5:7b`                    | Cout nul et aucune donnee envoyee a un tiers            | `AI_PROVIDER=ollama`, sortie Zod revalidee     |
| 2026-07-24 | Le rendu CV/lettre doit etre deterministe            | Eviter de regenerer un document entier par offre        | IA limitee au texte/analyse, pas au design PDF |
| 2026-07-24 | Roadmap et cases restent sous validation utilisateur | Methode demandee par le proprietaire                    | Aucune nouvelle case cochee pendant cet audit  |

## 13. Journal d'avancement

### 2026-07-27 - deduplication persistee (B004) et cahier des charges v2

- Taches terminees et validees : deduplication branchee a l'ingestion - a la creation d'une offre, comparaison aux candidates de meme titre normalise (lot 25), fusion (statut DUPLICATE, groupe avec canonique) ou groupement pour controle (nouvelle valeur d'enum REVIEW, migration additive), decision ecrite avec score, detail et raisons, trace ProcessingLog. Prouve sur le reel : deux offres quasi identiques via la vraie chaine - A publiee, B fusionnee (score 0.94), decision MERGED par RULE, nettoyage a zero trace. Ordre utilisateur du 2026-07-27.
- Controles : format, lint 30/30, typecheck 30/30, test 30/30 (26 pipeline), build 17/17.
- Cahier des charges v2 recu du proprietaire, enregistre en Phase 17.

### 2026-07-26 (suite 6) - Workable dans le cycle reel (B003)

- Taches terminees et validees : employeur par offre dans `RawJob` (rempli par Workable, repli registre pour les connecteurs par jeton, rejet des offres de recherche sans entreprise), recherches permanentes Workable dans le cycle (2 requetes Ile-de-France), memes permis/ingestion/journaux. Ordre utilisateur du 2026-07-26.
- Preuve sur le reel : un cycle complet contre le vrai reseau - 33 collectes, 31 offres Workable vues (21 + 10), zero echec Workable, 2387 offres vues au total, toutes rejetees au tri (juillet hors saison, resultat documente).
- Controles : format, lint 29/29, typecheck 29/29, test 29/29 (107 connecteurs + 16 worker), build 17/17.

### 2026-07-26 (suite 5) - suivi dans /espace et dette B005

- Taches terminees et validees : section « Suivi des candidatures » dans /espace - bouton « Suivre cette candidature » sur chaque offre (instantanes CV/score/lettre), changement de statut avec note d'historique optionnelle, notes libres, historique date, suppression avec confirmation, offre retiree du flux signalee sans perdre le dossier. Ordre utilisateur du 2026-07-26.
- Dette B005 fermee : `OPENAI_API_KEY` retiree du `.env` local, API verifiee saine, revocation de la cle recommandee.
- Controles : format, lint 29/29, typecheck 29/29, test 29/29 (20 tests web), build 17/17.

### 2026-07-26 (suite 4) - socle du suivi des candidatures

- Taches terminees et validees : modeles `Application` (instantanes offre/CV/score/lettre) et `ApplicationEvent` (historique date), migration additive sans derive, routes gardees POST/GET/PATCH/DELETE `/api/applications`, `appliedAt` fixe une seule fois au passage a APPLIED. Ordre utilisateur du 2026-07-26.
- Preuve sur le reel : 401 sans cle ; dossier cree depuis l'offre demo avec les instantanes du vrai CV du proprietaire (nom de fichier, score 34) ; passage a APPLIED avec note et historique TO_APPLY > APPLIED ; 204 puis 404 a la suppression ; base laissee propre.
- Controles : format, lint 29/29, typecheck 29/29, test 29/29 (88 tests API), build 17/17.
- Brique suivante ordonnee : UI de suivi dans /espace.

### 2026-07-26 (suite 3) - candidature dans le navigateur

- Taches terminees et validees dans le navigateur par le proprietaire : section « Candidature » de /espace - offres publiees listees, score calcule et explique (criteres ponderes en francais, pastilles couvertes/manquantes, recommandations), lettre generee avec barre de progression estimee puis relisible en entier, PDF de lettre telechargeable, resultats stockes recharges a l'ouverture.
- Le parcours complet vit dans la page : importer, structurer, scorer, generer la lettre, exporter les PDF, supprimer.
- Controles : format, lint 29/29, typecheck 29/29, test 29/29 (19 tests web), build 17/17.
- Prochaine brique ordonnee : suivi des candidatures.

### 2026-07-26 (suite 2) - espace prive dans le navigateur

- Taches terminees et validees dans le navigateur par le proprietaire, avec son vrai CV : page `/espace` (porte a cle en sessionStorage, import de CV avec input style, structuration avec barre de progression estimee, faits affiches, export CV PDF, suppression, verrouillage), lien discret depuis l'accueil, page non indexable.
- Corrections payees sur le vrai CV : URLs acceptees sans protocole, dates lues jusqu'a 120 caracteres, `identity` requise dans le schema, prompt durci (technologies individuelles, noms de projets et titres conserves, liens jamais fabriques depuis un e-mail).
- Modele de CV v3 : bleu #1D4ED8, compact une page, liens cliquables, competences groupees par categorie.
- Regle typographique definitive du proprietaire : aucun tiret cadratin (U+2014) ni demi-cadratin (U+2013) nulle part - remplaces par « - » dans 70 fichiers ; seules exceptions les donnees externes a traiter (regex `location.ts`, entrees de tests).
- Controles : format, lint 29/29, typecheck 29/29, test 29/29, build 17/17.
- Reste pour l'UI privee : scores et lettres dans la page (brique UI 2/2).

### 2026-07-26 (suite) - lettre de motivation factuelle

- Taches terminees et validees : `SourceCoverLetter` (migration `20260726100000_source_cover_letter`, zero derive), modele de lettre dans `@findit/documents`, module `letters` (generation, relecture, PDF), garde-fou anti-invention partage avec le dictionnaire du score. Ordre utilisateur du 2026-07-26.
- Preuve sur le reel, Ollama `qwen2.5:7b` et PostgreSQL Docker, sans mock :
  - 409 avant structuration ; 401 sans cle ; 404 PDF sans lettre.
  - Lettre generee en 33 s : trois paragraphes, uniquement des faits du CV (BTS SIO, stage WebAgence, React/TypeScript/CSS/Git), `usedFacts` listes, un point fragile mis en warning au lieu d'etre brode.
  - PDF `lettre-<slug>.pdf` relu : expediteur, destinataire, date, objet, corps fideles.
  - Suppression du CV : 204, cascade constatee - 0 CV, 0 lettre, 0 score.
- Controles : format, lint 29/29, typecheck 29/29, test 29/29, build 17/17 ; timeout des tests de rendu PDF releve a 20 s (`vitest.config.ts` du paquet documents) apres un timeout sous charge parallele turbo.

### 2026-07-26 - modele de CV et rendu PDF

- Taches terminees et validees : paquet `@findit/documents` (modele de CV pre-conçu, rendu React-PDF pur Node, deterministe), route gardee `GET /api/resumes/:id/documents/cv.pdf`, durcissement extraction (`identity` requise dans le schema car la grammaire de decodage saute un objet optionnel ; prompt interdisant les « links » fabriques depuis un e-mail). Ordre utilisateur du 2026-07-26.
- Preuve sur le reel, Ollama `qwen2.5:7b` et PostgreSQL Docker, sans mock :
  - 409 a l'export d'un CV non structure, 401 sans cle.
  - CV structure par le vrai modele (nom et titre extraits apres le durcissement), PDF telecharge en `application/pdf`, nom `cv-lucas-bernard.pdf`, texte relu fidele aux faits.
  - Suppression du CV : 204, base a zero.
- Dette constatee, non corrigee : le modele invente parfois des jours precis (« 2025-01-01 » pour « 2025 ») ; a durcir dans une brique extraction dediee.
- Controles : format, lint 29/29, typecheck 29/29, test 29/29, build 17/17.

### 2026-07-25

- Taches validees : structuration JSON du CV source ; suppression et retention du CV source. Ordre utilisateur du 2026-07-25.
- Preuve sur le reel, API port 4000 et PostgreSQL Docker, sans mock :
  - `GET /api/resumes` sans cle : 401.
  - Upload TXT avec cle : `expiresAt` a +24 h de `createdAt`, conforme a `RESUME_RETENTION_HOURS=24`.
  - `DELETE /api/resumes/:id` : 204, puis `GET` et `DELETE` rejoues : 404.
  - Expiration forcee en SQL puis passage sur la liste : 0 CV renvoye, 0 ligne `SourceResume` en base - purge physique constatee.
  - Nettoyage : API de test arretee, port 4000 libere, base laissee sans CV de test.
- Prochaine etape ordonnee : score de correspondance offre / profil, sans IA, explicable.

### 2026-07-25 (suite) - score de correspondance

- Taches terminees et validees : moteur `@findit/matching-engine`, modele `SourceResumeMatch` (migration `20260725050000_source_resume_match`, zero derive constatee par `prisma migrate diff`), routes gardees de matching, correctif `@findit/ai` sur le schema envoye a Ollama. Ordre utilisateur du 2026-07-25.
- Preuve sur le reel, Ollama `qwen2.5:7b` et PostgreSQL Docker, sans mock :
  - CV realiste televerse puis structure par le vrai modele en 37 s, 9 competences extraites, rien d'invente.
  - `POST /api/resumes/:id/matches/:slug` : 93/100 contre l'offre front-end demo (exigees 100 %), 36/100 contre la back-end avec manques listes (SQL exigee ; PostgreSQL, API REST souhaitees).
  - Liste triee meilleur d'abord ; 401 sans cle ; 409 CV non structure ; 404 offre inconnue.
  - Suppression du CV : cascade constatee, 0 CV et 0 score en base.
- Bug reel corrige : llama.cpp repondait 400 « failed to parse grammar » aux regex a lookahead (e-mail Zod) et aux bornes `minLength`/`maxLength` ; sans ce correctif la structuration n'avait jamais fonctionne contre le serveur reel. Les mots-cles sont retires du schema envoye, la revalidation Zod garde tout.
- Controles : format, lint 27/27, typecheck 27/27, test 27/27, build 16/16.

### 2026-07-24

- Taches commencees : audit initial complet, realignement de `roadmap.md`, structuration JSON du CV source.
- Taches terminees : inventaire, lecture `HANDOFF.md`, verification Git, inspection stack, routes, base, worker, IA, securite, docs et implementation CV JSON locale.
- Taches validees : restauration de la baseline format ; realignement de `README.md` et `docs/architecture.md`.
- Taches mises en validation : structuration JSON du CV source.
- Tests executes :
  - `git status --short --branch` : propre sur `main` avant modifications.
  - `git log -n 10 --oneline` : dernier commit `b418bfc docs: realign the roadmap with what the code actually does`.
  - `pnpm infra:up` : PostgreSQL et Redis demarres.
  - `docker compose ps` : `postgres` et `redis` healthy.
  - `pnpm db:migrate` : 8 migrations, aucune en attente.
  - `pnpm registry:sync` : 13 sources synchronisees.
  - `pnpm format:check` : echec sur `packages/ai/src/ollama-client.test.ts`.
  - `pnpm typecheck` : 24/24 taches OK.
  - `pnpm lint` : 24/24 taches OK.
  - `pnpm test` : 24/24 taches OK.
  - `pnpm build` : 15/15 taches OK.
  - `pnpm exec turbo run build --force` : 15/15 taches OK, sans cache.
  - `pnpm exec turbo run typecheck --force` : 24/24 taches OK, sans cache, apres build.
  - `pnpm exec turbo run lint --force` : 24/24 taches OK, sans cache.
  - `pnpm exec turbo run test --force` : 24/24 taches OK, sans cache.
  - `pnpm format:check` apres correction : OK.
  - `pnpm --filter @findit/ai test` apres correction : 1 fichier, 6 tests OK.
  - `README.md` et `docs/architecture.md` realignes avec l'etat reel audite.
  - `pnpm exec prettier --write README.md docs/architecture.md roadmap.md` : OK.
  - `pnpm format:check` apres correction documentaire : OK.
  - `git diff --check` apres correction documentaire : OK.
  - `pnpm --filter @findit/api exec vitest run src/resume/structured-resume.test.ts` avant implementation : echec attendu, module absent.
  - `pnpm --filter @findit/api exec vitest run src/resume/structured-resume.test.ts` apres schema : 1 fichier, 2 tests OK.
  - `pnpm --filter @findit/api exec vitest run src/resume/resume.service.test.ts` avant implementation : echec attendu, `service.structure` absent.
  - `pnpm --filter @findit/api exec vitest run src/resume/resume.service.test.ts` apres service : 1 fichier, 3 tests OK.
  - `pnpm --filter @findit/api exec vitest run src/resume/resume.controller.test.ts` avant implementation : echec attendu, `controller.structure` absent.
  - `pnpm --filter @findit/api exec vitest run src/resume/resume.controller.test.ts` apres route : 1 fichier, 5 tests OK.
  - `pnpm db:generate` apres schema `SourceResume` : client Prisma regenere.
  - `pnpm db:migrate` apres migration `20260724190000_source_resume_structure` : migration appliquee.
  - `pnpm --filter @findit/database build` : OK.
  - `pnpm --filter @findit/database typecheck` : OK.
  - `pnpm --filter @findit/api lint` apres correction : OK.
  - `pnpm --filter @findit/api typecheck` apres correction : OK.
  - `pnpm --filter @findit/api test` apres correction : 7 fichiers, 37 tests OK.
  - `pnpm --filter @findit/database prisma:validate` : schema valide.
  - `pnpm format:check` apres structuration CV : OK.
  - `pnpm lint` apres structuration CV : 25/25 taches OK.
  - `pnpm typecheck` apres structuration CV : 25/25 taches OK.
  - `pnpm test` apres structuration CV : 25/25 taches OK.
  - `pnpm build` apres structuration CV : 15/15 taches OK.
  - Scan GitGuardian sur fichiers suivis sensibles (`.env.example`, hook, schema env) : 0 policy break.
- Problemes rencontres :
  - Smoke runtime via `Start-Process` bloque par la politique locale avant demarrage.
  - `pnpm exec turbo run typecheck lint test build --force` lance build et typecheck web en parallele ; le typecheck peut lire `.next/types` pendant que Next les regenere. En execution separee, build puis typecheck passent.
- Prochaine etape recommandee : apres validation utilisateur de la structuration CV, ajouter suppression et retention effective du CV source.

## 14. Criteres de fin du projet

- [ ] Installation depuis un environnement vierge documentee et verifiee.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` et `pnpm build` passent.
- [ ] Migrations et seed de demonstration fonctionnent sans detruire de donnees reelles.
- [ ] Aucun secret n'est present dans les fichiers suivis ni dans l'historique public connu.
- [ ] Sources d'offres reelles collectees uniquement depuis acces autorises.
- [ ] Doublons geres et conserves avec preuves.
- [ ] Interface publique responsive et accessible.
- [ ] Espace prive protege.
- [ ] Profil candidat complet.
- [ ] CV importable, structurable, supprimable et soumis a retention.
- [ ] Score CV/offre explicable et teste.
- [ ] Projets GitHub analysables avec preuves.
- [ ] CV, lettre et messages generes sans invention.
- [ ] Candidatures suivies avec historique et rappels.
- [ ] Notifications utiles et non bruyantes.
- [ ] Donnees personnelles minimises, exportables/supprimables selon decision juridique.
- [ ] Production deployable avec HTTPS, sauvegardes, monitoring, alertes et rollback.
- [ ] Documentation finale conforme a l'etat reel du code.
