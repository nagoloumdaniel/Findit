# Cahier des charges - Findit

> Written for: le propriétaire du projet et tout agent IA qui reprend le travail.
> Date : 2026-10-06. Branche de référence : `main`.
> Ce document formalise le besoin, le périmètre et les règles. L'état d'avancement et
> l'ordre d'exécution sont dans [roadmap.md](roadmap.md). Les détails opérationnels
> (API, tables, commandes) ne sont pas recopiés ici : voir les renvois.

## Légende

| Tag           | Sens                                                                               |
| ------------- | ---------------------------------------------------------------------------------- |
| [CONFIRMÉ]    | Fourni explicitement par le propriétaire, ou décidé et consigné dans le dépôt.     |
| [DÉDUIT]      | Déduit du code ou de la documentation existante.                                   |
| [PROPOSITION] | Recommandation de ce document, non tranchée.                                       |
| [À CONFIRMER] | Décision nécessaire du propriétaire. Une valeur par défaut est indiquée.           |
| [CONTRAINTE]  | Imposé par la loi, une condition d'utilisation, le registre ou un choix déjà acté. |

---

## 1. Résumé exécutif

Findit agrège les offres d'**alternance et de stage développeur en Île-de-France** à partir de sources
publiques autorisées, et les affiche sur un site public. Pour le propriétaire, une extension privée
analyse son CV, calcule la correspondance avec chaque offre, génère une lettre factuelle et suit ses
candidatures. [CONFIRMÉ]

Le socle est en place : monorepo, API, worker, connecteurs ATS, France Travail et Workday, déduplication
persistée, Telegram, espace candidat, score explicable, lettres, PDF et suivi des candidatures. Trois
chantiers avaient été demandés à ce stade :

1. **Mettre la base de données en ligne** au lieu de PostgreSQL local. [FAIT - Neon, TLS obligatoire]
2. **Utiliser Apify** comme outil de scraping pour la recherche d'offres. [LIVRÉ - moteur, garde de
   budget et premier job board, en attente de validation du propriétaire]
3. **Mettre à jour** la documentation de cadrage (le présent document et la roadmap). [FAIT]

Le chantier de scraping touche deux contraintes fortes du projet : le **registre de conformité** (aucune
collecte sans permission constatée) et la règle « rien ne sort du poste ». La première a été traitée par
un nouveau régime de registre (section 26, C-1). La seconde est **contredite par l'état réel** : l'API
lit `DATABASE_URL`, qui pointe sur la base en ligne, donc tout ce que l'application écrit - profil, texte
du CV, lettres, candidatures - part sur cette base. Voir C-4 et Q-1.

---

## 2. Présentation, vision et problème

- **Problème** : les offres d'alternance et de stage développeur sont dispersées entre des dizaines
  d'ATS et de sites carrières. Le propriétaire veut les voir en un endroit, et savoir en un coup d'œil
  laquelle correspond à son CV. [CONFIRMÉ]
- **Vision** : une page unique. On y cherche par texte ou par CV ; chaque offre montre son score et les
  actions utiles. [CONFIRMÉ, UX v3]
- **Deux mondes séparés** : le flux d'offres est **public** ; tout ce qui touche au profil, au CV, aux
  lettres et aux candidatures est **privé et gardé**. [CONFIRMÉ]

---

## 3. Objectifs

| ID  | Objectif                                                      | Mesure de réussite                                                                                              |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| O-1 | Afficher les offres réelles de sources autorisées             | Offres publiées en base, toutes issues d'une source inscrite au registre.                                       |
| O-2 | Aider à candidater sans postuler à la place de l'utilisateur  | Redirection vers la source officielle ; aucune soumission automatique.                                          |
| O-3 | Expliquer le score de correspondance                          | Chaque score a des critères, des compétences couvertes et manquantes.                                           |
| O-4 | Ne rien inventer dans les documents générés                   | Garde-fou anti-invention actif ; violation = refus, rien stocké.                                                |
| O-5 | Respecter la conformité des sources                           | Aucun connecteur ne tourne sans ligne `Connector` autorisée et datée.                                           |
| O-6 | Rendre la base accessible hors du poste de développement      | Base PostgreSQL en ligne, migrée, sauvegardée. [CONFIRMÉ]                                                       |
| O-7 | Élargir la recherche d'offres avec Apify, dans le cadre légal | Au moins une source Apify autorisée collectée de bout en bout, coût plafonné. [CONFIRMÉ, périmètre à confirmer] |

---

## 4. Périmètre, hors périmètre, versions

### 4.1 Périmètre validé [CONFIRMÉ]

- Contrats : alternance et stage.
- Métiers : Front-end, Back-end, Full-stack, Développement mobile, Data Analyst, Data Engineer.
- Zone : Île-de-France (75, 77, 78, 91, 92, 93, 94, 95).
- Source de vérité du périmètre : `packages/shared/src/job-scope.ts`.

### 4.2 Hors périmètre

- Candidature automatique, envoi de messages recruteurs. [CONFIRMÉ, « ne postule jamais à la place de l'utilisateur »]
- Collecte des job boards (LinkedIn, Indeed, Glassdoor, Welcome to the Jungle, HelloWork) : **entrée dans
  le périmètre le 2026-10-05**, sous le régime toléré `OWNER_ACCEPTED_SCRAPING` et les garde-fous de
  `docs/legal-compliance.md`. [CONFIRMÉ, propriétaire]
- Scraping direct de Google, contournement d'anti-bot ou de CAPTCHA, comptes et cookies. [CONTRAINTE]
- Authentification multi-utilisateurs. L'espace privé reste mono-propriétaire. [DÉDUIT]
- Analyse GitHub : hors MVP, prévue en V2 (roadmap, phase 8).

### 4.3 Découpage

| Version | Contenu                                                                                                 | État                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **MVP** | Offres publiques, collecte sources autorisées, CV privé, score, lettre, PDF, suivi, Telegram.           | Complet.                                                                                    |
| **V1**  | Base en ligne, hébergement public, Apify, job boards, DOCX, rappels, tests E2E.                         | Base en ligne faite, moteur Apify livré ; restent l'hébergement et les job boards suivants. |
| **V2**  | Analyse GitHub et sélection de projets, versions du CV, binaire chiffré, administration, observabilité. | Non commencé.                                                                               |

---

## 5. Utilisateurs et rôles

| Rôle                  | Objectif                           | Permissions                                                  | Données accessibles                       |
| --------------------- | ---------------------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| Visiteur public       | Trouver une offre récente          | Lecture seule du flux public                                 | Offres publiées, détail, filtres          |
| Propriétaire (unique) | Candidater avec un dossier factuel | Lecture et écriture de l'espace privé, via `x-workspace-key` | Profil, CV, scores, lettres, candidatures |
| Worker (système)      | Collecter et notifier              | Écriture sur offres et registre ; lecture du registre        | Registre, offres, journaux                |

[DÉDUIT] Le rôle « propriétaire » n'est pas un compte utilisateur : c'est une clé serveur. La clé ne
doit jamais atteindre le navigateur (le proxy Next la porte côté serveur).

---

## 6. Parcours utilisateurs

**P-1 Chercher une offre (visiteur)**
Accueil → saisie de texte ou filtres → liste triée (la plus récente d'abord) → détail → lien vers la
source officielle.

**P-2 Candidater avec son CV (propriétaire)**
Accueil → import du CV → structuration (IA locale) → matching de toutes les offres → liste triée par score
→ sur une offre : lettre générée et relue → PDF → « Suivre cette candidature » → statut et historique.

**P-3 Collecte automatique (système)**
Cron (toutes les 4 h) → registre lu → connecteurs autorisés exécutés → normalisation, classification,
déduplication → ingestion (accepté, quarantaine ou rejeté) → alerte Telegram des nouvelles offres.

**P-4 Mise en ligne (propriétaire, nouveau)**
Création de la base en ligne → migration → transfert des données de référence → bascule de
`DATABASE_URL` → vérification (compteurs, santé API, une collecte réelle).

---

## 7. Fonctionnalités

| ID    | Fonctionnalité                                                          | Acteur             | État                    | Priorité |
| ----- | ----------------------------------------------------------------------- | ------------------ | ----------------------- | -------- |
| F-001 | Liste, recherche, filtres, pagination, détail d'offre                   | Visiteur           | Fait                    | P0       |
| F-002 | Redirection vers la source officielle                                   | Visiteur           | Fait                    | P0       |
| F-003 | Collecte Greenhouse, Lever, Workable, Workday, France Travail           | Système            | Fait                    | P1       |
| F-004 | Registre de conformité et garde-fou structurel                          | Système            | Fait                    | P0       |
| F-005 | Découverte de sources (Brave, transitoire ; scan des sites carrières)   | Système            | Fait                    | P1       |
| F-006 | Normalisation, classification, détection d'écoles, décision d'ingestion | Système            | Fait                    | P0       |
| F-007 | Déduplication persistée                                                 | Système            | Fait                    | P1       |
| F-008 | Alertes Telegram et commandes `/start`, `/status`, `/latest`, `/help`   | Propriétaire       | Fait                    | P2       |
| F-009 | Import, extraction et structuration du CV                               | Propriétaire       | Fait                    | P1       |
| F-010 | Suppression et rétention du CV source                                   | Propriétaire       | Fait                    | P1       |
| F-011 | Score de correspondance offre/CV sans IA, explicable                    | Propriétaire       | Fait                    | P1       |
| F-012 | Lettre de motivation factuelle, garde-fou anti-invention                | Propriétaire       | Fait                    | P1       |
| F-013 | Export PDF du CV et de la lettre                                        | Propriétaire       | Fait                    | P1       |
| F-014 | Suivi des candidatures et historique                                    | Propriétaire       | Fait                    | P1       |
| F-015 | Recherche par CV (matching de toutes les offres)                        | Propriétaire       | Fait                    | P1       |
| F-016 | Base de données en ligne                                                | Système            | À faire                 | P0       |
| F-017 | Collecte via Apify sur sources autorisées                               | Système            | À faire                 | P1       |
| F-018 | Export DOCX des documents                                               | Propriétaire       | À faire                 | P2       |
| F-019 | Rappels et statistiques de candidature                                  | Propriétaire       | À faire                 | P2       |
| F-020 | Analyse GitHub et sélection de projets                                  | Propriétaire       | À faire                 | P2       |
| F-021 | Hébergement public (web, API, worker)                                   | Visiteur / système | À faire, hôte à choisir | P1       |

### F-016 - Base de données en ligne

- **Objectif** : sortir la base du poste local, rendre les données accessibles au déploiement. [CONFIRMÉ]
- **Acteurs** : système (API, worker) ; propriétaire (migrations).
- **Préconditions** : décision sur le périmètre des données privées (Q-1, section 25).
- **Déclencheur** : mise en production, ou changement d'environnement.
- **Fonctionnement** : une seule chaîne `DATABASE_URL` par environnement, chiffrement en transit
  obligatoire hors poste local, migrations additives appliquées sans réinitialisation.
- **Données** : toutes les tables du schéma `packages/database/prisma/schema.prisma`.
- **Règles métier** : RM-008, RM-009.
- **Cas nominal** : base créée, migrations appliquées, compteurs de référence identiques à la source.
- **Cas d'erreur** : base injoignable ou TLS refusé → démarrage refusé avec message explicite, sans secret affiché.
- **Cas limites** : coupure réseau pendant un cycle worker → le cycle échoue proprement, le verrou se libère.
- **Critères d'acceptation** :
  - [ ] `prisma migrate deploy` passe sur la base en ligne, sans dérive (`migrate diff` vide).
  - [ ] Le compte applicatif n'a pas les droits de réinitialisation.
  - [ ] Aucune URL de base avec mot de passe dans le dépôt ni dans les journaux.
  - [ ] Sauvegardes automatiques du fournisseur, rétention documentée.

### F-017 - Collecte via Apify

- **Objectif** : utiliser Apify pour lire les offres de sources **déjà autorisées**, sans élargir le registre. [CONFIRMÉ, périmètre à confirmer]
- **Acteurs** : worker (exécution) ; propriétaire (choix des acteurs, validation).
- **Préconditions** : Q-4 tranchée ; ligne `Connector` par source d'origine ; token Apify côté serveur.
- **Déclencheur** : cycle worker, pour les seules sources listées comme autorisées.
- **Fonctionnement** : appel d'un acteur Apify choisi et épinglé par identifiant, entrée bornée (nombre
  maximal d'éléments, filtres serveur sur l'alternance, Île-de-France, fraîcheur), lecture du jeu de
  résultats, normalisation vers le même format que les autres connecteurs, puis ingestion habituelle.
- **Données** : offres de la source d'origine uniquement. Les résultats d'un moteur de recherche ne sont
  jamais stockés comme offres. [CONTRAINTE, Brave et registre]
- **Règles métier** : RM-010 à RM-013.
- **Cas nominal** : un run borné ramène des offres d'une source autorisée, elles sont ingérées, le
  `ConnectorRun` affiche le coût et le compte.
- **Cas d'erreur** : acteur indisponible, quota ou budget dépassé, token absent → la source est sautée, la
  collecte continue, erreur journalisée sans le token.
- **Cas limites** : une offre vue à la fois par Apify et par un connecteur natif → la déduplication
  existante tranche ; aucune double collecte payée inutilement (voir TASK-307).
- **Critères d'acceptation** :
  - [ ] Aucun acteur ne cible une plateforme refusée au registre.
  - [ ] Proxies désactivés par défaut ; aucune rotation d'IP.
  - [ ] Identité `FinditBot` annoncée quand l'acteur le permet ; à défaut, l'acteur n'est pas utilisé.
  - [ ] Plafond de dépense par cycle configuré et testé.
  - [ ] Une preuve réelle bornée, avec compteurs en base, zéro échec.

---

## 8. Exigences fonctionnelles

Priorités : P0 bloquant, P1 essentiel, P2 important, P3 secondaire. Indicatives tant que non validées.

| ID     | Exigence                                                                  | Acteur       | Priorité | Validation                                               |
| ------ | ------------------------------------------------------------------------- | ------------ | -------- | -------------------------------------------------------- |
| EF-001 | Afficher uniquement des offres publiées depuis une source autorisée       | Visiteur     | P0       | Requête en base : chaque offre a une source au registre. |
| EF-002 | Ne jamais collecter une source sans ligne `Connector` autorisée et datée  | Système      | P0       | Test du garde-fou ; `pnpm registry:sync`.                |
| EF-003 | Lire `robots.txt` avant chaque collecte de domaine découvert              | Système      | P0       | Tests `robots`, verdict `ALLOWED` exigé.                 |
| EF-004 | Score offre/CV explicable, sans IA                                        | Propriétaire | P1       | Tests unitaires du moteur ; affichage des raisons.       |
| EF-005 | Lettre citant uniquement des faits du CV structuré                        | Propriétaire | P1       | Garde-fou ; violation = 502, rien stocké.                |
| EF-006 | Suppression physique du CV sur demande et à expiration                    | Propriétaire | P1       | Test API : 204 puis 404 ; purge à zéro ligne.            |
| EF-007 | Suivi de candidature avec historique daté                                 | Propriétaire | P1       | Test API + base.                                         |
| EF-008 | Alerte Telegram idempotente, simulation par défaut                        | Système      | P2       | Test d'idempotence ; `TELEGRAM_DRY_RUN=true` par défaut. |
| EF-009 | Base de données en ligne migrée et sauvegardée                            | Système      | P0       | F-016.                                                   |
| EF-010 | Collecte Apify bornée et tracée                                           | Système      | P1       | F-017.                                                   |
| EF-011 | Un champ absent reste absent ; un employeur inconnu est nommé « Inconnu » | Système      | P0       | Tests de normalisation ; pas de nom extrait de la prose. |
| EF-012 | Dates jamais plus précises que la source                                  | Système      | P1       | Test d'extraction (« 2025 » reste « 2025 »).             |

---

## 9. Règles métier

**RM-001 - Fraîcheur par défaut**
**Condition :** une requête publique sans filtre de fraîcheur.
**Comportement attendu :** fenêtre de 3 jours (72 h), tri du plus récent au plus ancien.
**Exception :** la fenêtre de 24 h de la spécification initiale n'est plus la valeur par défaut. Voir section 26, C-3.

**RM-002 - Contrats**
**Condition :** une offre hors alternance ou stage.
**Comportement attendu :** rejetée à la classification.
**Exception :** aucune.

**RM-003 - Périmètre géographique**
**Condition :** une offre hors Île-de-France.
**Comportement attendu :** rejetée (localisation normalisée, 1262 communes).
**Exception :** aucune.

**RM-004 - Registre**
**Condition :** une source sans ligne `Connector` ou au statut non autorisé.
**Comportement attendu :** le connecteur ne s'exécute pas ; la collecte continue avec les autres.
**Exception :** aucune. Un silence n'est jamais une autorisation.

**RM-005 - Découverte**
**Condition :** un domaine découvert par recherche web.
**Comportement attendu :** collectable seulement si son `robots.txt` autorise explicitement `FinditBot`.
**Exception :** `UNKNOWN`, fichier illisible ou absent = refus.

**RM-006 - Recherche web**
**Condition :** un résultat Brave ou tout autre moteur.
**Comportement attendu :** transitoire, jamais écrit en base ; sert uniquement à remonter à la source.
**Exception :** aucune.

**RM-007 - Documents générés**
**Condition :** génération d'une lettre ou d'un CV.
**Comportement attendu :** tout élément cité doit exister dans le CV structuré ; une compétence non possédée est marquée « en cours d'acquisition », jamais présentée comme acquise.
**Exception :** formules d'adresse et de politesse, qui relèvent du modèle de document et non de l'IA.

**RM-008 - Données personnelles**
**Condition :** stockage d'un CV, d'un profil ou d'une candidature.
**Comportement attendu :** conservation limitée (CV : `RESUME_RETENTION_HOURS`) ; suppression testée.
**Exception :** la durée de conservation des candidatures reste à décider. [À CONFIRMER]

**RM-009 - Hébergement des données**
**Condition :** une donnée privée est écrite sur une base hors du poste.
**Comportement attendu :** seulement après décision explicite du propriétaire (Q-1) et chiffrement en transit.
**Exception :** les offres publiques peuvent être publiées avant la décision sur les données privées. [PROPOSITION]

**RM-010 - Scraping, périmètre**
**Condition :** un acteur Apify ou une extraction ScrapeGraphAI.
**Comportement attendu :** utilisé seulement pour une source dont la ligne du registre porte un régime de collecte
(`OFFICIAL_API`, `PUBLIC_FEED`, `AUTHORIZED_CRAWL`, `OWNER_ACCEPTED_SCRAPING`) et une vérification datée de moins de 90 jours.
**Exception :** les sources `DISABLED_PENDING_PERMISSION`, `PROHIBITED`, `SEARCH_ENGINE_DISCOVERY_ONLY` et `MANUAL_IMPORT` sont
exclues, même si l'acteur les couvre. [CONFIRMÉ, décision du 2026-10-05 pour `OWNER_ACCEPTED_SCRAPING`]

**RM-011 - Scraping, accès et identité**
**Condition :** un acteur ou une extraction qui accède à un site.
**Comportement attendu :** aucun compte, login ni cookie ; aucun CAPTCHA contourné ; aucun module de furtivité dans le code
Findit ; acteur annonçant un contournement d'anti-bot écarté ; requêtes natives sous l'identité `FinditBot`. Les proxys propres
à un acteur tiers sont hors de notre code : ils sont notés au registre comme risque.
**Exception :** aucune. [CONTRAINTE, `docs/legal-compliance.md` ; la dérogation du 2026-10-05 ne lève pas ces interdictions]

**RM-012 - Apify, coût**
**Condition :** un cycle qui appelle Apify.
**Comportement attendu :** budget maximal par cycle et nombre maximal d'éléments par run ; dépassement = arrêt de la source.
**Exception :** aucune.

**RM-013 - Apify, données**
**Condition :** un jeu de résultats Apify.
**Comportement attendu :** seules les offres de la source d'origine sont ingérées ; les résultats de moteurs ne le sont jamais.
**Exception :** aucune.

**RM-014 - IA locale**
**Condition :** une fonction IA.
**Comportement attendu :** Ollama local (`qwen2.5:7b`) ; sortie validée par Zod ; erreur explicite si invalide.
**Exception :** `AI_PROVIDER=disabled` désactive la fonction proprement. [CONFIRMÉ, décision du 2026-07-24]

---

## 10. UX/UI

Le design visuel est sobre et tourne déjà ; ce document ne redéfinit pas la charte. [DÉDUIT]

| ID  | Écran                        | Rôle         | Objectif                             | Actions                                        |
| --- | ---------------------------- | ------------ | ------------------------------------ | ---------------------------------------------- |
| E-1 | Accueil `/`                  | Tous         | Chercher, filtrer, rechercher par CV | Texte, filtres, import CV, liste               |
| E-2 | Détail `/offres/[slug]`      | Tous         | Lire une offre                       | Lien source ; si CV importé : score et actions |
| E-3 | Candidatures `/candidatures` | Propriétaire | Suivre les dossiers                  | Statut, note, historique, suppression          |

Règles d'interface :

- États obligatoires : chargement, vide, erreur API, succès. Aucun état ne prétend qu'un service
  indisponible fonctionne. [CONFIRMÉ, spec d'initialisation]
- Lien externe seul quand l'extraction a échoué ; page détail quand elle a réussi. [CONFIRMÉ, roadmap phase 17]
- Responsive : vérification desktop et mobile encore à faire (roadmap phase 2).
- Accessibilité : contrastes et focus à vérifier ; aucun critère chiffré n'est encore défini. [À CONFIRMER]

---

## 11. Architecture

### 11.1 Architecture actuelle [DÉDUIT du dépôt]

- `apps/web` : Next.js 16, port 3100. Ne se connecte jamais à la base ni à Redis.
- `apps/api` : NestJS sur Fastify, port 4000. Routes publiques et routes gardées par `x-workspace-key`.
- `apps/worker` : NestJS et BullMQ. Cron toutes les 4 h, verrou de concurrence 1.
- Paquets métier : `job-connectors`, `job-normalization`, `job-classification`, `job-deduplication`,
  `job-pipeline`, `matching-engine`, `documents`, `ai`, `notifications`, `config`, `shared`, `ui`, `database`.
- Services : PostgreSQL (Docker, pgvector), Redis (Docker), Ollama (poste local).

Détail : [docs/architecture.md](docs/architecture.md) (à réaligner, voir section 26, C-6).

### 11.2 Architecture cible [PROPOSITION, sous réserve de Q-1 à Q-3]

```text
Navigateur -> web (hébergé) -> API (hébergée) -> PostgreSQL en ligne
                                     |
                                     +-> Redis (local ou géré, Q-5)
Worker (hébergé, toujours allumé) -> Redis -> connecteurs natifs
                                     |      -> Apify (cloud, sources autorisées seulement)
                                     |      -> Brave (découverte transitoire)
                                     +-> PostgreSQL en ligne
Ollama : reste sur le poste du propriétaire (Q-2)
```

Point de vigilance : une API hébergée dans le cloud ne peut pas joindre Ollama sur `localhost`. Tant que
l'IA reste locale, les fonctions IA ne sont disponibles que quand le poste est allumé et relié (voir C-5).

### 11.3 Environnements

| Environnement | Base                        | Redis              | IA                 | Usage              |
| ------------- | --------------------------- | ------------------ | ------------------ | ------------------ |
| Développement | PostgreSQL Docker local     | Redis Docker local | Ollama local       | Développer, tester |
| Production    | PostgreSQL en ligne (F-016) | À décider (Q-5)    | Ollama local (Q-2) | Public             |

---

## 12. Modèle de données

Entités existantes (voir `schema.prisma`, sans recopier les colonnes) :

- **Offres** : `Company`, `Job`, `JobSource`, `JobSourceSnapshot`, `Skill`, `JobSkill`, `CompanyAlias`.
- **Registre et collecte** : `Connector`, `CompanySource`, `CompanyClassification`, `ConnectorRun`,
  `ConnectorError`, `ProcessingLog`.
- **Déduplication** : `DuplicateGroup`, `DuplicateDecision`.
- **Privé** : `CandidateProfile`, `SourceResume` (texte extrait et faits structurés, pas le binaire),
  `SourceResumeMatch`, `SourceCoverLetter`, `Application`, `ApplicationEvent`.
- **Notifications** : `TelegramJobNotification`.

Règles d'intégrité [CONFIRMÉ, roadmap §6 et phases] : migrations additives uniquement ; une candidature
garde des instantanés de l'offre et du CV, pour survivre à leur expiration ; `ApplicationEvent` n'est
jamais réécrit.

Pour Apify : aucune table nouvelle n'est proposée. Un run Apify est une ligne `ConnectorRun` ; son coût
et son identifiant de run y sont consignés. [PROPOSITION]

---

## 13. API

Routes, validations et statuts : voir [roadmap.md §7](roadmap.md). Ce document ne les recopie pas.

Changements proposés : aucune route publique nouvelle. La base en ligne et Apify ne modifient pas le contrat
HTTP.

---

## 14. Intégrations

| Intégration                 | Rôle                            | Statut                         | Règle                                                |
| --------------------------- | ------------------------------- | ------------------------------ | ---------------------------------------------------- |
| Greenhouse, Lever, Workable | Flux ATS publics                | Actifs                         | Registre ; Lever : `Crawl-delay: 1` et `ai-train=no` |
| Workday                     | Flux CXS par locataire          | Actif                          | `robots.txt` du locataire relu avant chaque collecte |
| France Travail              | API officielle                  | Actif si identifiants présents | Identifiants côté serveur seulement                  |
| Brave Search                | Découverte                      | Actif si clé                   | Résultats jamais stockés                             |
| Apify                       | Scraping sur sources autorisées | À construire (F-017)           | RM-010 à RM-013                                      |
| Telegram                    | Alertes                         | Actif, simulation par défaut   | Token jamais journalisé                              |
| Ollama                      | IA locale                       | Actif                          | Aucun appel sortant                                  |
| PostgreSQL en ligne         | Base                            | À construire (F-016)           | TLS obligatoire hors poste                           |
| Redis géré                  | File BullMQ                     | À décider (Q-5)                | Politique d'éviction compatible BullMQ à vérifier    |

Sources refusées ou fermées, à ne pas réintroduire sans nouvelle vérification : LinkedIn, Indeed,
Glassdoor, Welcome to the Jungle, SmartRecruiters, Ashby, SAP SuccessFactors, Google (SERP). [CONTRAINTE]

---

## 15. Sécurité

- **Secrets** : jamais dans le dépôt ni dans `.env.example`. Un hook de pré-commit les bloque. Un
  incident de clé Brave a déjà eu lieu et est traité. [CONFIRMÉ]
- **Variables de secrets connues** : `INTERNAL_API_KEY`, `DATABASE_URL` (contient le mot de passe),
  `REDIS_URL`, `BRAVE_SEARCH_API_KEY`, `FRANCETRAVAIL_CLIENT_*`, `TELEGRAM_BOT_TOKEN`. Nouvelle :
  `APIFY_API_TOKEN` [PROPOSITION].
- **Clé privée** : comparaison à temps constant ; relayée par le proxy serveur Next ; jamais dans le
  navigateur autre que sa mémoire locale de confort.
- **Base en ligne** : TLS obligatoire, rôle applicatif dédié, mot de passe fort, accès réseau restreint si
  le fournisseur le permet. [PROPOSITION]
- **Exposition** : seul le web est publié. L'API, Redis et Ollama ne sont jamais exposés directement.
  [CONFIRMÉ, deployment.md]
- **Identité de robot** : `FinditBot/0.1 (+https://github.com/Nagoloum/Findit)`, jamais masquée. [CONTRAINTE]
- **Upload** : taille, type et extraction bornés. Rate limiting : à faire (roadmap phase 12). [CONFIRMÉ]
- **Données personnelles** : minimisation, suppression testée, rétention documentée (RM-008).

---

## 16. Notifications

- Telegram : alertes de nouvelles offres uniquement. Jamais de message « aucune offre ». Idempotence par
  empreinte. Simulation tant que `TELEGRAM_NOTIFICATIONS_ENABLED` et `TELEGRAM_DRY_RUN` ne sont pas
  réglés pour un envoi réel. [CONFIRMÉ]
- Les commandes du bot ne révèlent aucune donnée privée sans vérification. [CONFIRMÉ]

---

## 17. Administration et observabilité

- Pas d'interface d'administration. Les journaux (`ConnectorRun`, `ConnectorError`, `ProcessingLog`) font
  foi. [DÉDUIT]
- À faire : métriques par cycle (identifiant de corrélation, durée, compteurs, erreurs) sans CV ni token.
  (roadmap phase 14)

---

## 18. Recherche, filtres, données

- Recherche texte, filtres (métier, contrat, département, présence, fraîcheur), pagination, tri par date.
- Recherche par CV : matching de toutes les offres publiées, tri par score. [CONFIRMÉ, UX v3]
- Volume actuel : quelques milliers d'offres vues par cycle ; index à optimiser selon l'usage réel (phase 14). [DÉDUIT]

---

## 19. Tests

| Niveau          | Quoi                                                      | Quand                           | Critère                           |
| --------------- | --------------------------------------------------------- | ------------------------------- | --------------------------------- |
| Unitaire        | Normalisation, classification, score, garde-fou, `robots` | À chaque changement             | Vitest vert                       |
| Intégration API | Routes gardées, 401, 404, 409, validation                 | À chaque route                  | Vitest vert                       |
| Base réelle     | Migrations, cascade, purge                                | Avant chaque mise en production | Compteurs attendus                |
| Connecteur      | Doubles de `fetch` (tests) ; un run réel borné            | Avant activation d'une source   | Zéro échec, données en base       |
| Apify           | Double de l'API Apify ; un run réel plafonné              | Avant activation d'un acteur    | Budget respecté, source autorisée |
| Base en ligne   | `migrate deploy` sur base vide puis sur base remplie      | Avant bascule                   | Diff de schéma vide               |
| E2E             | Parcours public (liste, filtres, détail)                  | Avant mise en production        | Port 3100                         |
| Sécurité        | Routes privées sans clé, upload hors limites              | Avant mise en production        | Refus systématique                |

Porte qualité (commande réelle, roadmap §11) : `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
`pnpm test`, `pnpm build`. Les doublures de test sont acceptées, à condition d'être nommées comme telles.
[CONFIRMÉ, HANDOFF §2]

---

## 20. Déploiement

- **Local** : `pnpm infra:up`, migrations, registre, `pnpm dev`. [CONFIRMÉ]
- **Production** : hébergement non choisi (Q-6). Contraintes : web publié en HTTPS ; API, worker et Redis
  non exposés ; migrations sans réinitialisation ; retour arrière par commit précédent.
- **Ordre de mise en ligne proposé** [PROPOSITION] :
  1. Base en ligne, données de référence transférées, bascule en local (F-016).
  2. Worker sur hôte toujours allumé (sans cela, le cron de 4 h ne tourne que quand le poste est allumé).
  3. Web et API publiés.

---

## 21. Monitoring et maintenance

- Sauvegardes : celles du fournisseur de base, rétention à documenter. Un `pg_dump` manuel avant chaque
  migration. [PROPOSITION]
- Veille des sources : `Connector.termsCheckedAt` ; une vérification de plus de trois mois doit être refaite
  avant d'être considérée comme autorisée. [CONFIRMÉ, legal-compliance.md]
- Veille des coûts Apify : tableau de bord du compte Apify, plafond configuré (RM-012). [PROPOSITION]
- Mises à jour des dépendances : par lot, suivies des cinq contrôles qualité (section 19).

---

## 22. Contraintes

- [CONTRAINTE] Registre de conformité : aucune collecte sans permission constatée et datée.
- [CONTRAINTE] Brave : résultats transitoires, jamais stockés.
- [CONTRAINTE] Lever : `ai-train=no` ; aucune offre Lever ne sert à entraîner un modèle.
- [CONTRAINTE] Ports : web 3100, API 4000. Ne jamais toucher au port 3000 (autre projet sur la machine).
- [CONTRAINTE] Typographie : aucun tiret cadratin ni demi-cadratin. Le tiret simple « - » seul.
- [CONTRAINTE] Commits et pushs seulement sur demande explicite.
- [CONTRAINTE] Environnement de développement : Windows 11, PowerShell, Node 24.18, pnpm 11.13.1.
- [CONFIRMÉ] Choix déjà acté : IA locale Ollama, `qwen2.5:7b`, aucun appel sortant.

---

## 23. Risques

| ID  | Risque                                                           | Probabilité                    | Impact | Niveau   | Mitigation                                                           |
| --- | ---------------------------------------------------------------- | ------------------------------ | ------ | -------- | -------------------------------------------------------------------- |
| R-1 | Un acteur Apify couvre une plateforme refusée (LinkedIn, Indeed) | Élevée                         | Élevé  | Critique | RM-010 ; liste d'acteurs validée avant usage                         |
| R-2 | Un acteur Apify contourne `robots.txt` ou change d'identité      | Moyenne                        | Élevé  | Élevé    | Proxies off, identité annoncée, vérification de la fiche de l'acteur |
| R-3 | Données privées exposées par une base en ligne mal configurée    | Moyenne                        | Élevé  | Élevé    | TLS, rôle dédié, décision Q-1, test d'accès                          |
| R-4 | Coût Apify qui dérape                                            | Moyenne                        | Moyen  | Moyen    | Plafond par cycle, `maxItems` par run                                |
| R-5 | Worker non disponible hors du poste                              | Élevée si hébergé sur le poste | Élevé  | Élevé    | Hôte toujours allumé (Q-6)                                           |
| R-6 | IA locale inaccessible depuis le web public                      | Élevée                         | Moyen  | Élevé    | Fonctions IA réservées à l'espace du propriétaire ; décision Q-2     |
| R-7 | Documentation en retard sur le code                              | Élevée                         | Faible | Moyen    | Section 26, C-6 ; mise à jour dans chaque brique                     |
| R-8 | Ordre de la fenêtre de fraîcheur mal compris                     | Moyenne                        | Faible | Faible   | Section 26, C-3                                                      |

---

## 24. Hypothèses

- H-1 [DÉDUIT] Le propriétaire est le seul utilisateur du flux privé pendant la V1.
- H-2 [DÉDUIT] Le volume d'offres reste de l'ordre de quelques milliers vues par cycle ; une base
  modeste suffit.
- H-3 [PROPOSITION] La base en ligne est un PostgreSQL géré compatible Prisma et pgvector.
- H-4 [À CONFIRMER] Le compte Apify utilisé est le compte du propriétaire, plan gratuit actuel.

---

## 25. Questions ouvertes

| ID  | Question                                                                                                   | Pourquoi c'est important                                           | Défaut proposé                                                                                                            | Modifiable plus tard ?  |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Q-1 | Les données privées (profil, CV, lettres, candidatures) peuvent-elles être écrites sur une base en ligne ? | Conditionne la conformité et la confidentialité du CV              | Publier d'abord les offres publiques ; garder le privé en local jusqu'à chiffrement validé                                | Oui                     |
| Q-2 | L'IA reste-t-elle locale même si le site est public ?                                                      | Ollama ne sort pas du poste ; le site public ne peut pas l'appeler | Oui : IA locale, fonctions IA réservées au propriétaire                                                                   | Oui                     |
| Q-3 | Quel fournisseur de base en ligne ?                                                                        | Coût, pgvector, outils disponibles                                 | Neon (PostgreSQL géré, outils MCP déjà connectés)                                                                         | Oui, par `DATABASE_URL` |
| Q-4 | Quelles sources Apify sont autorisées ?                                                                    | Évite la collecte interdite                                        | **TRANCHÉE le 2026-10-05** : tous les job boards nommés, sous le régime toléré `OWNER_ACCEPTED_SCRAPING` (voir §26, C-1). | Non                     |
| Q-5 | Redis reste-t-il local ou devient-il géré ?                                                                | Le worker en a besoin en permanence                                | Géré si le worker est hébergé ; local sinon                                                                               | Oui                     |
| Q-6 | Où héberger web, API et worker ?                                                                           | Le cron de 4 h doit tourner sans le poste                          | Hébergeur à choisir ; pas de choix imposé ici                                                                             | Oui                     |
| Q-7 | Fenêtre de fraîcheur : 24 h, 72 h, ou les deux offerts ?                                                   | Voir C-3                                                           | 3 jours par défaut, filtre 24 h conservé                                                                                  | Oui                     |
| Q-8 | Durée de conservation des candidatures et de leur historique                                               | Obligation de suppression (RM-008)                                 | Tant que l'utilisateur ne supprime pas, avec revue annuelle                                                               | Oui                     |

---

## 26. Contradictions détectées

Aucune n'est masquée. Chacune demande une décision ou une vérification.

**C-1 - Apify contre le registre**

- **A** : l'objectif Apify est de « rechercher des offres » avec un outil de scraping. [CONFIRMÉ]
- **B** : le registre refuse LinkedIn, Indeed, Glassdoor, WTTJ, et interdit la falsification d'identité et les
  proxies rotatifs. [CONTRAINTE]
- **Constat** : la recherche Apify la plus directe (« job postings ») renvoie en tête des acteurs LinkedIn.
  Plusieurs acteurs annoncent des proxies et une identité navigateur.
- **Impact** : collecte interdite, risque juridique et de blocage.
- **Proposition** : Apify limité aux sources déjà au registre comme autorisées ; aucun acteur LinkedIn, Indeed,
  Glassdoor ou WTTJ ; proxies désactivés.
- **Décision nécessaire** : Q-4.
- **Décision prise le 2026-10-05 (propriétaire)** : la proposition ci-dessus est écartée. Les job boards sont
  collectés sous le régime `OWNER_ACCEPTED_SCRAPING` (accès toléré, risque assumé), avec les garde-fous de
  `docs/legal-compliance.md` : ni compte, ni cookie, ni CAPTCHA contourné, ni acteur annonçant un contournement
  d'anti-bot, URL d'origine obligatoire. Les règles RM-010 et RM-011 sont réécrites en conséquence (TASK-301,
  suite).

**C-2 - Apify contre les ATS non autorisés**

- **A** : certains acteurs agrègent Greenhouse, Lever, Workable mais aussi Ashby, SmartRecruiters, Personio,
  Recruitee, Breezy, Teamtailor, Oracle HCM, Rippling. [CONSTAT, fiches Apify lues ce jour]
- **B** : Ashby et SmartRecruiters sont `DISABLED_PENDING_PERMISSION` ; Personio, Recruitee, Teamtailor n'ont
  jamais été vérifiés. [CONTRAINTE]
- **Impact** : un acteur mal configuré collecte une source fermée.
- **Proposition** : filtre de plateforme imposé dans l'entrée de l'acteur, et vérification de la sortie
  (`atsKind` contrôlé avant ingestion).
- **Décision nécessaire** : aucune ; implémentation.

**C-3 - Fenêtre de fraîcheur**

- **A** : spécification initiale : 24 h par défaut, 72 h au maximum. [CONFIRMÉ, spec 2026-07-16]
- **B** : ordre du 2026-07-27 : 3 jours par défaut, tri récent d'abord. [CONFIRMÉ, roadmap phase 19]
- **Constat** : `README.md` dit encore 24 h par défaut ; 3 jours équivaut au maximum de 72 h.
- **Décision nécessaire** : Q-7.

**C-4 - Base en ligne contre « rien ne sort du poste »**

- **A** : base en ligne demandée. [CONFIRMÉ]
- **B** : décision du 2026-07-17 et du 2026-07-24 : rien ne quitte le poste, notamment CV et offres. [CONFIRMÉ]
- **Impact** : les données privées quitteraient le poste si elles sont écrites en ligne.
- **Proposition** : publier d'abord les offres publiques ; décider pour le privé (Q-1). La règle « rien ne sort »
  visait les fournisseurs d'IA ; elle doit être réécrite explicitement si le privé part en ligne.
- **Décision nécessaire** : Q-1.

**C-5 - Site public contre IA locale**

- **A** : site public hébergé. [PROPOSITION de la section 11]
- **B** : IA locale sans appel sortant, Ollama jamais exposé. [CONFIRMÉ]
- **Impact** : le site hébergé ne peut pas appeler Ollama du poste ; la structuration et la lettre ne marcheront
  que depuis le poste allumé.
- **Décision nécessaire** : Q-2.

**C-6 - Documentation en retard**

- **Constat initial (2026-10-05)** : `docs/architecture.md` disait encore que Workable n'est pas exécuté
  par le cycle et que la déduplication n'est pas persistée ; `HANDOFF.md` mentionnait un espace `/espace`
  qui n'existe plus depuis l'UX v3 ; `README.md` annonçait 24 h de fraîcheur par défaut.
- **Corrigé le 2026-10-06** : `README.md`, `docs/architecture.md` et `HANDOFF.md` sont réalignés sur le
  code réel, et ce document l'est aussi sur Q-4, le périmètre et sa synthèse.
- **Reste ouvert** : la roadmap porte une case « Ajouter les commandes Telegram » (phase 11) encore
  décochée, alors que la phase 17 les marque livrées et que `apps/worker/src/telegram/` les contient.
  Une case ne se coche que par le propriétaire.

**C-7 - Hébergement du worker**

- **A** : cron toutes les 4 h, `JOB_COLLECTION_TIMEZONE=Europe/Paris`. [CONFIRMÉ]
- **B** : le worker tourne aujourd'hui sur le poste. [DÉDUIT]
- **Impact** : pas de collecte quand le poste est éteint.
- **Décision nécessaire** : Q-6.

---

## 27. Traçabilité

| Besoin                   | Exigence                       | Fonctionnalité | Écran    | API / données                     | Test / recette                          |
| ------------------------ | ------------------------------ | -------------- | -------- | --------------------------------- | --------------------------------------- |
| Offres publiques fiables | EF-001, EF-002                 | F-001, F-004   | E-1, E-2 | `GET /api/jobs*`, `Connector`     | Garde-fou ; recette sur base réelle     |
| Collecte légale          | EF-002, EF-003, RM-004, RM-005 | F-003, F-005   | -        | `ConnectorRun`                    | Tests `robots`, registre                |
| Base en ligne            | EF-009                         | F-016          | -        | `DATABASE_URL`, migrations        | TASK-202, TASK-203                      |
| Apify                    | EF-010, RM-010 à RM-013        | F-017          | -        | `ConnectorRun`, `APIFY_API_TOKEN` | TASK-301 à TASK-306                     |
| Score explicable         | EF-004                         | F-011          | E-2      | `SourceResumeMatch`               | Tests moteur ; preuve réelle 2026-07-25 |
| Lettre factuelle         | EF-005, RM-007                 | F-012, F-013   | E-2      | `SourceCoverLetter`               | Garde-fou ; preuve réelle 2026-07-26    |
| Suivi candidature        | EF-007                         | F-014          | E-3      | `Application`, `ApplicationEvent` | Tests API + base                        |
| Données personnelles     | EF-006, RM-008                 | F-010          | E-1      | `SourceResume`                    | Preuve réelle 2026-07-25                |

---

## 28. Synthèse

- Le produit fonctionne, et la base est passée **en ligne** (Neon, TLS obligatoire). Ce qui reste pour une
  mise en ligne propre : **un hébergeur pour le worker** - sans lui, pas de collecte quand le poste est
  éteint - et **la décision sur les données privées** (Q-1), qui n'est plus théorique puisque
  l'application écrit tout ce qu'elle produit dans la base en ligne.
- Apify est tranché (Q-4) et le moteur est livré : registre rouvert, acteurs épinglés par source, garde de
  budget prouvée, un premier job board monté mais éteint. Ce qui manque n'est plus une autorisation, mais
  une décision d'affichage public.
- Le chantier correspondant vit dans [roadmap.md](roadmap.md), phases 20 à 25.

**Livrables non produits** : `CAHIER_DES_CHARGES.pdf` (aucun outil de conversion vérifié dans l'environnement).
