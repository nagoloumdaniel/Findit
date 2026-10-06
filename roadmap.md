# Roadmap Findit

## 1. Informations generales

| Champ                 | Valeur                                                                                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nom du projet         | Findit                                                                                                                                                                                                            |
| Objectif              | Meilleur outil de scraping d'offres d'alternance et de stage developpeur en Ile-de-France (sites carrieres tech, job boards, ATS), puis aider le proprietaire a analyser son CV, ses projets et ses candidatures. |
| Source de verite      | `roadmap.md`, alignee avec `HANDOFF.md` le 2026-10-06                                                                                                                                                             |
| Branche analysee      | `main`                                                                                                                                                                                                            |
| Commit analyse        | voir `git log -1` sur `main`                                                                                                                                                                                      |
| Date du dernier audit | 2026-10-06                                                                                                                                                                                                        |
| Environnement teste   | Windows, PowerShell, Node `v24.10.0` sur la machine alors que le depot exige `>= 24.18 < 25`, pnpm `11.13.1`, base PostgreSQL en ligne (Neon, TLS), Redis Docker                                                  |
| Statut global         | Socle public et extension privee fonctionnels ; chantier de scraping livre et en attente de validation du proprietaire                                                                                            |
| Progression estimee   | non reevaluee depuis l'audit du 2026-07-24, qui annoncait 45 % ; estimation d'audit, jamais une mesure contractuelle                                                                                              |

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
- Telegram : alertes et commandes bot (`/start`, `/status`, `/latest`, `/help`) implementees ; actives seulement quand token et chat sont configures hors simulation.
- Documentation : `HANDOFF.md`, cette roadmap, `README.md` et `docs/architecture.md` sont realignes.

### Ce qui est simule ou mocke

- Le jeu de donnees local audite contient uniquement des offres de demonstration.
- Les tests utilisent des doubles de `fetch`, de Prisma ou de BullMQ selon le module ; ces doubles sont acceptables car limites aux tests.
- Telegram est en simulation par defaut tant que `TELEGRAM_NOTIFICATIONS_ENABLED`, `TELEGRAM_DRY_RUN`, le token et le chat ne sont pas regles pour un envoi reel.

### Ce qui est casse

- Aucun echec applicatif bloquant n'est confirme par les controles automatises lances separement.
- Un smoke test runtime manuel via `Start-Process` a ete bloque par la politique locale d'execution ; il n'a pas demarre les serveurs et ne prouve pas un defaut applicatif.

### Ce qui manque

- Base de donnees en ligne : FAIT (Neon, TLS obligatoire), migrations appliquees ; le role applicatif n'est pas proprietaire du schema.
- Hebergement public du web, de l'API et du worker (TASK-207).
- Reste du moteur de scraping (phases 22 a 24) : le moteur Apify, la garde de budget, la deduplication inter-sources et un premier job board sont livres mais en attente de validation ; aucun connecteur de job board n'est monte dans le cycle, et ScrapeGraphAI et le rendu Playwright ne sont pas encore integres.
- Refonte de la disposition du site : navigation a plusieurs espaces, badge de source, page Mon CV, page Sources (phase 25).
- Conservation chiffree et versionnee du binaire original du CV.
- Messages recruteurs et export DOCX (CV et lettre s'exportent deja en PDF).
- Analyse GitHub et selection de projets.
- Rappels et statistiques personnelles de candidature (le suivi avec statuts et historique est fait).
- Recherche web en production complete, avec politique de non-stockage des resultats Brave maintenue.
- Administration, observabilite, monitoring, sauvegardes ; CI ecrite mais bloquee par le compte GitHub (Actions desactivees pour l'utilisateur).

### Risques principaux

- Risque documentaire residuel : maintenir `HANDOFF.md`, `roadmap.md`, `README.md` et `docs/architecture.md` alignes a chaque brique.
- Risque fonctionnel : ferme le 2026-07-26 - Workable est raccorde au cycle et prouve sur le reseau reel.
- Risque donnees personnelles : le CV source se supprime et expire desormais, mais le binaire original n'est ni conserve chiffre ni versionne.
- Risque securite locale : ferme le 2026-07-26 - la variable obsolete `OPENAI_API_KEY` a ete retiree du `.env` local ; revoquer la cle chez OpenAI si elle etait reelle.
- Historique Git : un incident Brave a existe et est documente comme traite ; ne jamais remettre de valeur reelle dans `.env.example`.
- Conformite du scraping elargi (2026-10-05) : le proprietaire a tranche - LinkedIn, Welcome to the Jungle, HelloWork, Glassdoor, Indeed et autres job boards sont collectes (Q-4 tranchee, C-1 levee, phase 21). Les conditions d'utilisation de ces plateformes interdisent la collecte automatisee : risque civil assume (blocage d'IP, d'acces, de compte), a ecrire au registre (TASK-301). Garde-fous gardes : pas de compte, pas de cookie, pas de CAPTCHA contourne, URL d'origine obligatoire, budget plafonne.
- Publication d'offres de job boards sur un site public (2026-10-05) : republier du contenu tiers expose plus que le simple usage personnel. Proposition : extrait court et lien d'origine en public, description complete reservee au matching prive (TASK-301, a confirmer).
- Contrat Apify (2026-10-06) : la clause 11.1 des conditions generales impose d'indemniser Apify en cas d'extraction depuis des sources non autorisees ; le compte Apify du proprietaire est expose (suspension, reclamation). Compte dedie, budget plafonne, decision du proprietaire a confirmer avant tout run sur un job board (TASK-302).
- Fragilite des acteurs Apify (2026-10-05) : acteurs tiers, mis a jour par des developpeurs independants ; un job board qui change son HTML casse l'acteur. Acteur de secours par source et surveillance des taux d'echec (TASK-303, TASK-601).
- Donnees privees en ligne : la regle « rien ne sort du poste » (decisions 2026-07-17 et 2026-07-24) doit etre reecrite avant toute ecriture de CV ou de profil sur une base distante (contradiction C-4).
- IA locale et site heberge : Ollama sur le poste ne sera pas joignable depuis un site en ligne (contradiction C-5).

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

| Module               | Frontend                    | Backend/API                               | Base de donnees      | Tests | Statut reel                                      | Priorite |
| -------------------- | --------------------------- | ----------------------------------------- | -------------------- | ----- | ------------------------------------------------ | -------- |
| Socle monorepo       | N/A                         | N/A                                       | N/A                  | Oui   | Fonctionnel                                      | P0       |
| Offres publiques     | Liste + detail              | `GET /api/jobs*`                          | `Job`, `Company`     | Oui   | Fonctionnel avec donnees DB                      | P0       |
| Collecteurs ATS      | N/A                         | Worker                                    | `Connector*`         | Oui   | Fonctionnel                                      | P1       |
| Normalisation        | N/A                         | Pipeline                                  | `ProcessingLog`      | Oui   | Fonctionnel                                      | P0       |
| Classification       | N/A                         | Pipeline                                  | Decisions partielles | Oui   | Fonctionnel                                      | P0       |
| Deduplication        | N/A                         | Branchee a l'ingestion                    | Tables ecrites       | Oui   | Fonctionnel                                      | P1       |
| Worker cron          | N/A                         | BullMQ worker                             | Runs/logs            | Oui   | Fonctionnel                                      | P0       |
| Telegram alertes     | N/A                         | Worker + package                          | Notification table   | Oui   | Fonctionnel, simulation par defaut               | P1       |
| Espace prive         | Page unique (proxy serveur) | Guard + profil                            | `CandidateProfile`   | Oui   | Fonctionnel                                      | P1       |
| CV source            | Page unique                 | Upload/liste/detail/structure/suppression | `SourceResume`       | Oui   | Fonctionnel, versions et binaire chiffre absents | P1       |
| IA locale            | Page unique                 | Package + route CV                        | Prompt tables        | Oui   | Fonctionnel, desactivee par defaut               | P1       |
| Matching CV/offre    | Page unique                 | Moteur + routes gardees                   | `SourceResumeMatch`  | Oui   | Fonctionnel                                      | P1       |
| GitHub               | Absent                      | Absent                                    | Absent               | Non   | Absent                                           | P2       |
| Generation documents | Page unique                 | PDF CV + lettre generee                   | `SourceCoverLetter`  | Oui   | Fonctionnel, DOCX absent                         | P1       |
| Suivi candidatures   | Page /candidatures          | CRUD + historique                         | `Application*`       | Oui   | Fonctionnel                                      | P1       |
| Admin                | Absent                      | Absent                                    | Partiel via logs     | Non   | Absent                                           | P3       |
| CI/CD                | N/A                         | Workflow ecrit                            | N/A                  | Non   | Ecrit, bloque par le compte GitHub               | P2       |

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
| POST    | `/api/resumes/:id/matches`           | `MatchingController`  | UUID                        | `WorkspaceGuard` | Fonctionnel, valide        |
| GET     | `/api/resumes/:id/matches`           | `MatchingController`  | UUID                        | `WorkspaceGuard` | Fonctionnel, valide        |
| GET     | `/api/resumes/:id/documents/cv.pdf`  | `DocumentsController` | UUID                        | `WorkspaceGuard` | Fonctionnel, valide        |
| POST    | `/api/resumes/:id/letters/:slug`     | `LettersController`   | UUID + slug strict          | `WorkspaceGuard` | Fonctionnel, valide        |
| GET     | `/api/resumes/:id/letters`           | `LettersController`   | UUID                        | `WorkspaceGuard` | Fonctionnel, valide        |
| GET     | `/api/resumes/:id/letters/:slug/pdf` | `LettersController`   | UUID + slug strict          | `WorkspaceGuard` | Fonctionnel, valide        |

Endpoints absents : authentification utilisateur complete, analyse GitHub, export DOCX, admin, webhook ou commandes Telegram en HTTP.

## 8. Etat de la base auditee

Compteurs releves le 2026-10-06 sur la base **en ligne** (Neon), par une lecture seule :

| Table               | Lignes | Lecture d'audit                                                |
| ------------------- | ------ | -------------------------------------------------------------- |
| `Connector`         | 6      | Registre apres retrait des sources en attente de permission    |
| `CompanySource`     | 84     | Annuaire et sources decouvertes                                |
| `ConnectorRun`      | 92     | Dernier run le 2026-10-05 a 23 h 13, SUCCEEDED                 |
| `Job`               | 3      | Toutes PUBLISHED, aucune demonstration, toutes dans la fenetre |
| `CandidateProfile`  | 0      | Aucun profil                                                   |
| `SourceResume`      | 0      | Aucun CV source                                                |
| `SourceCoverLetter` | 0      | Aucune lettre                                                  |
| `SourceResumeMatch` | 0      | Aucun score stocke                                             |
| `Application`       | 0      | Aucune candidature suivie                                      |

Constat a retenir : le moteur collecte et reussit (92 runs, tous en succes) mais ne
publie presque rien - **3 offres pour tout le site**. C'est le probleme a resoudre,
et c'est la raison d'etre du chantier de scraping. Les tables privees sont vides :
aucun profil, aucun CV, aucune lettre n'a encore quitte le poste, meme si l'API
pointe sur la base en ligne.

Releve precedent, sur la base PostgreSQL Docker locale, le 2026-07-24 :

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

### Phase 18 - Refonte UX v3 (recu le 2026-07-27, ordre du proprietaire - PRIORITAIRE)

Vision : une page principale unique, sans cle a saisir, ou la recherche se fait par texte OU par CV.

- [x] Proxy serveur Next : routes `/api/ws/*` qui relaient vers l'API avec `INTERNAL_API_KEY` cote serveur - le navigateur ne voit JAMAIS la cle, plus aucune saisie. La porte a cle disparait.
- [x] A cote de la barre de recherche : input d'upload de CV. Deux modes de recherche - par texte (comportement actuel) ou PAR CV (upload → structuration → matching de toutes les offres → liste triee par score).
- [x] Liste des offres en mode CV : chaque carte montre entreprise, intitule, SCORE, et les actions Recalculer le score / Generer la lettre / Lettre en PDF / Suivre cette candidature / Voir les details. Ces actions n'apparaissent QUE en mode CV.
- [x] Page detail d'offre : memes fonctions - si on est arrive par recherche texte, on peut y uploader le CV et matcher cette offre, avec score et toutes les actions.
- [x] Barre de navigation avec bouton vers une page dediee `/candidatures` (suivi des candidatures).
- [x] La section « Mon espace candidat » disparait en tant que bloc separe : tout est fondu dans la recherche d'offres.
- [ ] Ameliorations libres bienvenues (ordre du proprietaire).

### Phase 17 - Cahier des charges v2 (recu le 2026-07-27, ordre du proprietaire)

- [x] Charger la base d'entreprises reelles fournie par le proprietaire (400 lignes, 430 entreprises en base, pnpm db:import-companies)
  - Priorite : P1
  - Attente : la liste (≈400 entreprises + sites carrieres) doit etre fournie en texte/CSV - une image ne suffit pas pour recopier des URL sans risque d'invention.
  - Regle maintenue : seuls les sites sur Greenhouse/Lever/Workable ou dont robots.txt autorise FinditBot deviennent collectables ; les autres sont enregistres mais non collectes (registre de conformite).
- [x] Supprimer les donnees de demonstration une fois de vraies offres presentes (fait le 2026-07-27 : 6 offres isDemo et 2 entreprises demo supprimees, il ne reste que du reel ; le seed demeure un outil de dev manuel, aucun chemin de production ne l'appelle)
- [x] Cle privee memorisee : plus de saisie a chaque visite (localStorage, bouton Verrouiller pour l'oublier)
- [ ] Page unique avec bouton Filtres (dates, metiers, contrats, departements, presence) repliables
- [ ] Cartes d'offres : lien externe seul quand l'extraction a echoue, page detail quand elle a reussi
- [ ] « Faire matcher mon CV » : recherche des offres les plus compatibles depuis le CV, scoring affiche sur chaque carte, avec toutes les actions (structurer, CV, lettre, suivi)
- [ ] Matching a l'offre unique conserve, avec les memes actions
- [ ] Ameliorations de CV detaillees et poussees, exploitables hors application
- [x] Competences manquantes dans CV/lettres : AJUSTEMENT VALIDE puis livre (popup de tri : possedee / en cours d'acquisition / ne pas ajouter, notions a apprendre generees) - jamais presentees comme acquises ; ajoutees seulement marquees « en cours d'acquisition » dans le document, avec popup detaillant chaque ajout, sa raison face a l'offre et les notions a apprendre. Un document qui affirme une competence non possedee reste refuse (regle « rien d'invente »). A valider par le proprietaire.
- [x] Extraction : dates jamais plus precises que la source (« 2025 » reste « 2025 »)
- [x] Commandes Telegram (/start, /status, /latest, /help) - poller worker actif quand Telegram est configure hors simulation
- [!] CI GitHub Actions : workflow pousse et enregistre, mais GitHub repond « Actions has been disabled for this user » - a debloquer dans les reglages du compte GitHub (facturation/verification), rien a corriger cote depot
- [x] Documentation de deploiement vierge (docs/deployment.md)

### Phase 19 - Elargissement des sources (recu le 2026-07-26, ordre du proprietaire)

Vision : plus d'offres reelles sans attendre la seule saison Greenhouse/Lever/Workable.

- [x] Socle HTTP etendu : fetchJson accepte POST et en-tetes (identite FinditBot non contournable), fetchText pour lire robots.txt, 204 lu comme reponse vide
- [x] Connecteur France Travail (API officielle, OAuth partenaire) : recherche alternance (natureContrat E2,FS) x Ile-de-France (region 11) x fraicheur (publieeDepuis 3), employeur porte par chaque offre, libelle « 75 - PARIS 14 » ramene a la commune. Monte dans le cycle SEULEMENT si FRANCETRAVAIL_CLIENT_ID/SECRET existent - inscription gratuite sur francetravail.io a faire par le proprietaire, premiere collecte reelle a verifier alors
- [x] Connecteur Workday (flux CXS par locataire) : robots.txt du locataire relu AVANT CHAQUE collecte (ALLOWED exige, Crawl-delay intenable = refus), listes en POST, detail par offre fraiche (date absolue startDate, description, URL officielle). Preuve reelle 2026-07-26 : Thales refuse (Disallow), Workday collecte (Allow)
- [x] Decouverte web elargie : URLs myworkdayjobs.com reconnues (cible hote/site), requetes site: reordonnees pour que chaque cycle couvre TOUS les ATS autorises au lieu d'epuiser le premier
- [x] SuccessFactors verifie le 2026-07-26 et reste ferme : aucun flux public stable, verification par locataire requise - constat au registre
- [x] Premiere collecte reelle France Travail (2026-07-26, identifiants du proprietaire) : 2 offres fraiches d'alternance developpeur en Ile-de-France, ACCEPTEES et PUBLIEES en base - les deux premieres vraies offres du site. Ajustement constate : beaucoup d'offres FT n'ont pas d'employeur structure (depots anonymes/partenaires) - libelle « Inconnu » (mot choisi par le proprietaire), jamais un nom extrait de la prose ; limite officielle 10 req/s par cle, cadence gardee a 1 req/s
- [x] Cycle complet reel avec les nouvelles sources : 4 622 offres vues, 2 acceptees (les FT), 11 locataires Workday decouverts et enregistres par Brave (Banque de France, Chanel, Eiffage, Pernod Ricard, Pierre Fabre, Ipsen, Ardian, Dentsu, 3 ecoles Galileo)
- [x] Workday : libelles relatifs bilingues (meme flux : « Posted 30+ Days Ago » a curl, « Offre publiee il y a 30 jours ou plus » a Node - constate sur bdf.wd103) et plafond de fiches a 150 (Eiffage n'envoie aucun postedOn, ses 80 offres meritent toutes le detail). Contre-epreuve reelle : BDF 2 offres datees, Eiffage 80 offres datees
- [x] Donnees demo supprimees sur ordre du proprietaire (2026-07-27) : la base publique ne porte plus que de vraies offres
- [x] Fenetre par defaut passee a 3 jours et tri du plus recent au plus ancien (ordre du proprietaire, 2026-07-27) - corrige aussi la page detail qui disait « offre plus disponible » a une offre de 45 h (le defaut 24 h la masquait)
- [x] Scan des sites carrieres de l'annuaire (pnpm careers:scan) : robots.txt lu par domaine (ALLOWED exige), page lue une fois, liens Greenhouse/Lever/Workday extraits et rattaches a l'entreprise deja connue. Premier passage reel 2026-07-27 : 392 vises, 188 pages lues, 137 refus robots respectes, 67 injoignables, 26 sources collectables enregistrees (Accenture, Airbus, Canonical, Palantir, Mastercard, Valeo, Onepoint, MBDA, Aircall...). Rejouable a volonte, idempotent
- [!] LinkedIn (posts et emplois) : REFUS de conformite maintenu - les conditions LinkedIn interdisent la collecte automatisee, aucune API publique pour cet usage (registre, verifie 2026-07-17). La voie legale equivalente est en place : les offres LinkedIn pointent presque toujours vers l'ATS de l'entreprise, que Findit collecte a la source
- [x] « Google sites carrieres » : la voie legale est la recherche Brave (site: sur les ATS autorises, tous couverts a chaque cycle) + le scan direct des sites carrieres de l'annuaire - scraper Google directement est interdit par ses conditions, comme LinkedIn

### Phase 20 - Base de donnees en ligne (ordre du proprietaire, 2026-10-05)

Vision : la base n'est plus sur le poste. Cadrage : `CAHIER_DES_CHARGES.md`, F-016, Q-1, Q-3, Q-5, C-4.
Identifiants TASK-XXX : introduits le 2026-10-05 pour les nouvelles briques ; les phases precedentes gardent leur numerotation.

- [ ] TASK-201 - Trancher le perimetre des donnees en ligne (Q-1) et la conservation des candidatures (Q-8)
  - Priorite : P0
  - Complexite : XS
  - Dependances : aucune
  - Fichiers concernes : `CAHIER_DES_CHARGES.md` section 25, `docs/legal-compliance.md` (regle « rien ne sort du poste »)
  - Criteres d'acceptation :
    - Decision ecrite : offres publiques seules, ou offres et donnees privees.
    - Si le prive part en ligne : chiffrement en transit exige et regle reecrite dans `legal-compliance.md`.
  - Tests : aucun (decision)
  - Resultat :

- [ ] TASK-202 - Creer la base PostgreSQL en ligne
  - Priorite : P0
  - Complexite : S
  - Dependances : TASK-201, Q-3 tranchee (proposition : Neon)
  - Fichiers concernes : `.env.example` (nom de variable seulement), `docs/deployment.md`
  - Criteres d'acceptation :
    - Version PostgreSQL et pgvector confirmees ; TLS obligatoire.
    - Role applicatif dedie, sans droit de reinitialisation.
    - Aucun mot de passe dans le depot ni dans les journaux.
    - Sauvegardes du fournisseur, rétention notee.
  - Tests : connexion depuis le poste avec TLS ; refus sans TLS
  - Resultat :

- [ ] TASK-203 - Appliquer les migrations sur la base en ligne
  - Priorite : P0
  - Complexite : S
  - Dependances : TASK-202
  - Fichiers concernes : `packages/database/prisma/migrations/`, `packages/database/prisma/schema.prisma`
  - Criteres d'acceptation :
    - `prisma migrate deploy` passe sur base vide, sans reinitialisation.
    - Diff de schema vide ensuite.
  - Tests : `pnpm --filter @findit/database prisma:validate` ; diff de schema
  - Resultat :

- [ ] TASK-204 - Basculer `DATABASE_URL` par environnement et valider la configuration
  - Priorite : P0
  - Complexite : S
  - Dependances : TASK-203
  - Fichiers concernes : `packages/config/src/env.ts`, `packages/config/src/env.test.ts`, `packages/database/src/client.ts`
  - Criteres d'acceptation :
    - Une URL distante sans TLS fait echouer le demarrage avec un message sans secret.
    - La validation Zod existante reste la seule porte d'entree.
  - Tests : tests de configuration (cas valide, cas sans TLS, cas vide)
  - Resultat :

- [ ] TASK-205 - Transferer les donnees de reference vers la base en ligne
  - Priorite : P1
  - Complexite : S
  - Dependances : TASK-203
  - Fichiers concernes : `packages/database/import-companies.mjs`, `pnpm registry:sync`
  - Criteres d'acceptation :
    - Compteurs `Connector` (13) et `CompanySource` (30) identiques a l'audit du 2026-07-24, ou ecarts expliques.
    - Les donnees privees ne sont transferees que si TASK-201 le permet.
  - Tests : comptage avant/apres
  - Resultat :

- [ ] TASK-206 - Decider Redis (BullMQ) : gere ou local (Q-5)
  - Priorite : P1
  - Complexite : S
  - Dependances : TASK-207
  - Criteres d'acceptation :
    - Politique d'eviction compatible BullMQ verifiee dans la documentation du fournisseur.
    - Le verrou de concurrence du worker fonctionne sur la cible.
  - Tests : cycle worker reel contre la cible
  - Resultat :

- [ ] TASK-207 - Choisir l'hebergeur du worker, de l'API et du web (Q-6)
  - Priorite : P1
  - Complexite : M
  - Dependances : TASK-201
  - Criteres d'acceptation :
    - Un hote toujours allume pour le worker (cron de 4 h).
    - API et Redis non exposes publiquement ; web en HTTPS.
    - Ollama reste sur le poste, sauf decision Q-2 contraire.
  - Tests : smoke production (`GET /health`, une collecte)
  - Resultat :

- [ ] TASK-208 - Realigner la documentation sur la base en ligne et la fenetre de fraicheur
  - Priorite : P1
  - Complexite : S
  - Dependances : TASK-204, TASK-207
  - Fichiers concernes : `README.md` (fenetre 24 h, PostgreSQL local), `docs/architecture.md` (Workable, deduplication), `HANDOFF.md` (arret au 2026-07-27), `docs/deployment.md`, `CAHIER_DES_CHARGES.md` (Q-4, perimetre, synthese), et les tables perimees de cette roadmap
  - Criteres d'acceptation :
    - Aucune phrase ne dit « local seulement » si la base est en ligne.
    - La fenetre par defaut correspond a la decision Q-7.
  - Tests : `git diff --check`, `pnpm format:check`
  - Resultat : fait le 2026-10-06, validation du proprietaire attendue. `README.md`, `docs/architecture.md` et `HANDOFF.md` realignes sur le code reel : base en ligne (Neon, TLS), six entrees au registre, deduplication persistee, matching, lettres, PDF et suivi des candidatures, UX v3 sans `/espace`, fenetre de 3 jours. `CAHIER_DES_CHARGES.md` corrige sur Q-4 (tranchee), le hors-perimetre et la synthese. `docs/deployment.md` corrige sur l'URL de clone, la commande de l'annuaire, la base en ligne et le role proprietaire des migrations. Baseline `format:check` reparee : le `README.md` reecrit le 2026-10-02 n'etait pas formate, ce qui bloquait aussi le hook de pre-push. Route `POST /api/resumes/:id/matches` ajoutee a la table du paragraphe 7. Bugs B007 et B008 marques corriges, B006 marque bloque hors depot. Aucune case de cette roadmap n'a ete cochee. Deux points signales au proprietaire : la case « commandes Telegram » de la phase 11 reste decochee alors que la phase 17 les marque livrees et que `apps/worker/src/telegram/` les contient, et `DATABASE_URL_OWNER` est absent de `.env.example`.

### Phase 21 - Moteur de scraping multi-sources (ordre du proprietaire, 2026-10-05 - PRIORITAIRE, remplace le cadrage Apify borne)

Vision : Findit devient un veritable outil de scraping d'offres. Trois familles de sources : (1) sites carrieres des entreprises tech, (2) job boards (LinkedIn, Welcome to the Jungle, HelloWork, Glassdoor, Indeed et autres), (3) ATS et API officielles deja en place. Les outils : Apify (acteurs du Store, cloud), ScrapeGraphAI (installe sur le poste, extraction par IA locale), Playwright (rendu JavaScript), connecteurs natifs existants. Le CV, le matching, les lettres et le suivi des candidatures ne bougent pas : ils se nourrissent d'un flux d'offres beaucoup plus large.

**Decision du proprietaire, 2026-10-05 (annule Q-4, C-1 et le refus de conformite du 2026-07-17 pour ces sites)** : LinkedIn, Welcome to the Jungle, HelloWork, Glassdoor, Indeed et les autres job boards sont collectes. Le risque est assume par le proprietaire et doit etre ecrit dans `docs/legal-compliance.md` (TASK-301) : les conditions d'utilisation de ces plateformes interdisent la collecte automatisee ; la consequence realiste est civile (blocage d'IP, d'acces ou de compte), pas penale, mais elle existe. Le registre reste la porte d'entree : un connecteur sans ligne datee ne tourne pas.

Garde-fous conserves (non negociables, proposes par l'assistant) :

- Aucun compte, aucun login, aucun cookie : seules les pages publiques sont lues. Un acteur qui exige un compte LinkedIn ou Glassdoor est ecarte.
- Aucun CAPTCHA contourne, aucune furtivite dans le code Findit : `undetected-playwright` (installe) n'est pas utilise.
- Acteurs Apify annoncant un contournement d'anti-bot (« bypasses », « survives the anti-bot wall », « stealth ») ecartes. Les proxys propres a un acteur sont hors de notre code : ils sont notes dans le registre comme risque, pas ignores.
- Chaque offre garde son URL d'origine ; une offre sans URL d'origine est rejetee (regle « rien d'invente »).
- Cadence et volume bornes par source ; budget Apify plafonne par cycle et par mois ; interrupteur par source.
- Affichage public des offres de job boards : titre, entreprise, lieu, date, extrait court et lien vers l'origine. Description complete conservee pour le matching prive. [PROPOSITION, a confirmer]

Architecture cible :

```text
Cycle worker
    |
    +--> Registre Connector (statut, cadence, budget, interrupteur)
    |
    +--> ScrapeProvider (interface commune, sortie = RawJob)
          +--> Natif        : Greenhouse, Lever, Workable, Workday, France Travail
          +--> Apify        : job boards et sites difficiles (acteurs epingles)
          +--> ScrapeGraphAI: sites carrieres sans ATS reconnu (service local, Ollama)
    |
    +--> Normalisation / classification / deduplication inter-sources / ingestion
```

Ordre d'execution recommande : TASK-301 a 303, puis 305 avant 304 (le plafond avant le premier run), 306 sur Welcome to the Jungle puis HelloWork (pages publiques, sans compte), 307, puis phase 22. La phase 25 (disposition du site) peut avancer en parallele cote conception.

- [~] TASK-301 - Enregistrer la decision et rouvrir le registre de conformite
  - Priorite : P0
  - Complexite : S
  - Dependances : aucune
  - Fichiers concernes : `docs/legal-compliance.md` (section LinkedIn/Indeed/Glassdoor/WTTJ, regles absolues, statuts), `packages/database/prisma/schema.prisma` (statut additif `OWNER_ACCEPTED_SCRAPING`), `packages/job-connectors/src/registry.ts`, `CAHIER_DES_CHARGES.md` (Q-4, C-1, C-2, RM-010 a RM-013)
  - Criteres d'acceptation :
    - Decision, date, auteur et risque ecrits ; les regles absolues reecrites en gardant les garde-fous ci-dessus.
    - Nouveau statut d'acces distinct de `PUBLIC_FEED` : un acces tolere n'est jamais presente comme autorise.
    - Le garde-fou structurel accepte ce statut et refuse toujours `PROHIBITED` et `DISABLED_PENDING_PERMISSION`.
  - Tests : tests registre et garde-fou ; migration additive sans derive
  - Resultat : fait le 2026-10-05, validation du proprietaire attendue. Regime `OWNER_ACCEPTED_SCRAPING` ajoute (migration additive `20261005100000_owner_accepted_scraping`, appliquee sur la base Neon en ligne), accepte par `decideCollectionAccess` ; `PROHIBITED`, `DISABLED_PENDING_PERMISSION`, `SEARCH_ENGINE_DISCOVERY_ONLY` et `MANUAL_IMPORT` restent refuses, delai de 90 jours inchange (3 tests ajoutes). `docs/legal-compliance.md` (statut, regles absolues, decision datee) et `CAHIER_DES_CHARGES.md` (C-1, RM-010, RM-011) reecrits. Aucun job board n'est encore ouvert : chaque site passera au nouveau regime dans sa propre brique (phase 22). Incident corrige : le role applicatif `findit_app` n'est pas proprietaire de l'enum, donc `migrate deploy` a laisse une ligne d'historique echouee ; valeur ajoutee en tant que proprietaire (`neondb_owner`, via l'outil Neon), puis `migrate resolve` (rolled-back puis applied) ; `migrate deploy` ensuite : aucune migration en attente.

- [~] TASK-302 - Lire et dater les conditions d'Apify et de chaque acteur retenu
  - Priorite : P0
  - Complexite : S
  - Dependances : TASK-301
  - Fichiers concernes : `docs/legal-compliance.md` (section « Apify », datee)
  - Criteres d'acceptation :
    - Conditions d'Apify lues et datees ; fiche de chaque acteur lue et datee.
    - Une ligne par acteur : identifiant epingle, version, statut, date, proxys, exigence de compte.
  - Tests : aucun (revue)
  - Resultat : fait le 2026-10-06, validation du proprietaire attendue. Conditions generales d'Apify (en vigueur le 2026-07-09) et politique d'utilisation acceptable (2026-02-20) lues, 10 fiches d'acteurs lues par `fetch-actor-details`, section datee dans `docs/legal-compliance.md` (statut, date de modification, declarations par acteur). Constat a traiter : la clause 11.1 d'Apify impose d'indemniser Apify si le service extrait des donnees de sources non autorisees, donc le risque des job boards porte aussi sur le compte Apify du proprietaire (suspension, indemnisation), pas seulement sur Findit ; compte dedie recommande. Ecartes : `memo23/*` (contournement de l'anti-bot annonce) et `stealth_mode/*`. Reserves : `shahidirfan/Jungle-Job-Scraper` (rotation de jetons), `shahidirfan/HelloWork-Jobs-Scraper` ("stealthy", proxy optionnel), `valig/indeed-jobs-scraper` (proxys cites). Aucun acteur lance : les fiches sont des declarations, le run reel borne (TASK-306) tranche.

- [~] TASK-303 - Selectionner les acteurs par source
  - Priorite : P1
  - Complexite : S
  - Dependances : TASK-302
  - Notes : recherche reelle `search-actors` le 2026-10-05, aucun acteur lance. Candidats (statistiques du Store a la date, a revalider par `fetch-actor-details`) :
    - Welcome to the Jungle : `bebity/welcome-to-the-jungle-jobs-scraper` (filtres `postedWithinDays`, `city`, `contractType`, `maxItems`, environ 0,0003 $ l'offre), `shahidirfan/Jungle-Job-Scraper` (note 4,64), `logiover/welcome-to-the-jungle-jobs-scraper` (annonce « sans login »).
    - HelloWork : `shahidirfan/HelloWork-Jobs-Scraper` (note 5/5 sur 8 avis), `solidcode/hellowork-scraper` (`datePosted`, `contractType`, 0,95 $ les 1 000), `blackfalcondata/hellowork-scraper` (mode incremental).
    - LinkedIn : `curious_coder/linkedin-jobs-scraper` (167 000 utilisateurs, 4,59), `cheap_scraper/linkedin-job-scraper` (dedoublonnage integre), `bebity/linkedin-jobs-scraper`. A verifier avant tout : l'acteur doit fonctionner sans compte.
    - Glassdoor : `valig/glassdoor-jobs-scraper` (0,4 $ les 1 000, filtre `daysOld`), `cheap_scraper/glassdoor-jobs-scraper-remove-duplicate-jobs`. `memo23/*` annonce de contourner l'anti-bot : ecarte par critere.
    - Indeed : `valig/indeed-jobs-scraper` (`datePosted`, 0,1 $ les 1 000), `curious_coder/indeed-scraper`, `kaix/indeed-scraper`.
  - Criteres d'acceptation :
    - Pour chaque acteur : schema d'entree lu, absence de compte exigee, proxys et annonces d'anti-bot notes, cout par evenement, date de derniere mise a jour, un acteur de secours par source.
    - Choix epingle par identifiant dans le registre.
  - Tests : `fetch-actor-details` sur chaque acteur retenu
  - Resultat : fait le 2026-10-06, validation du proprietaire attendue. Un acteur et un secours par source, epingles dans `docs/legal-compliance.md` (section « Choix retenus ») avec l'entree prevue, les ecarts de filtre (LinkedIn n'a pas de fenetre de 3 jours, refiltree a l'ingestion), la correspondance champ par champ vers `RawJob` lue sur les schemas de sortie reels, et le cout. Retenus : `bebity/welcome-to-the-jungle-jobs-scraper`, `solidcode/hellowork-scraper`, `curious_coder/linkedin-jobs-scraper`, `valig/glassdoor-jobs-scraper`, `curious_coder/indeed-scraper`. Constats : (1) `RawJob` n'a pas de champ de lien de candidature, a ajouter (optionnel) en TASK-304 pour la fusion de TASK-307 ; (2) Glassdoor ne donne qu'un age en jours, la date ne sera jamais plus precise ; (3) HelloWork peut renvoyer un employeur nul (regle « Inconnu ») ; (4) cout d'environ 0,43 $ par cycle des cinq sources a 100 resultats, soit environ 77 $ par mois a la cadence de 4 h contre environ 13 $ a une collecte par jour : les job boards passent a une fois par jour (TASK-602). Aucun acteur lance. Compte Apify dedie et risque de la clause 11.1 confirmes par le proprietaire le 2026-10-06.

- [~] TASK-305 - Plafond de depense par cycle et par mois
  - Priorite : P1
  - Complexite : S
  - Dependances : aucune
  - Fichiers concernes : `packages/config/src/env.ts`, `packages/job-connectors`, `apps/worker/src/collection/`
  - Criteres d'acceptation :
    - Budget maximal par cycle et par mois configurable ; depassement = arret de la source, les autres continuent.
    - Cout de chaque run consigne dans `ConnectorRun`.
    - `maxItems` impose a chaque appel d'acteur.
  - Tests : test worker avec budget fictif (nomme comme tel)
  - Resultat : fait le 2026-10-06, validation du proprietaire attendue. Plan Apify reel : gratuit, 5 $ de credit par mois (confirme par le proprietaire) ; defauts `SCRAPING_BUDGET_MONTHLY_USD=4.5` (5 $ moins 10 % de marge) et `SCRAPING_BUDGET_CYCLE_USD=0.15` (30 cycles quotidiens sous 4,5 $), modifiables sans toucher au code. `packages/job-connectors/src/spend-budget.ts` : montants en micro-dollars entiers, cout maximal d'un run (demarrage + resultats + details), refus d'un appel sans plafond de resultats valide (`UnboundedRunError`), billet de reservation par run, refus `CYCLE_BUDGET_EXCEEDED` ou `MONTH_BUDGET_EXCEEDED` qui arrete la source sans arreter le cycle ; `spend-ledger.ts` relit le cumul du mois dans `ConnectorRun`, donc un redemarrage du worker ne le remet pas a zero ; `ConnectorRun.costMicroUsd` (migration additive `20261006090000_connector_run_cost`) et `recordCost` dans le journal de runs. 14 tests de budget + 2 tests de configuration. Prouve sur la base Neon reelle : cout de 4,46 $ ecrit puis relu (cumul 4 460 000), run estime a 0,02 $ autorise, run estime a 0,10 $ refuse en `MONTH_BUDGET_EXCEEDED`, base nettoyee (cumul revenu a 0). La garde est depuis cablee dans les deux cycles via `createCycleDeps` (TASK-304) ; elle n'est sollicitee que si un connecteur payant tourne, ce qui suppose `SCRAPED_SOURCES_ENABLED=true`. Incident repete : `findit_app` ne peut pas modifier le schema, colonne ajoutee par le proprietaire de la base via l'outil Neon puis `migrate resolve --applied` ; a trancher en phase 20 (URL proprietaire pour les migrations).

- [~] TASK-304 - Abstraction `ScrapeProvider` et connecteur Apify generique
  - Priorite : P1
  - Complexite : L
  - Dependances : TASK-303, TASK-305
  - Fichiers concernes : `packages/job-connectors/src/` (interface + fournisseur Apify), `packages/job-connectors/src/registry.ts`, `apps/worker/src/collection/cycle-deps.ts`, `packages/config/src/env.ts` (`APIFY_API_TOKEN`)
  - Criteres d'acceptation :
    - Interface commune dont la sortie est `RawJob` ; les connecteurs natifs existants ne changent pas.
    - `RawJob` recoit un champ optionnel de lien de candidature (additif) : les connecteurs natifs ne le renseignent pas, les acteurs qui le donnent le remplissent.
    - Token lu cote serveur, jamais journalise ; entree par acteur validee par Zod ; sortie d'acteur revalidee par Zod avant ingestion (une sortie hors schema = erreur explicite, pas une valeur fabriquee).
    - Une table de correspondance par acteur vers `RawJob` (employeur, lieu, date, URL d'origine, contrat).
    - Acteur indisponible, run en echec, budget depasse : la source s'arrete, le cycle continue.
    - Chaque run passe par la garde de TASK-305 : `assertBoundedMaxItems`, cout maximal estime, `authorize` avant l'appel, `recordCost` puis `settle` apres ; sources executees de la moins couteuse a la plus couteuse pour que le plafond du cycle sacrifie la plus chere.
    - Plafonds de resultats du plan gratuit (WTTJ 30, HelloWork 40, LinkedIn 20, Glassdoor 60, Indeed 100), lus en configuration.
  - Tests : doubles de l'API Apify (nommes comme tels) ; cas budget, acteur absent, token absent, sortie invalide
  - Resultat : fait le 2026-10-06, validation du proprietaire attendue. `createApifyConnector` (`packages/job-connectors/src/apify.ts`) : un acteur epingle, entree construite et bornee, plafond de resultats exige a la construction, depart du run avec `maxTotalChargeUsd` egal au pire cout estime (coupure cote Apify, a constater au premier run reel), sondage cadence a 2 s avec abandon et arret du run apres 150 sondages, jeu de donnees lu avec `limit`, jeton dans l'en-tete `Authorization` seulement (jamais dans une URL, aucun test ne le retrouve dans les requetes). Cout reel calcule depuis `chargedEventCounts` et `usageTotalUsd` (le plus eleve des deux) ; evenement sans prix connu ou cout non rendu = pire cas retenu et signale ; un run raye garde sa facture. Elements illisibles ecartes avec une notice `ItemsDropped` consignee, tous illisibles = erreur explicite. Contrat des connecteurs etendu, sans toucher aux connecteurs natifs : `estimateCostMicroUsd` optionnel (sa presence rend la garde de budget obligatoire), `reportCostMicroUsd` et `reportNotice` dans le contexte, `RawJob.applyUrl` optionnel. `runRecordedConnector` : autorisation de budget AVANT d'ouvrir le run (refus = erreur consignee, pas de run, cycle poursuivi), cout consigne dans `ConnectorRun.costMicroUsd` puis billet clos, `runConnector` refuse un connecteur payant sans autorisation. Nouveau type d'ATS `JOB_BOARD` (migration additive `20261006100000_job_board_ats`, appliquee sur Neon). Budget cable dans `createCycleDeps` ; `APIFY_API_TOKEN` et `SCRAPEGRAPH_API_KEY` ajoutes a la configuration du worker (facultatifs). 17 tests (faux serveur Apify nomme comme tel) : cas nominal, sans garde, budget du mois epuise, acteur en echec, run sans fin, elements illisibles, prix inconnu, cout non declare, `runConnector` sans autorisation. Controles : format, typecheck 30/30, lint 30/30, test 30/30, build 17/17. Aucun acteur reel lance et aucun connecteur monte dans le cycle : la table de correspondance de chaque site est ecrite dans sa brique (phase 22), le premier run reel est TASK-306.

- [~] TASK-306 - Preuve reelle bornee, une source a la fois
  - Priorite : P1
  - Complexite : S
  - Dependances : TASK-304, TASK-305
  - Criteres d'acceptation :
    - Un run reel (Welcome to the Jungle d'abord, puis HelloWork), 20 offres au plus.
    - Offres en base avec leur URL d'origine, zero echec, cout constate, donnees de test nettoyees.
  - Tests : cycle reel borne ; constat en base
  - Resultat : fait le 2026-10-06 sur le vrai reseau, validation du proprietaire attendue. Compte Apify dedie, plan FREE (5 $ par mois, plafond de 5 $ aussi applique par Apify). Run 1 (20 offres, `pnpm board:proof -- --max-items 20`) : 20 vues, 7 creees en base (6 publiees + 1 doublon fusionne par la deduplication), 13 rejetees au tri, zero echec, 5 requetes, cout 0,01605 $ egal au pire cas, URL d'origine presente sur chaque offre, base revenue exactement a son etat d'avant apres nettoyage (compteurs identiques). Constats reels : (1) les evenements facturables s'appellent `job` (0,0003 $), `job-details` (0,0005 $), `apify-actor-start` (0,00005 $), `article` et `organization` (0,0004 $), table de prix du connecteur renseignee ; (2) `maxTotalChargeUsd` est bien applique par Apify (option du run = 0,01605, posee par notre appel) ; (3) un run de 20 offres dure environ 6 s ; (4) BUG TROUVE ET CORRIGE PAR CE RUN : les compteurs d'evenements facturables ne sont pas a jour quand le statut devient terminal - le run 2 (5 offres) a consigne 0,00005 $ pour 0,00405 $ factures ; correction : relecture finale du run apres le statut terminal plus un plancher calcule depuis les offres recues (jamais moins que leur cout au tarif de la fiche), 2 tests de non-regression, ligne du registre corrigee de 50 a 4 050 micro-dollars ; run 3 de verification : 5 offres, cout consigne 0,00405 $ = facture Apify ; (5) cumul du mois consigne 0,02415 $, l'usage affiche par Apify est legerement superieur (environ 0,4 %, transfert de donnees) : la marge de 10 % sous le plafond couvre l'ecart ; (6) rendement faible de la requete : 7 acceptees sur 20 puis 0 sur 5 - la recherche « developpeur » ramene des metiers non techniques que l'on paie avant de les rejeter (voir TASK-401) ; (7) bug de classification B009 releve sur des offres reelles. Aucun connecteur de job board n'est monte dans le cycle.

- [~] TASK-307 - Deduplication inter-sources et lien de candidature canonique
  - Priorite : P1
  - Complexite : M
  - Dependances : TASK-306
  - Fichiers concernes : `packages/job-deduplication`, `packages/job-pipeline/src/persist.ts`
  - Criteres d'acceptation :
    - La meme offre vue sur LinkedIn, Indeed et l'ATS de l'entreprise donne une seule offre publiee ; la source native ou officielle est la canonique.
    - Le lien de candidature pointe vers l'ATS de l'entreprise quand il est connu.
    - Les sources secondaires restent tracees (ou l'offre a-t-elle ete vue, quand).
  - Tests : cas de fusion multi-sources ; preuve sur PostgreSQL reel
  - Resultat : fait le 2026-10-06, validation du proprietaire attendue. (1) Election de la canonique par rang de source (`SOURCE_PRIORITY_OFFICIAL` 100, `SOURCE_PRIORITY_JOB_BOARD` 40, `packages/job-connectors/src/source-priority.ts`) : a la fusion, l'offre de rang le plus eleve reste publiee ; une offre vue d'abord sur un job board cede sa place a l'ATS de l'entreprise (masquee en DUPLICATE, jamais supprimee, avec une trace `ProcessingLog`) ; a rang egal la plus ancienne reste ; une offre en quarantaine ne detrone jamais une offre publiee ; quand l'offre appariee est deja membre d'un groupe, l'election se joue contre la canonique du groupe. (2) Les sources de l'offre masquee sont recopiees sur la canonique (`JobSource`), donc « ou et quand l'offre a ete vue » reste lisible sur l'offre que le public voit. (3) Lien de candidature : `chooseApplyUrl` (`packages/job-pipeline/src/apply-link.ts`) - un lien d'employeur l'emporte toujours sur un lien de job board connu (WTTJ, LinkedIn, Indeed, Glassdoor, HelloWork et quelques autres), puis le rang, puis le premier ; `RawJob.applyUrl` -> `CollectedOffer` -> `JobDraft` -> `Job.applyUrl` (colonne deja presente, aucune migration) ; une recollecte ne degrade jamais un lien deja choisi ; la page de detail affiche « Postuler sur le site de l'entreprise » vers ce lien quand il existe. 15 tests de persistance et 7 de lien ajoutes. Prouve sur la base Neon reelle avec des offres de test nommees (4 scenarios, 13 verifications OK) : job board puis ATS natif (l'ATS devient la canonique, les deux sources tracees), ATS puis job board (l'ATS reste, source du board tracee), job board seul avec lien employeur (lien stocke), deux job boards (le plus ancien reste et herite du lien employeur de l'autre) ; base revenue exactement a son etat d'avant. Constat releve par la preuve, non corrige (B010) : la similarite d'entreprise fusionne des entreprises aux noms voisins (« X Alpha SAS » et « X Gamma SAS ») des que titre, date et description coincident. Reste a faire : les connecteurs de job boards doivent utiliser `SOURCE_PRIORITY_JOB_BOARD` (TASK-401).

- [ ] TASK-308 - ScrapeGraphAI dans le moteur : zero cout, et repli quand le budget Apify est epuise
  - Priorite : P1
  - Complexite : L
  - Dependances : TASK-304, TASK-502
  - Notes : ordre du proprietaire du 2026-10-06 (« utilise aussi scrapegraphai »). Le plan Apify gratuit (5 $ par mois) est serre ; ScrapeGraphAI est disponible de deux facons : l'API cloud v2 (cle `SCRAPEGRAPH_API_KEY` fournie et validee le 2026-10-06, plan gratuit de 500 credits) et la bibliotheque locale avec Ollama, sans cout. Il prend trois roles : (1) fournisseur des sites carrieres sans ATS reconnu dont `robots.txt` autorise `FinditBot` (phase 23) - usage conforme aux conditions de ScrapeGraphAI ; (2) repli de Welcome to the Jungle et HelloWork quand le budget Apify est epuise ou que leur acteur casse - MAIS les conditions de ScrapeGraphAI imposent de respecter celles des sites cibles : tant que le proprietaire n'a pas confirme ce risque pour ce fournisseur (comme pour Apify le 2026-10-06), ce repli n'utilise que la bibliotheque locale, jamais l'API cloud ; (3) a decider apres mesure : en faire le fournisseur principal de ces deux sources pour reserver le credit Apify a LinkedIn, Indeed et Glassdoor. LinkedIn, Indeed et Glassdoor n'ont pas de repli local : leur protection anti-bot imposerait de la contourner, ce qui reste interdit.
  - Criteres d'acceptation :
    - Un `ScrapeProvider` ScrapeGraphAI aux memes contrats que le fournisseur Apify (sortie `RawJob`, registre, garde de conformite).
    - Le repli ne se declenche que sur `MONTH_BUDGET_EXCEEDED`, `CYCLE_BUDGET_EXCEEDED` ou acteur en echec, jamais sans trace ; volume et duree bornes ; identite annoncee, aucun module de furtivite.
    - Sortie revalidee par Zod ; un champ absent reste absent.
  - Tests : double de service (nomme) ; passage reel sur Welcome to the Jungle et HelloWork
  - Resultat :

### Phase 22 - Job boards, un site par brique (ordre du proprietaire, 2026-10-05)

Chaque brique suit le meme protocole : registre date, acteur epingle, filtres serveur (alternance et stage, developpeur, Ile-de-France, fraicheur 3 jours), `maxItems`, run reel borne, offres en base, zero echec. Ordre propose du plus sur au plus fragile ; une brique = un ordre explicite du proprietaire.

- [~] TASK-401 - Welcome to the Jungle
  - Priorite : P1
  - Complexite : M
  - Dependances : TASK-306
  - Criteres d'acceptation : contrat, ville, anciennete filtres cote acteur ; lien ATS d'apply conserve quand l'acteur le donne ; offres collectees en base sans compte.
  - Rendement (constate en TASK-306, 7 acceptees sur 20 puis 0 sur 5) : l'acteur propose un filtre `profession` (famille de metiers) et `searchInTitleOnly` ; a mesurer pour ne plus payer 0,0008 $ des offres rejetees ensuite. Objectif : plus de la moitie des offres payees acceptees.
  - Tests : double d'acteur + run reel borne
  - Resultat : fait le 2026-10-06, validation du proprietaire attendue ; le cycle quotidien est LIVRE MAIS ETEINT (decision a prendre). Rendement mesure sur le reel : la requete « developpeur » ne ramenait plus rien combinee au filtre de metier, et seule la famille `profession=global_tech` SANS mot-cle ramene des offres tech ; l'offre WTTJ en alternance et stage tech sur 3 jours dans un rayon de 50 km autour de Paris est mince (5 offres, 2 acceptees dont un doublon fusionne, 3 rejetees au tri) : le cout d'un run passe de 0,016 $ a 0,004 $ (l'objectif « plus de la moitie acceptee » n'est pas atteint, 40 % - la limite est l'offre disponible, pas le filtre ; les sous-familles `tech__dev_*` ne ramenaient que 2 offres, toutes du doublon Galadrim). Cycle : `SOURCE_PRIORITY_JOB_BOARD` (40) sur les offres de job board, planification dediee quotidienne a 6 h Paris (`SCRAPED_COLLECTION_CRON`) dans la meme file en concurrence 1 que le cycle de 4 h (jamais de chevauchement), sources triees du moins cher au plus cher, memes ingestion, journal de runs, garde de budget et notifications Telegram que le cycle natif. Interrupteur `SCRAPED_SOURCES_ENABLED` ETEINT PAR DEFAUT (chaque run depense du credit reel) et jeton Apify exige : sinon aucune source montee, aucune depense ; interrupteur coupe puis worker redemarre = planification retiree (verifie sur le vrai Redis avec une file jetable : creee, idempotente, retiree sans travail differe restant). `SCRAPING_WTTJ_MAX_ITEMS` (30 par defaut, maximum absolu 100). Tests : 4 de sources montees, 2 du cycle, 3 de l'aiguillage des travaux, 3 de configuration. Format, typecheck, lint, test 30/30, build 17/17. Pour allumer : `SCRAPED_SOURCES_ENABLED=true` dans `.env`, puis redemarrer le worker. A decider avant : republier sur le site public du contenu de job board (extrait court et lien d'origine, proposition de TASK-301) n'est pas encore implemente - les offres collectees apparaitraient entieres.

- [~] TASK-402 - HelloWork
  - Priorite : P1
  - Complexite : M
  - Dependances : TASK-306
  - Criteres d'acceptation : mots-cles alternance/stage, Ile-de-France, date de publication ; employeur extrait sans invention.
  - Tests : double d'acteur + run reel borne
  - Resultat : fait le 2026-10-06, validation du proprietaire attendue. Connecteur `@findit/job-connectors/src/hellowork.ts` (`solidcode/hellowork-scraper`, epingle), entree bornee : `searchQueries=[developpeur]`, `location=Ile-de-France`, `contractType=[ALTERNANCE, STAGE]`, `datePosted=3d`. Constat du run reel : l'acteur garde la derniere page entiere quand elle depasse le plafond demande (un plafond de 40 a rendu 60 resultats factures, constate le 2026-10-06). Le connecteur couvre ce depassement par `resultOvershoot` (20) dans la charge maximale et l'estimation, et `limit` borne la lecture. Sortie revalidee par Zod : `jobId`, `jobUrl`, `title`, `company` (nul possible -> « Inconnu », meme regle que France Travail), `city` (prefere a `location`, suffixe du departement que le resolveur de communes ne lit pas), `datePosted` (date seule), `descriptionHtml`/`descriptionText`. Tarifs constates sur un run reel : demarrage 0,00005 $, resultat 0,00095 $, aucun supplement de detail. Monte dans le cycle quotidien des sources scrapees, trie du moins cher au plus cher (apres WTTJ), `SOURCE_PRIORITY_JOB_BOARD`, derriere l'interrupteur `SCRAPED_SOURCES_ENABLED` (eteint par defaut) ; `SCRAPING_HELLOWORK_MAX_ITEMS` (40 par defaut, maximum absolu 100). Ligne de registre ecrite (regime `OWNER_ACCEPTED_SCRAPING`, date du 2026-10-06) et reportee en base. Preuve reelle bornee `pnpm board:proof -- --source hellowork --max-items 20` : 20 vues, 9 acceptees et publiees, 0 quarantaine, 11 rejetees, 0 echec, cout 0,01905 $ (egal au pire estime), base revenue exactement a son etat d'avant. Rendement 45 % : la limite est l'offre disponible sous le mot-cle « developpeur », pas le filtre (meme constat que WTTJ). Tests : 10 sur le connecteur, montage du cycle, configuration, registre.

- [~] TASK-403 - Indeed
  - Priorite : P1
  - Complexite : M
  - Dependances : TASK-306
  - Criteres d'acceptation : mots-cles alternance developpeur, `postedWithinDays` (3 jours), Ile-de-France ; URL d'origine et lien externe d'apply resolus.
  - Tests : double d'acteur + run reel borne
  - Resultat : fait le 2026-10-06, validation du proprietaire attendue. Connecteur `@findit/job-connectors/src/indeed.ts` (`curious_coder/indeed-scraper`, epingle), entree bornee : `country=fr`, `query=alternance developpeur`, `location=Ile-de-France`, `postedWithinDays="3"` (chaine, pas un nombre), `count`. Aucun filtre de contrat cote acteur : la classification Findit tranche. Sortie revalidee par Zod : `id`, `viewJobLink` (chemin relatif, prefixe `https://fr.indeed.com`), `title`, `companyDetails.name` (absent -> « Inconnu », meme regle que France Travail), `jobLocationCity` (prefere a `formattedLocation`, suffixe du departement), `pubDate` (millisecondes, constate le 2026-10-06), `jobDescriptionHTML`/`jobDescription`, `originalApplyUrl` (lien employeur, sert la fusion ATS). Tarifs constates sur un run reel : demarrage 0,0001 $, resultat 0,0001 $. Monte dans le cycle quotidien des sources scrapees, trie du moins cher au plus cher (avant WTTJ), `SOURCE_PRIORITY_JOB_BOARD`, derriere l'interrupteur `SCRAPED_SOURCES_ENABLED` (eteint par defaut) ; `SCRAPING_INDEED_MAX_ITEMS` (100 par defaut, maximum absolu 100). Ligne de registre ecrite (regime `OWNER_ACCEPTED_SCRAPING`, date du 2026-10-06) et reportee en base. Preuve reelle bornee `pnpm board:proof -- --source indeed --max-items 20` : 6 vues, 1 acceptee et publiee, 5 rejetees, 0 echec, cout 0,00070 $, base revenue exactement a son etat d'avant. Rendement 17 % : l'offre « alternance developpeur » sur 3 jours est mince et mal etiquetee (des CDI), la classification tranche. Tests : 9 sur le connecteur, montage du cycle, configuration, registre.

- [ ] TASK-404 - Glassdoor
  - Priorite : P2
  - Complexite : M
  - Dependances : TASK-306
  - Criteres d'acceptation : offres seules (pas d'avis ni de salaires scrapes, hors besoin) ; acteur sans compte et sans annonce de contournement.
  - Tests : double d'acteur + run reel borne
  - Resultat :

- [ ] TASK-405 - LinkedIn (offres publiques, sans compte)
  - Priorite : P2
  - Complexite : M
  - Dependances : TASK-306
  - Criteres d'acceptation : uniquement l'acteur qui lit les pages d'offres publiques ; aucun cookie, aucun profil, aucune donnee de recruteur stockee ; lien d'origine conserve ; abandon et mise a l'arret de la source si l'acteur exige un compte.
  - Tests : double d'acteur + run reel borne
  - Resultat :

- [ ] TASK-406 - Autres sources, API officielles d'abord
  - Priorite : P2
  - Complexite : L
  - Dependances : TASK-304
  - Notes : pistes a verifier une par une (aucune verifiee a ce jour) : API publique La Bonne Alternance (alternance, officielle), 1jeune1solution, Jobijoba, Free-Work, Welcome-like startups boards, Station F jobs, WorkInStartups, JobTeaser (compte probable : a ecarter si oui). Une API officielle passe avant tout scraping.
  - Criteres d'acceptation : une ligne de registre par source avec statut reel et date ; un connecteur natif des qu'une API officielle existe.
  - Tests : un run reel borne par source retenue
  - Resultat :

### Phase 23 - Sites carrieres des entreprises tech par extraction IA (ordre du proprietaire, 2026-10-05)

Vision : les 430 entreprises de l'annuaire n'ont pas toutes un ATS reconnu (le scan du 2026-07-27 en a rattache 26). Pour les autres, une cascade de la methode la moins chere a la plus couteuse : ATS reconnu, donnees structurees de la page (JSON-LD `JobPosting`, sitemap, `__NEXT_DATA__`), rendu Playwright, puis ScrapeGraphAI (Ollama local). Le LLM local lit a 21 tokens/s : il ne passe qu'en dernier recours et avec un budget de temps.

- [ ] TASK-501 - Extraction deterministe des pages carrieres
  - Priorite : P1
  - Complexite : M
  - Dependances : aucune
  - Fichiers concernes : `packages/job-connectors/src/careers-scan*`
  - Criteres d'acceptation :
    - JSON-LD `JobPosting`, sitemaps d'offres et donnees embarquees (`__NEXT_DATA__`) lus avant tout LLM.
    - `robots.txt` lu d'abord ; un refus est respecte pour les sites carrieres (regle conservee : la derogation du 2026-10-05 ne couvre que les job boards nommes).
  - Tests : pages de test figees (nommees comme telles) + passage reel sur 10 entreprises
  - Resultat :

- [ ] TASK-502 - Fournisseur ScrapeGraphAI (API cloud v2 pour les sites carrieres autorises, bibliotheque locale sinon)
  - Priorite : P1
  - Complexite : L
  - Dependances : TASK-501
  - Fichiers concernes : nouveau dossier `services/scrape-graph/` (Python, `scrapegraphai` 2.3.0 et `playwright` deja installes), `packages/job-connectors`
  - Criteres d'acceptation :
    - Appels privilegies, ordre du proprietaire du 2026-10-06 : `search` (retrouver la page carrieres d'une entreprise), `crawl` (parcourir un site carrieres ; un seul job de crawl sur le plan gratuit) et `extract` (schema d'offre en JSON) ; `scrape` en dernier recours.
    - Mode cloud (API v2 `extract` avec schema d'offre, solde lu par `/credits` avant chaque cycle, plafond en credits pose apres mesure du cout d'un premier appel) reserve aux pages publiques de sites carrieres dont `robots.txt` autorise `FinditBot` ; plan gratuit = donnees reutilisables par ScrapeGraphAI, donc jamais un CV, un profil, une lettre ni une donnee privee.
    - Mode local (service lie a `127.0.0.1`, modele Ollama `qwen2.5:7b`, aucun envoi vers un tiers) pour tout ce qui ne doit pas depenser de credit ni quitter le poste.
    - Schema d'offre strict ; sortie revalidee par Zod cote Node ; champ absent = absent.
    - Delai et nombre de pages bornes par entreprise ; mise en cache pour ne pas relire une page inchangee.
  - Tests : schema + double de service (nomme) ; un passage reel sur 3 sites sans ATS
  - Resultat :

- [ ] TASK-503 - Rendu JavaScript et pagination
  - Priorite : P2
  - Complexite : M
  - Dependances : TASK-501
  - Criteres d'acceptation : Playwright standard (identite annoncee, aucun module furtif) ; pagination et « charger plus » geres ; delai entre pages.
  - Tests : passage reel sur 3 sites a rendu client
  - Resultat :

- [ ] TASK-504 - Reexaminer les ATS fermes sous la nouvelle regle
  - Priorite : P2
  - Complexite : M
  - Dependances : TASK-301
  - Notes : Ashby, SmartRecruiters, Recruitee, Teamtailor, Personio, SuccessFactors ont ete fermes ou non verifies. Leurs pages d'offres sont publiques ; chacun redevient candidat si sa ligne de registre est reecrite apres verification reelle (flux, robots.txt, conditions).
  - Criteres d'acceptation : une ligne de registre par ATS avec statut reel et date ; un connecteur natif par ATS retenu, plus rapide et moins cher qu'un acteur.
  - Tests : preuve reelle bornee par ATS
  - Resultat :

- [ ] TASK-505 - Etendre et segmenter l'annuaire d'entreprises tech
  - Priorite : P2
  - Complexite : M
  - Dependances : TASK-501
  - Criteres d'acceptation : segmentation tech/non tech ; passage planifie hebdomadaire ; entreprises « site illisible » listees avec la raison au lieu d'etre perdues en silence.
  - Tests : compteurs avant/apres, rejouable sans doublon
  - Resultat :

### Phase 24 - Pilotage et qualite du scraping (ordre du proprietaire, 2026-10-05)

- [ ] TASK-601 - Sante des sources
  - Priorite : P1
  - Complexite : M
  - Dependances : TASK-304
  - Fichiers concernes : `apps/api` (routes gardees), `ConnectorRun`
  - Criteres d'acceptation : par source, dernier run, offres vues et acceptees, taux d'echec, cout, derniere erreur ; une source qui tombe a zero offre plusieurs cycles de suite est signalee (Telegram, hors simulation).
  - Tests : API + preuve sur base reelle
  - Resultat :

- [ ] TASK-602 - Cadence par famille de source et interrupteurs
  - Priorite : P2
  - Complexite : M
  - Dependances : TASK-601
  - Criteres d'acceptation : decision du proprietaire du 2026-10-06 : tout ce qui est scrape (job boards via Apify, sites carrieres via ScrapeGraphAI) tourne 1 fois par jour (cron dedie, par exemple 06 h heure de Paris), les ATS natifs restent a 4 h ; interrupteur par source sans redeploiement.
  - Tests : test scheduler + cycle reel
  - Resultat :

- [ ] TASK-603 - Pertinence : etiquetage de la fraicheur et du taux d'acceptation par source
  - Priorite : P2
  - Complexite : S
  - Dependances : TASK-601
  - Criteres d'acceptation : pour chaque source, part d'offres alternance/stage developpeur IDF acceptees ; les sources a faible rendement sont revues.
  - Tests : requetes de comptage sur base reelle
  - Resultat :

### Phase 25 - Refonte de la disposition du site (ordre du proprietaire, 2026-10-05)

Vision : le site passe d'une liste d'offres avec un panneau CV a un outil de veille a plusieurs espaces, ou la source de chaque offre est visible et ou le CV pilote la recherche. Cette phase reprend les cases ouvertes de la phase 17 (page unique avec filtres repliables, cartes, matching). Methode : `brainstorming` puis `frontend-design` avant tout code, maquettes validees par le proprietaire, une page par ordre. Regle du port 3100 et regle du tiret (jamais de tiret cadratin) maintenues.

Disposition proposee (a valider) :

```text
Barre de navigation : Offres | Mon CV | Candidatures | Sources
/                 Offres : recherche texte OU par CV, filtres repliables, badge de source sur chaque carte
/offres/[slug]    Detail : origine, lien de candidature, score si CV charge
/cv               Mon CV : import, structure, ameliorations, export PDF et DOCX, versions
/candidatures     Suivi (existe)
/sources          Transparence publique : sources actives, fraicheur, volume
/admin/scraping   Prive : sante des sources, budget, interrupteurs (TASK-601)
```

- [ ] TASK-701 - Architecture d'information et maquettes
  - Priorite : P1
  - Complexite : M
  - Dependances : aucune
  - Criteres d'acceptation : parcours, navigation et maquettes desktop et mobile valides par le proprietaire avant implementation.
  - Tests : revue
  - Resultat :

- [ ] TASK-702 - Navigation et gabarit commun
  - Priorite : P1
  - Complexite : M
  - Dependances : TASK-701
  - Fichiers concernes : `apps/web/src/app/layout.tsx`, `apps/web/src/components/`
  - Criteres d'acceptation : barre de navigation a quatre entrees, etat actif, responsive, accessible au clavier.
  - Tests : tests composants + verification navigateur desktop et mobile
  - Resultat :

- [ ] TASK-703 - Page Offres : filtres repliables, tri, badge de source, mode texte ou CV
  - Priorite : P1
  - Complexite : L
  - Dependances : TASK-701
  - Criteres d'acceptation : filtres (dates, metiers, contrats, departements, presence, source) dans un volet replie par defaut, tiroir sur mobile ; badge « ATS officiel / Job board » et nom de la source sur chaque carte ; carte avec lien externe seul si l'extraction a echoue ; mode CV inchange (score, lettre, suivi).
  - Tests : tests composants + parcours reel
  - Resultat :

- [ ] TASK-704 - Page Mon CV
  - Priorite : P1
  - Complexite : L
  - Dependances : TASK-701
  - Criteres d'acceptation : import, structure, faits extraits, ameliorations detaillees exploitables hors application, export PDF et DOCX ; aucune regression de la retention, de la suppression ni du garde-fou « rien d'invente ».
  - Tests : tests composants + API + parcours reel avec le vrai CV
  - Resultat :

- [ ] TASK-705 - Page Sources (publique) et page admin du scraping (privee)
  - Priorite : P2
  - Complexite : M
  - Dependances : TASK-601
  - Criteres d'acceptation : liste des sources avec statut, fraicheur et volume ; l'admin n'est jamais indexee et reste derriere le proxy serveur.
  - Tests : tests composants + verification navigateur
  - Resultat :

- [ ] TASK-706 - Verification visuelle et accessibilite
  - Priorite : P2
  - Complexite : S
  - Dependances : TASK-703, TASK-704
  - Criteres d'acceptation : desktop et mobile sans chevauchement, contrastes, navigation clavier ; reprend la case ouverte de la phase 2.
  - Tests : Playwright ou verification navigateur, `web-design-guidelines`
  - Resultat :

## 11. Bugs connus

| ID   | Bug                                                                                                                                                                                                               | Gravite | Reproduction                                                                                                                                                       | Cause probable                                                                                              | Correctif propose                                                                                                                                      | Statut                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| B001 | `pnpm format:check` echouait                                                                                                                                                                                      | P0      | `pnpm format:check`                                                                                                                                                | `packages/ai/src/ollama-client.test.ts` non Prettier                                                        | Reformater le fichier                                                                                                                                  | Ferme                 |
| B002 | Documentation historique obsolete                                                                                                                                                                                 | P1      | Lire `README.md` et `docs/architecture.md`                                                                                                                         | Docs non realignees apres phases recentes                                                                   | Recrire les sections d'etat/architecture                                                                                                               | Ferme                 |
| B003 | Workable actif mais non execute par le cycle worker                                                                                                                                                               | P1      | Lire `apps/worker/src/collection/cycle-deps.ts`                                                                                                                    | `TOKEN_CONNECTORS` ne porte que Greenhouse/Lever                                                            | Ajouter une voie `SearchTarget`                                                                                                                        | Ferme                 |
| B004 | Deduplication non persistee                                                                                                                                                                                       | P1      | `rg decideDuplicate apps packages`                                                                                                                                 | Moteur pur non appele par ingestion                                                                         | Branchee dans `persistDecision`                                                                                                                        | Ferme                 |
| B005 | `.env` local contient `OPENAI_API_KEY` obsolete                                                                                                                                                                   | P1      | Comparaison cles `.env` / `.env.example`                                                                                                                           | Ancien choix fournisseur distant                                                                            | Retiree du `.env` local                                                                                                                                | Ferme                 |
| B007 | Documentation en retard : `docs/architecture.md` disait Workable non lance et deduplication non persistee ; `HANDOFF.md` s'arretait au 2026-07-27 ; `CAHIER_DES_CHARGES.md` listait les job boards hors perimetre | P1      | Comparer `README.md`, `HANDOFF.md`, `docs/architecture.md` et `CAHIER_DES_CHARGES.md` au code                                                                      | Docs non realignees apres l'UX v3 puis le pivot scraping                                                    | Realigner (TASK-208)                                                                                                                                   | Corrige le 2026-10-06 |
| B008 | `README.md` annoncait une fenetre par defaut de 24 h                                                                                                                                                              | P2      | Lire `README.md` section Perimetre                                                                                                                                 | Ordre du 2026-07-27 non reporte dans le README                                                              | Fenetre de 3 jours (Q-7) ecrite dans `README.md` et `docs/architecture.md`                                                                             | Corrige le 2026-10-06 |
| B006 | CI/CD ecrite mais jamais executee                                                                                                                                                                                 | P2      | Onglet Actions du depot : aucune execution                                                                                                                         | GitHub repond « Actions has been disabled for this user »                                                   | Reactiver Actions dans les reglages du compte GitHub ; rien a corriger cote depot                                                                      | Bloque (hors depot)   |
| B009 | La classification accepte « Business Developer » comme metier developpeur                                                                                                                                         | P2      | `pnpm board:proof -- --max-items 20` le 2026-10-06 : « Business developer BtoB - Stage » (Franprix) et « Business Developer - Stage 4-6 mois » (AlumnEye) publiees | Le mot anglais « developer » est pris pour le metier                                                        | Titres commerciaux lus avant le mot « developer » (`COMMERCIAL_PHRASES` dans `role.ts`), sauf si le titre nomme aussi un metier d'ingenierie ; 3 tests | Ferme                 |
| B010 | La deduplication fusionne deux entreprises aux noms voisins                                                                                                                                                       | P2      | Preuve TASK-307, 2026-10-06 : « Preuve307 Alpha SAS » et « Preuve307 Gamma SAS », meme titre, meme date, meme description, fusionnees                              | Seuil de similarite d'entreprise a 0,3 (`COMPANY_MIN`), trop bas quand le nom est surtout un suffixe commun | Formes juridiques ignorees, nom contenu dans l'autre = variante a 0,85, seuil `COMPANY_MIN` releve de 0,3 a 0,5 ; 5 tests                              | Ferme                 |

## 12. Decisions techniques

| Date       | Decision                                                 | Justification                                               | Consequences                                                                        |
| ---------- | -------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 2026-07-16 | Monorepo pnpm/Turborepo, Next.js, NestJS, worker         | Separation web/API/traitements et evolution par briques     | Structure `apps/*` et `packages/*`                                                  |
| 2026-07-17 | Alternance et stage restent stockables                   | Ne pas detruire le perimetre valide et les stages reels     | L'affichage par defaut favorise l'alternance                                        |
| 2026-07-17 | Registre de conformite obligatoire                       | Ne pas collecter sans permission constatee                  | `Connector` decide ce qui peut tourner                                              |
| 2026-07-17 | Brave sert uniquement a decouvrir                        | Ses conditions interdisent de stocker les resultats         | Resultats transitoires, jamais en base                                              |
| 2026-07-24 | IA locale via Ollama `qwen2.5:7b`                        | Cout nul et aucune donnee envoyee a un tiers                | `AI_PROVIDER=ollama`, sortie Zod revalidee                                          |
| 2026-07-24 | Le rendu CV/lettre doit etre deterministe                | Eviter de regenerer un document entier par offre            | IA limitee au texte/analyse, pas au design PDF                                      |
| 2026-07-24 | Roadmap et cases restent sous validation utilisateur     | Methode demandee par le proprietaire                        | Aucune nouvelle case cochee pendant cet audit                                       |
| 2026-10-05 | Scraping elargi aux job boards et aux sites carrieres    | Ordre du proprietaire : meilleur outil de scraping possible | Registre reecrit (TASK-301), risque CGU assume, garde-fous gardes                   |
| 2026-10-05 | Cascade de collecte : natif, Apify, ScrapeGraphAI        | Du moins cher et du plus fiable au plus couteux             | Interface `ScrapeProvider`, LLM local en dernier recours                            |
| 2026-10-06 | Sources scrapees : 1 cycle par jour ; plan Apify gratuit | Ordre du proprietaire ; 5 $ de credit par mois              | Plafonds de resultats par source, garde de budget (TASK-305), cron dedie (TASK-602) |

## 13. Journal d'avancement

### Decisions en attente (2026-10-05)

Aucune n'est tranchee. Chacune a une valeur par defaut proposee dans `CAHIER_DES_CHARGES.md` section 25.

- Q-1 : les donnees privees (profil, CV, lettres, candidatures) peuvent-elles etre en base en ligne ? Defaut : non, publier d'abord les offres publiques.
- Q-2 : l'IA reste-t-elle locale (Ollama) ? Defaut : oui, fonctions IA reservees au proprietaire.
- Q-3 : fournisseur de base en ligne ? Defaut : Neon.
- Q-4 : TRANCHEE le 2026-10-05 par le proprietaire : toutes les sources, job boards inclus (LinkedIn, WTTJ, HelloWork, Glassdoor, Indeed, autres). Voir phase 21.
- Q-5 : Redis gere ou local ? Defaut : gere si le worker est heberge, local sinon.
- Q-6 : hebergeur web, API et worker ? Pas de defaut impose.
- Q-7 : fenetre de fraicheur, 24 h, 72 h, ou les deux ? Defaut : 3 jours par defaut, filtre 24 h conserve.
- Q-8 : conservation des candidatures ? Defaut : jusqu'a suppression par l'utilisateur, revue annuelle.

### 2026-10-06 - decisions de cadence et de plan, plafond de depense (TASK-305)

- Decisions du proprietaire : une collecte par jour pour les sites scrapes (les ATS natifs restent a 4 h) ; plan Apify gratuit, 5 $ de credit par mois ; ScrapeGraphAI utilise aussi (nouvelle brique TASK-308 : zero cout, repli de WTTJ et HelloWork). Compte Apify dedie et risque de la clause 11.1 confirmes.
- Consequence chiffree : meme a une collecte par jour, 100 resultats par source (13 $ par mois) depassent le credit ; plafonds du plan gratuit fixes a 30, 40, 20, 60 et 100 resultats (environ 4,1 $ par mois).
- Taches : TASK-301 et TASK-302 faites, TASK-303 (choix des acteurs) et TASK-305 (plafond de depense) faites, en attente de validation. Aucun acteur Apify lance.
- Bugs B009 et B010 fermes (ordre du proprietaire) : un titre « Business Developer » ou « Developpeur commercial » n'est plus un metier de developpeur (sauf titre d'ingenierie qui cite le developpement commercial comme domaine) ; deux entreprises aux noms voisins (« X Alpha SAS », « X Gamma SAS ») ne fusionnent plus, les formes juridiques ne comptant plus dans la ressemblance. Tests ecrits avant le correctif (echec constate, puis succes) ; format, typecheck, lint, test 30/30, build 17/17.
- TASK-401 faite (en attente de validation) : Welcome to the Jungle dans un cycle quotidien a 6 h, livre mais ETEINT par defaut (`SCRAPED_SOURCES_ENABLED`) ; filtre de metier tech, cout d'un run ramene de 0,016 $ a 0,004 $.
- TASK-307 faite (en attente de validation) : election de la canonique par rang de source, partage des sources, lien de candidature employeur ; prouvee sur la base reelle. Bug B010 releve.
- TASK-306 faite sur le reel (en attente de validation) : premier run Apify, 0,016 $ ; bug de sous-declaration du cout trouve et corrige, voir son resultat. Preference du proprietaire notee : ScrapeGraphAI via `search`, `crawl` et `extract` (TASK-502).
- TASK-304 faite (en attente de validation) : connecteur Apify generique branche sur la garde de budget, voir son resultat. Cle ScrapeGraphAI recue du proprietaire, rangee dans `.env` (ignore par git), validee par `GET /credits` (plan gratuit, 500 credits) ; ses conditions de service ont ete lues : elles imposent de respecter robots.txt et les conditions des sites cibles, donc le cloud ne sert pas les job boards sans confirmation du proprietaire. Aucun acteur Apify ni extraction ScrapeGraph lance.
- Controles : voir la ligne de verification de TASK-305 ; migrations `20261005100000_owner_accepted_scraping` et `20261006090000_connector_run_cost` appliquees sur la base Neon.

### 2026-10-05 (suite) - pivot : outil de scraping multi-sources et refonte du site

- Ordre du proprietaire : transformer Findit en veritable outil de scraping (Apify, ScrapeGraphAI deja installe, autres), sur les sites carrieres des entreprises tech et sur les job boards (LinkedIn, Welcome to the Jungle, HelloWork, Glassdoor, Indeed, autres), tout en gardant la gestion des CV, et reorganiser la disposition du site.
- Roadmap modifiee : phase 21 reecrite (moteur multi-sources, remplace le cadrage Apify borne), phases 22 (job boards), 23 (sites carrieres par extraction IA), 24 (pilotage) et 25 (refonte du site) ajoutees ; Q-4 tranchee ; risques et decisions techniques mis a jour. Phases 17, 19 et 20 inchangees ; la base en ligne (phase 20) reste necessaire pour heberger le volume, le scraping peut demarrer en local.
- Verification reelle : `search-actors` Apify appele 5 fois (WTTJ, HelloWork, LinkedIn, Glassdoor, Indeed), candidats releves dans TASK-303 ; `pip list` confirme `scrapegraphai` 2.3.0, `scrapegraph-py` 2.3.1, `playwright` 1.63.0. Aucun acteur lance, aucune ligne de code modifiee, aucune case cochee.
- Point de vigilance consigne : les CGU de ces plateformes interdisent la collecte automatisee ; garde-fous proposes (pas de compte, pas de CAPTCHA contourne, pas de furtivite dans notre code, URL d'origine obligatoire, extrait court en public) a confirmer par le proprietaire.
- Prochaine brique proposee, sur ordre : TASK-301 (registre), puis 302, 303, 305, 304, 306 sur Welcome to the Jungle.

### 2026-10-05 - cadrage cahier des charges, base en ligne et Apify

- Taches ajoutees : phase 20 (TASK-201 a TASK-208, base en ligne) et phase 21 (TASK-301 a TASK-307, Apify). Bugs B007 et B008 ouverts. Contradictions C-1 a C-7 documentees dans `CAHIER_DES_CHARGES.md` section 26.
- Livrable cree : `CAHIER_DES_CHARGES.md`. Pas de PDF : aucun outil de conversion verifie.
- Verification reelle : outil Apify `search-actors` appele deux fois (« job postings », « career pages ») ; resultats utilises pour les contradictions C-1 et C-2. Aucun acteur n'a ete lance.
- Aucune ligne de code modifiee. Aucune case cochee.
- Conclusion de cadrage : Apify ne doit pas tourner avant la decision Q-4 ; la base en ligne ne doit pas recevoir de donnees privees avant la decision Q-1.

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
- [ ] Base de donnees de production en ligne, TLS, sauvegardee, migrations appliquees sans derive (phase 20).
- [ ] Moteur de scraping multi-sources (Apify, ScrapeGraphAI, natif) plafonne en depense, avec registre date par source (phases 21 a 24).
- [ ] Job boards collectes sans compte, avec URL d'origine et dedoublonnage inter-sources (phase 22).
- [ ] Disposition du site refondue et verifiee sur desktop et mobile (phase 25).
