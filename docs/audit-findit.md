# Audit Findit : réintroduction d'un espace candidat enrichi

Date de l'audit : 2026-10-19. Périmètre : lecture seule, aucun fichier modifié (hors ce rapport).

Objectif : identifier précisément les points d'intégration pour réintroduire un espace candidat
enrichi (profil, import/parsing CV, génération de CV en 3 modèles PDF/DOCX, lettres de motivation,
scoring de documents), en s'appuyant sur l'existant et sur l'ancien espace candidat supprimé par le
pivot du 2026-10-06.

Résumé en une ligne : le pivot du 2026-10-06 (commit `84324fa`) a supprimé tout l'espace privé
(tables, paquets `@findit/documents`, `@findit/matching-engine`, `@findit/resume-parser`, routes API,
pages web), mais a conservé un socle réutilisable : un `Profile` singleton, un matching CV/offre
fonctionnel (`@findit/matching` + `apps/api/src/matching`), un client DeepSeek avec suivi de coût
(`@findit/ai`), et un design system complet en CSS custom.

---

## 1. Schéma Prisma

Fichier : `packages/database/prisma/schema.prisma` (1 051 lignes). Client Prisma 7 (provider
`prisma-client`, sortie générée dans `packages/database/src/generated/prisma`, `binaryTargets`
`native` + `rhel-openssl-3.0.x`). PostgreSQL.

### 1.1 Enums

| Enum                                                                                                                               | Valeurs                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ContractType`                                                                                                                     | `ALTERNANCE`, `INTERNSHIP` (2 seulement, commenté « Seuls ces deux contrats sont dans le périmètre »)                                                                                           |
| `RoleCategory`                                                                                                                     | `FRONTEND`, `BACKEND`, `FULLSTACK`, `SOFTWARE_ENGINEERING`, `OTHER_DEVELOPER`, `MOBILE`, `DATA_ANALYST`, `DATA_ENGINEER`                                                                        |
| `WorkMode`                                                                                                                         | `ONSITE`, `HYBRID`, `REMOTE`                                                                                                                                                                    |
| `SalaryPeriod`                                                                                                                     | `HOUR`, `MONTH`, `YEAR`                                                                                                                                                                         |
| `JobStatus`                                                                                                                        | `DISCOVERED`, `FETCHED`, `NORMALIZED`, `VALIDATED`, `QUARANTINED`, `REJECTED`, `DUPLICATE`, `PUBLISHED`, `EXPIRED`, `SOURCE_UNAVAILABLE`                                                        |
| `SkillKind`                                                                                                                        | `PROGRAMMING_LANGUAGE`, `FRAMEWORK`, `DATABASE`, `CLOUD_TOOL`, `DEV_TOOL`, `SOFT_SKILL`, `LANGUAGE`                                                                                             |
| `SkillRequirement`                                                                                                                 | `REQUIRED`, `PREFERRED`                                                                                                                                                                         |
| `AtsKind`                                                                                                                          | Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Workday, Teamtailor, Recruitee, Taleo, SAP SuccessFactors, WelcomeKit, Flatchr, JobTeaser, France Travail, `OTHER`, `UNKNOWN`, `JOB_BOARD` |
| `SourceAccessStatus`                                                                                                               | `OFFICIAL_API`, `PUBLIC_FEED`, `AUTHORIZED_CRAWL`, `SEARCH_ENGINE_DISCOVERY_ONLY`, `MANUAL_IMPORT`, `DISABLED_PENDING_PERMISSION`, `PROHIBITED`, `OWNER_ACCEPTED_SCRAPING`                      |
| `CompanyKind`                                                                                                                      | `EMPLOYER`, `SCHOOL`, `TRAINING_ORGANISATION`, `BOOTCAMP`, `RECRUITMENT_AGENCY`, `UNKNOWN`                                                                                                      |
| `DecisionSource`                                                                                                                   | `RULE`, `AI`, `HUMAN`                                                                                                                                                                           |
| `ConnectorStatus` / `ConnectorRunStatus` / `DuplicateAction` / `ClassificationOutcome` / `NotificationType` / `NotificationStatus` | voir fichier                                                                                                                                                                                    |
| `SourceType`                                                                                                                       | `CAREER_SITE`, `JOB_BOARD`, `API`, `RSS`, `SEARCH_ENGINE`                                                                                                                                       |
| `AgentRunStatus`                                                                                                                   | `RUNNING`, `SUCCEEDED`, `FAILED`, `STOPPED`                                                                                                                                                     |
| `MemoryKind`                                                                                                                       | `VISITED_URL`, `ANALYZED_URL`, `SEARCH_QUERY`, `SOURCE_PATTERN`                                                                                                                                 |
| `CrawlJobStatus` / `CrawlPageStatus`                                                                                               | voir fichier                                                                                                                                                                                    |

### 1.2 Modèles (31 modèles, aucun `User`)

- Entreprises et offres : `Company`, `Job`, `JobSource`, `Skill`, `JobSkill`, `CompanyAlias`,
  `CompanySource`, `CompanyClassification`, `SkillAlias`, `Source`, `Contact`.
- Collecte et conformité : `Connector`, `ConnectorRun`, `ConnectorError`, `JobSourceSnapshot`.
- Décisions et journal : `DuplicateGroup`, `DuplicateDecision`, `JobClassificationDecision`,
  `SchoolDetectionDecision`, `FraudDetectionDecision`, `ProcessingLog`, `PromptVersion`,
  `TelegramJobNotification`.
- Agent autonome : `AgentRun`, `AgentAction`, `AgentError`, `AgentMemory`, `SearchQuery`,
  `CrawlJob`, `CrawlPage`, `Extraction`.
- Matching et profil : `ModelCall`, `MatchingRun`, `Profile`.

### 1.3 Le modèle `Job` (équivalent du « JobPosting » évoqué)

`packages/database/prisma/schema.prisma:115`. Champs clés :

- `title`, `normalizedTitle`, `roleCategory`, `description`, `responsibilities[]`, `requirements[]`,
  `benefits[]`.
- `contractType` (enum 2 valeurs), `workMode`, `city`, `departmentCode`, `postalCode`, `latitude`,
  `longitude`.
- `salaryMin`, `salaryMax`, `salaryPeriod`, `salaryText`, `studyLevel`, `startDate`, `duration`.
- `publishedAt`, `firstSeenAt`, `lastSeenAt`, `updatedAt`, `expiresAt` (commenté « publishedAt + 72 h.
  Stocké pour que l'expiration soit indexable »).
- `canonicalUrl`, `applyUrl`, `externalId`, `requisitionId`.
- `schoolRiskScore`, `schoolRiskReasons[]`, `fraudRiskScore`, `fraudRiskReasons[]`,
  `dataQualityScore`, `confidenceScore`, `status`, `isDemo`.

### 1.4 Le modèle `Profile` (le seul reliquat « candidat » actuel)

`packages/database/prisma/schema.prisma:1030`. Singleton d'identifiant `"default"` (voir
`ProfileService`). Champs :

- `fullName`, `headline`, `email`, `phone`, `city`.
- `links Json` (`[{ label, url }]`), `skills String[]`.
- `languages Json` (`[{ name, level }]`), `experiences Json`
  (`[{ title, company, period, description }]`).
- `cvText String?` (texte brut collé, pas un fichier).
- `createdAt`, `updatedAt`.

Ce que `Profile` ne contient pas (à réintroduire) : certifications, formation (`education`), projets
structurés, un fichier CV (binaire/PDF/DOCX), un historique de candidatures, des lettres, et toute
notion multi-utilisateurs.

### 1.5 Modèles de matching actuels

- `ModelCall` (`schema.prisma:973`) : journal d'un appel hors agent. `purpose` (« cv-matching »),
  `model`, `inputTokens`, `outputTokens`, `costMicroUsd`, `correlationId`, `createdAt`.
- `MatchingRun` (`schema.prisma:1002`) : `cvText`, `jobCount`, `bestScore`, `items Json`, `createdAt`.
  Rétention `MATCHING_RETENTION_HOURS` (défaut 72 h), purgée à chaque écriture.

### 1.6 Points d'intégration (schéma)

- Étendre `ContractType` (section 7) impacte l'enum Prisma, `@findit/shared`, la classification et
  l'extraction.
- Réintroduire un espace candidat enrichi nécessite de nouvelles tables (ou la récupération des
  anciennes, section 2) : CV structuré, lettres, candidatures, scoring de documents.
- `Profile` peut être étendu de façon additive (certifications, formation, projets) ou remplacé par
  une réintroduction de `CandidateProfile` + `SourceResume` (l'ancienne séparation profil / CV source).

---

## 2. Historique Git de l'ancien espace candidat

### 2.1 Le commit de suppression

- `84324fa` « feat(agent): rewrite Findit into the Web Intelligence Agent », 2026-10-06 08:34:33 +0200.
- Migration associée : `packages/database/prisma/migrations/20261006120000_agent_and_remove_private/`.
- Ce commit renomme `packages/matching-engine` en `packages/agent`, `packages/documents` en
  `packages/crawler`, supprime `packages/resume-parser`, et retire toutes les routes/pages privées.
- Bilan : 171 fichiers, +6 245 / -11 780 lignes.

### 2.2 Tables supprimées par la migration

`20261006120000_agent_and_remove_private/migration.sql` contient les `DROP TABLE` :

`Application`, `ApplicationEvent`, `CandidateProfile`, `CoverLetter`, `JobMatch`, `Resume`,
`ResumeAnalysis`, `SourceCoverLetter`, `SourceResume`, `SourceResumeMatch`.

Enums supprimés : `ApplicationStatus`, `CoverLetterTone`, `ResumeFileType`, `ResumeStatus`.

### 2.3 Ancien schéma candidat (récupéré des migrations antérieures)

- `CandidateProfile` (`20260717160000_candidate_profile`) : singleton `"owner"`, `fullName`, `email`,
  `phone`, `city`, `targetRoles[]`, `availability`, `studyProgram`, `school`, `workStudyRhythm`,
  `portfolioUrl`, `githubUrl`, `linkedinUrl`, `languages Json`, `preferences Json`, `activeResumeId`.
- `Resume` (`20260717010858_pipeline_compliance_and_resume`) : fichier importé côté navigateur,
  `browserSessionId`, `fileType`, `fileSize`, `storageKey`, `contentHash`, `status`
  (`UPLOADED/PARSED/PARSE_FAILED/DELETED`), `expiresAt`, `deletedAt`.
- `ResumeAnalysis` : `resumeId`, `headline`, `summary`, `yearsExperience`, `studyLevel`, `location`,
  `availability`, `extractedFacts Json`, `warnings[]`, `confidence`, `analysedBy`.
- `JobMatch` : `resumeId`, `jobId`, `score`, `scoreBreakdown Json`, `matchedSkills[]`,
  `missingSkills[]`, `missingKeywords[]`, `strengths[]`, `weaknesses[]`, `recommendations[]`,
  `confidence`, `insufficientDataWarning`, `computedBy`.
- `CoverLetter` : `resumeId`, `jobId`, `matchId`, `tone` (enum 4 valeurs), `subject`, `body`,
  `usedResumeFacts Json`, `editedByUser`, `expiresAt`, `generatedBy`.
- `SourceResume` (`20260717170000_source_resume`) : CV source privé, `fileType` (PDF/DOCX/TXT),
  `originalFileName`, `fileSize`, `contentHash`, `extractedText`.
  - `20260724190000_source_resume_structure` ajoute `structuredFacts Json`, `structuredWarnings[]`,
    `structuredConfidence`, `structuredAt`.
  - `20260724203000_source_resume_retention` ajoute `expiresAt` (rétention 24 h par défaut historique).
- `SourceResumeMatch` (`20260725050000_source_resume_match`) : score CV source / offre calculé par
  règles, `score`, `scoreBreakdown Json`, `matchedSkills[]`, `missingSkills[]`, etc. Unique
  `(sourceResumeId, jobId)`.
- `SourceCoverLetter` (`20260726100000_source_cover_letter`) : `subject`, `paragraphs[]`,
  `usedFacts[]`, `warnings[]`, `computedBy`. Unique `(sourceResumeId, jobId)`.
- `Application` / `ApplicationEvent` (`20260726210000_application_tracking`) : suivi des candidatures,
  `jobSlug`, `jobTitle`, `companyName`, `resumeFileName`, `matchScore`, `letterSubject`,
  `letterParagraphs[]`, `status` (6 valeurs), `notes`, `appliedAt`, et un historique `ApplicationEvent`.

### 2.4 Fichiers supprimés les plus intéressants (récupérés via `git show 84324fa~1:<path>`)

Paquet `@findit/documents` (rendu PDF via `@react-pdf/renderer` 4.5.1, extraction via `unpdf` +
`mammoth`) :

- `packages/documents/src/render.tsx` : `renderCvPdf`, `renderCoverLetterPdf` (déterministes, sans IA).
- `packages/documents/src/cv-document.tsx` (343 lignes) : composant React `CvDocument` A4, une page,
  Helvetica, accent bleu `#1d4ed8`, sections Profil / Compétences / Expériences / Projets / Formation
  / Langues / Certifications, liens cliquables, dates à droite bornées à 38 %.
- `packages/documents/src/letter-document.tsx` (64 lignes) : `CoverLetterDocument`, formules d'adresse
  et de politesse fixes, corps par paragraphes.
- `packages/documents/src/cv-data.ts` : types `CvDocumentData`, `CvIdentity`, `CvExperience`,
  `CvProject`, `CvEducation`, `CvSkill` (avec `category`), `CvLanguage`, `CvCertification`, `CvLink`.
- `packages/documents/src/letter-data.ts` : `CoverLetterDocumentData`.

API :

- `apps/api/src/resume/structured-resume.ts` (242 lignes) : schémas Zod complets des faits structurés
  d'un CV (`resumeFactsSchema`, `structuredResumeSchema`), et garde-fou anti-invention des dates
  (`sanitizeDatesAgainstSource`).
- `apps/api/src/resume/extract-text.ts` (84 lignes) : `extractResumeText` (PDF via `unpdf`, DOCX via
  `mammoth`, TXT UTF-8), `resumeFileType`, erreur `ResumeExtractionError`.
- `apps/api/src/documents/documents.service.ts` : `renderCv` (relit `SourceResume`, purge la
  rétention, valide les faits, rend le PDF, nomme le fichier `cv-<slug>.pdf`).
- `apps/api/src/documents/documents.controller.ts` : `GET /api/resumes/:id/documents/cv.pdf`.
- `apps/api/src/letters/letters.service.ts` (359 lignes) : génération de lettre « factuelle », prompt
  système anti-invention, `LetterInventsFactsError` (refus si la lettre cite une compétence absente du
  CV), `ResumeNotStructuredForLetterError`.
- `apps/api/src/workspace/workspace.guard.ts` + `workspace-key.ts` : garde `x-workspace-key` en
  comparaison temps constant (précurseur du `ProfileKeyGuard` actuel).
- `apps/api/src/applications/`, `apps/api/src/resume/`, `apps/api/src/profile/` (ancien), `matching/`
  (ancien, 263 lignes, basé sur `@findit/matching-engine`).

Web :

- `apps/web/src/components/workspace/*` : `workspace-panel.tsx`, `cv-search.tsx`, `offer-match.tsx`,
  `match-card.tsx`, `skill-triage.tsx`, `resume-card.tsx`, `letter-card.tsx`, `application-panel.tsx`,
  `application-card.tsx`, `applications-panel.tsx`.
- `apps/web/src/lib/workspace-api.ts` (303 lignes) : client de l'espace privé.
- `apps/web/src/app/espace/page.tsx`, `apps/web/src/app/candidatures/page.tsx`,
  `apps/web/src/app/api/ws/[...path]/route.ts`.

Paquet `@findit/matching-engine` (ancien matching par règles, supprimé au profit du matching LLM) :

- `score.ts` (361 lignes) : score déterministe multi-critères avec poids renormalisés
  (`required_skills`, `preferred_skills`, `title_alignment`, `languages`), `MatchResult` complet avec
  `breakdown` et `confidence`.
- `tech-dictionary.ts` (184 lignes) : `canonicalizeSkill`, `detectSkillsInText`, dictionnaire de
  technologies avec alias.
- `normalize.ts`, `score.test.ts`, `normalize.test.ts`.

### 2.5 Ce qui est récupérable / réutilisable

- **Rendu PDF** : `packages/documents` est directement récupérable (composants React + `render.tsx`).
  Il fournit déjà un modèle de CV et un modèle de lettre. Pour « 3 modèles PDF/DOCX », le modèle
  `cv-document.tsx` sert de premier modèle ; il faut en ajouter deux (variantes de style) et ajouter un
  export DOCX (non couvert par `@react-pdf/renderer`, qui ne produit que du PDF ; voir section 2.6).
- **Parsing CV** : `extract-text.ts` (PDF/DOCX/TXT) et `structured-resume.ts` (schémas Zod des faits +
  garde-fou anti-invention des dates) sont réutilisables tels quels.
- **Lettres** : `letters.service.ts` (génération factuelle avec refus anti-invention) est un modèle
  éprouvé, réutilisable en réadaptant l'injection de dépendances (`@findit/ai` actuel remplace
  l'ancien `AiDisabledError` / `StructuredRequest`).
- **Scoring de documents** : `@findit/matching-engine` (score par règles, déterministe, explicable)
  est récupérable et complémentaire du matching LLM actuel. `tech-dictionary.ts` est précieux pour un
  scoring de documents par compétences.
- **Candidatures** : les tables `Application` / `ApplicationEvent` et les composants
  `application-*.tsx` sont une base directe pour le suivi des candidatures.
- **Garde d'accès** : `workspace.guard.ts` (temps constant) est le précurseur exact du
  `ProfileKeyGuard` actuel ; inutile de le ressusciter, le mécanisme existe déjà.

### 2.6 Limite identifiée (export DOCX)

L'ancien espace ne produisait que du **PDF** (`@react-pdf/renderer`). Le rapport
`docs/architecture.md:384` le confirme : « l'export DOCX n'existe pas ». La génération DOCX est donc
un ajout neuf (par exemple `docx` npm ou `python-docx` côté outillage), pas une récupération.

---

## 3. Package `@findit/matching`

Dossier : `packages/matching/src/`. Dépend de `@findit/ai` et `zod`.

### 3.1 `structure.ts` : `structureCv`

- `structureCv(cvText, model)` appelle `model.generateStructured` avec un schéma Zod
  `StructuredCvSchema` : `identity`, `experiences[]`, `projects[]`, `skills[]`, `languages[]`,
  `certifications[]`, `location`.
- Consigne système stricte : ne rien inventer, `skills` en chaînes courtes, `location` en ville/région.

### 3.2 `scores.ts` : sous-scores déterministes (sans modèle)

- `skillMatch(cv, offer)` : part des `requiredSkills` couvertes, 0-100. Direction « la compétence du CV
  contient la requise » (`React.js` couvre `React`, pas l'inverse).
- `locationMatch(cv, offer)` : 100 identique, 50 lié (même région), 0 sinon.
- `contractMatch(cv, offer)` : 100 si le contrat demandé figure dans le corpus du CV, 0 sinon.

### 3.3 `matching.ts` : `computeMatch`

- Calcule d'abord les 3 sous-scores, puis :
  - court-circuit sans matière (`cvHasMatter` / `offerHasMatter`) qui rend un score 0 avec
    avertissement ;
  - appel `model.generateStructured` avec `MatchOutputSchema` (score 0-100, `relevance`,
    `matchedSkills`, `missingSkills`, `strengths`, `weaknesses`, `recommendation`) ;
  - `sanitize` : garde-fou anti-invention (`keepGrounded`) qui retire toute compétence absente du CV
    ET de l'offre ;
  - ajoute le rappel `SCORE_INDICATIF` à la recommandation.
- `SCORE_INDICATIF = "Score indicatif : il ne remplace pas la décision d'un employeur."`

### 3.4 `types.ts` et API exposée

- `StructuredCv`, `JobOfferLite` (`title`, `description`, `requiredSkills`, `contract`, `location`),
  `MatchResult`.
- `index.ts` exporte `computeMatch`, `structureCv`, `SCORE_INDICATIF` et les types.

### 3.5 Points d'intégration (matching)

- `structureCv` est l'outil pour structurer un CV importé (profil, parsing CV) : il est déjà découplé
  du score (structurer une fois, scorer contre plusieurs offres).
- Le `StructuredCv` (texte libre) est plus pauvre que l'ancien `ResumeFacts` de
  `structured-resume.ts` (expériences avec dates/compétences, éducation, certifications, liens). Pour
  un CV enrichi structuré, réutiliser l'ancien `structured-resume.ts` plutôt que `structureCv`.
- `computeMatch` accepte un `JobOfferLite` ; `MatchingService` construit déjà ce type depuis `Job`
  (`apps/api/src/matching/matching.service.ts:80`). Un scoring de documents peut réutiliser
  `skillMatch` / `locationMatch` / `contractMatch` tels quels.

---

## 4. API matching et profil

### 4.1 Matching

`apps/api/src/matching/` :

- `matching.controller.ts` : `@Controller("api/matching")`.
  - `POST /api/matching/score` (HTTP 200, corps `{ cvText: string.min(1) }` via
    `ZodValidationPipe`) -> `MatchItem[]`.
  - `GET /api/matching/history` -> `MatchingRunSummary[]` (sans le CV).
  - `GET /api/matching/history/:id` -> `MatchingRunDetail` (avec `cvText` + `items`) ; 404 si inconnu,
    validation `matchingRunIdSchema`.
- `matching.service.ts` : `MatchingService`.
  - `score(cvText)` : crée un `DeepSeekModel`, `structureCv`, lit les 15 offres `PUBLISHED` les plus
    récentes (`orderBy publishedAt desc, take 15`), `computeMatch` sur chacune, trie par score
    décroissant, sauvegarde dans `MatchingRun`, et journalise le coût dans `ModelCall`
    (`purpose = "cv-matching"`).
  - `history(limit=20)`, `historyDetail(id)`, `#saveRun` (avec purge par rétention), `#recordModelCall`
    (diff d'usage avant/après, `computeCostMicroUsd`).
- `matching.module.ts` : module Nest, pas de garde d'accès (route publique, comme toutes les routes).

DTOs : définis inline en Zod (`scoreBodySchema`) dans le contrôleur ; types `MatchItem`,
`MatchingRunSummary`, `MatchingRunDetail` dans le service.

### 4.2 Profil

`apps/api/src/profile/` :

- `profile.controller.ts` : `@Controller("api/profile")` + `@UseGuards(ProfileKeyGuard)`.
  - `GET /api/profile` -> `ProfileView` (jamais 404, forme vide si absent).
  - `PUT /api/profile` -> `ProfileView` (écrit le singleton, upsert).
  - `ProfileKeyGuard` : compare l'en-tête `x-internal-key` en temps constant (`timingSafeEqual`) ;
    401 sinon, avant validation du corps.
  - `profileInputSchema` (Zod) : `fullName`, `headline?`, `email?`, `phone?`, `city?`, `links[]`,
    `skills[]`, `languages[]`, `experiences[]`, `cvText?`. Les listes structurées
    (`profileLinkSchema`, `profileLanguageSchema`, `profileExperienceSchema`) valident le JSON libre
    en base.
- `profile.service.ts` : `ProfileService`, singleton `PROFILE_SINGLETON_ID = "default"`.
  - `get()` rend `emptyProfile()` si absent, `save(input)` fait un upsert partiel (les champs absents
    ne sont pas écrits). Types `ProfileView`, `ProfileInput`, `ProfileLink`, `ProfileLanguage`,
    `ProfileExperience`.
- `profile.module.ts` : fournit `PROFILE_INTERNAL_KEY` via `parseApiEnv(process.env).INTERNAL_API_KEY`.

Le module profil est enregistré dans `apps/api/src/app.module.ts` (avec `MatchingModule`).

### 4.3 Points d'intégration (API)

- Le motif « garde serveur-à-serveur » (`ProfileKeyGuard` + `x-internal-key`) est le mécanisme à
  réutiliser pour toutes les nouvelles routes privées (CV, lettres, documents, candidatures).
- Le motif « singleton sans utilisateur » (`ProfileService`) est le point d'ancrage du profil enrichi.
  L'ajout de champs structurés (certifications, formation, projets) suit le même patron
  `ProfileInput` + `profileInputSchema` + `toView`.
- Les routes documents/lettres/candidatures supprimées se réintroduisent en nouveaux modules Nest
  (comme `MatchingModule`/`ProfileModule`), enregistrés dans `app.module.ts`.
- `MatchingService#recordModelCall` est le patron à généraliser pour tout nouvel appel IA (lettres,
  scoring de documents) afin de garder le coût mesurable via `ModelCall`.

---

## 5. Espace `/moi`

Dossier : `apps/web/src/app/moi/`.

- `page.tsx` : composant serveur `MySpacePage` (`dynamic = "force-dynamic"`).
  - Si `!isProfileConfigured()`, rend un panneau « espace personnel non configuré ».
  - Sinon lit `fetchProfile()` + `fetchMatchingHistory()` en parallèle, affiche : en-tête (nom,
    headline, ville/email/téléphone), sections Compétences (`skill-list`), Langues (`dashboard-list`),
    Expériences, Liens, CV (texte brut dans `<pre class="profile-cv">`), et Matchings passés.
  - Formulaire replié dans `<details class="filters-toggle">` : champs texte (nom, titre, ville,
    email, téléphone, compétences séparées par virgules, langues « nom | niveau », liens
    « libellé | url », expériences « titre | entreprise | période | description », CV collé).
- `actions.ts` : action serveur `saveProfileAction` (parsing des listes, appel `saveProfile`,
  `revalidatePath("/moi")`). Aucun secret ne descend dans la page.
- `apps/web/src/lib/profile-api.ts` : `fetchProfile`, `saveProfile`, `isProfileConfigured`,
  `EMPTY_PROFILE`, types `Profile`, `ProfileLink`, `ProfileLanguage`, `ProfileExperience`. Porte
  `x-internal-key` côté serveur uniquement (jamais dans le bundle client).
- `apps/web/src/lib/api.ts` : `fetchMatchingHistory` (et tout le client public).

### 5.1 Points d'intégration (web)

- `/moi` est la page d'accueil de l'espace candidat enrichi : elle lit déjà profil + matchings.
- Le formulaire actuel est « texte collé » ; l'import/parsing CV (fichier PDF/DOCX) remplace le champ
  `cvText` par un champ fichier, côté serveur (`actions.ts`), avec extraction via l'équivalent de
  `extract-text.ts`.
- Les composants supprimés `apps/web/src/components/workspace/*` sont récupérables pour les vues CV,
  lettres, candidatures (section 2.4).
- L'ancien `workspace-api.ts` (303 lignes) est le modèle du futur client privé, à réécrire sur le
  patron actuel `profile-api.ts` (garde serveur, jamais de clé côté client).

---

## 6. Package `@findit/ai`

Dossier : `packages/ai/src/`.

- `deepseek-client.ts` : `createDeepSeekModel(config)`.
  - Endpoint Anthropic-compatible : `https://api.deepseek.com/anthropic/v1/messages`, en-têtes
    `x-api-key` et `anthropic-version: 2023-06-01`.
  - `DeepSeekModel` expose `generateStructured<T>({ schema, prompt, system?, temperature? })` et
    `generateText({ prompt, system?, temperature? })`, plus `usage()`.
  - `generateStructured` injecte le schéma Zod (`z.toJSONSchema`) dans le prompt système, revalide la
    sortie (`schema.safeParse`), lève `AiOutputError` si `stop_reason === "max_tokens"` ou si le JSON
    est invalide/hors schéma.
  - Options `maxTokens` (défaut 8192), `thinking` (`disabled` par défaut, pour ne pas vider le budget
    de tokens sur une page longue).
  - `usage()` : compteurs cumulés `inputTokens`, `outputTokens`, `calls`, incrémentés dès la lecture
    de la réponse (même une sortie refusée est facturée).
- `usage.ts` : `computeCostMicroUsd(usage, pricing)` = arrondi de
  `inputTokens * inputUsdPerMillionTokens + outputTokens * outputUsdPerMillionTokens` (en
  micro-dollars). `EMPTY_USAGE`.
- `errors.ts` : `AiError`, `AiUnavailableError`, `AiOutputError`.
- `index.ts` : réexporte tout.

### 6.1 Points d'intégration (IA)

- Tout nouvel usage IA (structuration de CV enrichie, lettres, scoring de documents) passe par
  `createDeepSeekModel` + `generateStructured`, et doit journaliser son coût via le patron de
  `MatchingService#recordModelCall` (diff d'`usage()` avant/après, écriture `ModelCall`).
- Le tarif (`DEEPSEEK_INPUT_USD_PER_MTOK`, `DEEPSEEK_OUTPUT_USD_PER_MTOK`) est déjà déclaré dans
  `packages/config/src/env.ts` (schémas api et worker), optionnel.

---

## 7. Contrats et fraîcheur

### 7.1 Contrats

- Enum Prisma `ContractType` : `ALTERNANCE`, `INTERNSHIP` seulement
  (`packages/database/prisma/schema.prisma:23`).
- `@findit/shared` : `JOB_CONTRACTS = ["ALTERNANCE", "INTERNSHIP"]`
  (`packages/shared/src/job-scope.ts:1`), `DEFAULT_CONTRACTS = ["ALTERNANCE"]`.
- Classification : `packages/job-classification/src/contract.ts`.
  - `readContract(text)` reconnaît `ALTERNANCE` (vocabulaire FR/EN), puis `INTERNSHIP`, sinon
    `OUT_OF_SCOPE` (cdi, cdd, permanent, freelance, etc.).
  - `mentionsOutOfScopeContract(text)` sert à rejeter.
- Extraction (agent) : `packages/extract/src/contract.ts` (contrat côté extraction LLM) et
  `packages/extract/src/schema.ts` (`JobOffer`).

### 7.2 Fraîcheur (72 h actuellement)

- `packages/shared/src/job-scope.ts` :
  - `DEFAULT_MAX_AGE_HOURS = 24`, `EXTENDED_MAX_AGE_HOURS = 72`.
  - `FRESHNESS_WINDOWS = { LAST_24H, LAST_72H }`, `publishedAfterFor(window, now)`.
  - `endOfDayIfDateOnly` (élargit une date à minuit UTC à la fin de sa journée).
- Expiration calculée dans deux ingestions :
  - `packages/persist/src/persist.ts:222,249` (agent) : rejet si `ageHours > EXTENDED_MAX_AGE_HOURS`,
    `expiresAt = publishedAt + EXTENDED_MAX_AGE_HOURS`.
  - `packages/job-pipeline/src/ingest.ts:176,229` (connecteurs) : même logique.
- Lecture API :
  - `apps/api/src/jobs/job-query.ts:19` : `freshness: z.enum(["LAST_24H", "LAST_72H"]).default("LAST_72H")`.
  - `apps/api/src/jobs/jobs.service.ts:98,188,257-280` : filtre `publishedAt >= publishedAfterFor(...)`
    et `expiresAt > now`.
- Autres durées dérivées : `packages/job-connectors/src/linkedin.ts:29`
  (`LINKEDIN_FRESHNESS_HOURS = 72`), `france-travail.ts`, `workday.ts`, seed
  (`packages/database/prisma/seed.ts:36`), déduplication (`job-deduplication/src/similarity.ts:176`).

### 7.3 Points d'intégration (étendre à 6 catégories et 5 jours)

Pour passer à 6 catégories de contrat (aujourd'hui 2) :

1. `ContractType` dans `schema.prisma` (migration Prisma additive).
2. `JOB_CONTRACTS` dans `packages/shared/src/job-scope.ts`.
3. Vocabulaires dans `packages/job-classification/src/contract.ts` (ajouter les catégories aux listes
   `ALTERNANCE`/`INTERNSHIP`/`OUT_OF_SCOPE`, ou refactorer en table de catégories).
4. `packages/extract/src/contract.ts` et `schema.ts` (prompt d'extraction qui ne retient que
   l'alternance et le stage aujourd'hui).
5. `DEFAULT_CONTRACTS` et l'affichage des filtres (`apps/api/src/jobs`, `apps/web/src/lib/labels.ts`).
6. Le matching `contractMatch` (`packages/matching/src/scores.ts`) compare le contrat en texte libre,
   impact limité mais à vérifier.

Pour passer la fraîcheur à 5 jours (120 h, aujourd'hui 72 h) :

1. `EXTENDED_MAX_AGE_HOURS` dans `packages/shared/src/job-scope.ts` (ou ajouter une fenêtre
   `LAST_5D` à `FRESHNESS_WINDOWS` + `publishedAfterFor`).
2. `apps/api/src/jobs/job-query.ts` (enum de fraîcheur).
3. `packages/persist/src/persist.ts` et `packages/job-pipeline/src/ingest.ts` (borne de rejet et
   `expiresAt`).
4. `packages/job-connectors/src/linkedin.ts` / `france-travail.ts` / `workday.ts` (fenêtres dérivées).
5. Commentaire `Job.expiresAt` (« publishedAt + 72 h ») et `seed.ts`.

---

## 8. Classification et détection d'écoles

### 8.1 Classification (contrat, rôle, école)

`packages/job-classification/src/` :

- `classify.ts` : `classifyJob(input)` rend `{ outcome: ACCEPTED|REJECTED|QUARANTINED, contractType,
roleCategory, confidence, reasons }`.
  - Deux voix (titre + `commitmentLabel`) : `BOTH_AGREE=95`, `TITLE_ALONE=80`, `LABEL_ALONE=70`,
    `CONFLICT=40`.
  - `ROLE_NAMED=90`, `ROLE_GENERIC=70` (OTHER_DEVELOPER).
  - `confidence = min(contractConfidence, roleConfidence)`.
  - Contrat absent ou hors périmètre -> `REJECTED` ; métier absent -> `REJECTED` ; signaux contradictoires
    -> `QUARANTINED`.
- `role.ts` : `readRole(title)`, table `ROLE_TOKENS` ordonnée (FULLSTACK, MOBILE, DATA_ENGINEER,
  DATA_ANALYST, FRONTEND, BACKEND, SOFTWARE_ENGINEERING, OTHER_DEVELOPER), garde-fous
  `COMMERCIAL_PHRASES` et `ENGINEERING_MARKERS`.
- `contract.ts` : `readContract`, `mentionsOutOfScopeContract` (section 7).
- `normalize.ts` : `normalizeForMatching` (texte encadré d'espaces, espaces uniques).
- `index.ts` : exporte `classifyJob`, `readContract`, `readRole`, `detectSchoolRisk`.

### 8.2 Détection d'écoles

Deux implémentations complémentaires :

- `packages/job-classification/src/school.ts` : `detectSchoolRisk(input)` rend `SchoolDetection`
  (`kind`, `riskScore` 0-100, `excluded`, `reasons`).
  - `SCHOOL_NAME_TOKENS`, `KNOWN_SCHOOL_EMPLOYERS = ["iscod", "eemi", "iris"]` (liste citée, mesurée),
    `STRONG_TEXT_SIGNALS` (+35), `DECISIVE_TEXT_SIGNALS` (exclusion immédiate), `AGENCY_SIGNALS`
    (cabinet de recrutement, jamais une école).
  - Seuils : `REJECT_THRESHOLD=70`, `QUARANTINE_THRESHOLD=40`.
- `packages/extract/src/school.ts` : `looksLikeSchool(offer)` : garde-fou déterministe plus simple
  (mots d'école dans titre/entreprise, tournures de description), utilisé avant l'analyse LLM.

En base, les décisions sont tracées par `SchoolDetectionDecision`
(`riskScore`, `excluded`, `reasons`, `decidedBy`, `promptVersionId`) et `CompanyClassification`
(`kind`, `schoolRiskScore`, `reasons`).

### 8.3 Points d'intégration (classification/école)

- La réintroduction de l'espace candidat n'impacte pas la classification des offres (elle reste côté
  collecte). Mais le « scoring de documents » du candidat peut réutiliser `detectSkillsInText` /
  `canonicalizeSkill` (ancien `@findit/matching-engine`) plutôt que le matching LLM.
- Si l'extension à 6 contrats est faite, `classify.ts` et `contract.ts` doivent suivre (section 7).
- La détection d'écoles n'est pas concernée par l'espace candidat, sauf si l'on souhaite signaler au
  candidat qu'une offre est une école (le champ `Job.schoolRiskScore`/`schoolRiskReasons` et
  `Job.isDemo` existent déjà pour l'affichage).

---

## 9. Design system / identité visuelle

Il n'y a **pas de Tailwind** : aucun `tailwind.config.*` dans le dépôt. Le design system est du CSS
custom avec tokens (`apps/web/src/app/globals.css`, 1 486 lignes) + `apps/web/src/app/motion.css`
(animations) + `apps/web/src/components/skeletons.css` (squelettes).

### 9.1 Couleurs (`globals.css:10`)

- Neutres : rampe zinc `--color-neutral-50..900` + `--color-white` + `--color-black: #0a0a0b`, plus des
  intermédiaires `--color-neutral-450/475` et des « encre » sombres `--color-ink-950/925/850/800/700/500`.
- Accent or : `--color-gold-200/300/400/500/600/700/800` (`#d4af37` pour 500, `#b08d24` 600,
  `#8a6d1a` 700).
- Variables sémantiques (thème clair / sombre) : `--bg`, `--bg-subtle`, `--surface`,
  `--surface-raised`, `--border`, `--border-strong`, `--border-control`, `--fg`, `--fg-muted`,
  `--fg-subtle`, `--accent`, `--accent-ui`, `--accent-wash`, `--accent-border`.
- Thème sombre : `@media (prefers-color-scheme: dark)` + `:root[data-theme="dark"]`
  (sélecteur `ThemeToggle`, `apps/web/src/components/theme-toggle.tsx`, script bloquant dans le
  `<head>`).

### 9.2 Typographie

- Polices : `Geist` + `Geist_Mono` via `next/font/google` (`apps/web/src/app/layout.tsx`), variables
  `--font-sans` / `--font-mono`.
- Échelle 1,25 : `--text-2xs` (0.6875rem) à `--text-xl` (1.375rem) + tailles fluides
  `--text-display` (clamp 3.5rem..7rem), `--text-title`, `--text-subtitle`, `--text-lead`.
- Graisses : 400/500/600/700. Interlignage `--leading-*` et approche `--tracking-*`
  (`--tracking-caps: 0.12em`).
- `--measure-prose: 65ch`, `--measure-lead: 34ch`.

### 9.3 Rythme et mouvement

- Rayons : `--radius-sm 0.5rem`, `--radius-md 1rem`, `--radius-lg 1.25rem`, `--radius-pill 999px`.
- Mouvement : `--ease-out`, `--ease-in-out`, `--duration-quick 100ms` .. `--duration-slow 240ms`,
  `--press-scale 0.97`, `--z-dock 30`.
- `@media (prefers-reduced-motion: reduce)` est respecté.

### 9.4 Composants et classes réutilisables

- `packages/ui/src/page-shell.tsx` : `PageShell` (seul composant du paquet `@findit/ui`,
  `<main className="page-shell">`). `packages/ui/src/index.ts` n'exporte que `PageShell`.
- Classes utilitaires documentées dans `globals.css` : `.hero`, `.eyebrow`, `.intro`, `.hero-note`,
  `.tag-list`, `.filters`, `.filter-chip`, `.job-grid`, `.job-card`, `.role-badge`, `.state-panel`,
  `.detail-*`, `.job-search-*`, `.pagination-*`, `.dashboard-*`, `.stat-grid`, `.stat-card`,
  `.matching-*`, `.skill-list`, `.profile-cv`, `.profile-form`, `.theme-toggle-*`, `.top-nav`.
- Logo : `.brand` / `.logo` (glyphe + « indit »), images `logonoir.png` / `logoblanc.png`.
- Accessibilité : `:focus-visible`, `aria-current`, `prefers-reduced-motion`, `.visually-hidden`.

### 9.5 Points d'intégration (design)

- Tout nouveau composant candidat doit réutiliser les tokens (`--accent`, `--fg-*`, `--surface`,
  `--radius-*`, `--text-*`) et les classes existantes, pas de nouvelles couleurs en dur.
- Les composants supprimés `apps/web/src/components/workspace/*` respectaient déjà ces classes ; les
  réintroduire aligne naturellement le style. Le rendu PDF (`@findit/documents`) utilisait un accent
  **bleu** `#1d4ed8` (héritage antérieur au design system or actuel) : à réaccorder avec l'identité or
  actuelle lors de la récupération des modèles PDF.
- `globals.css` conserve des commentaires morts de l'ancien espace (ex. lignes 924-932, 1012-1014,
  1041, 1065) : traces de l'espace candidat intégré à l'accueil, à nettoyer ou à réactiver.

---

## 10. Tests

### 10.1 Organisation

- Framework : **Vitest** (v4.1.10, configuré à la racine via `turbo` ; scripts `test`, `typecheck`,
  `lint` par paquet). Tests co-localisés en `*.test.ts` / `*.test.tsx`.
- `apps/web/vitest.config.ts` : active `oxc.jsx.runtime = "automatic"` (JSX pour les tests de
  composants).
- `apps/api/vitest.config.ts` : `setupFiles: ["./vitest.setup.ts"]`.
- Couverture : `@vitest/coverage-v8` (racine).

### 10.2 Fichiers de test clés (matching / API)

- `packages/matching/src/matching.test.ts` : `computeMatch` (garde-fou anti-invention, court-circuit,
  score).
- `packages/shared/src/job-scope.test.ts` : fenêtres de fraîcheur, `publishedAfterFor`,
  `endOfDayIfDateOnly`.
- `apps/api/src/matching/matching.service.test.ts` : `MatchingService` (score, historique, purge par
  rétention).
- `apps/api/src/matching/matching.controller.test.ts` : contrat des routes, validation Zod.
- `apps/api/src/profile/profile.service.test.ts`, `profile.controller.test.ts`,
  `profile-key.guard.test.ts` : singleton, upsert partiel, garde.
- `apps/api/src/jobs/job-query.test.ts`, `jobs.service.test.ts` : fraîcheur et filtres.
- `packages/job-classification/src/classify.test.ts`, `school.test.ts`, `contract.test.ts` :
  classification et écoles.
- `packages/ai/src/deepseek-client.test.ts`, `usage.test.ts` : client et coût.

Les anciens tests supprimés (récupérables) : `packages/matching-engine/src/score.test.ts` (132 lignes),
`normalize.test.ts`, `packages/documents/src/render.test.ts` (110 lignes) et `letter-render.test.ts`,
`apps/api/src/resume/*.test.ts`, `apps/api/src/letters/*.test.ts`,
`apps/api/src/applications/*.test.ts`, et les tests des composants workspace.

### 10.3 Points d'intégration (tests)

- Chaque nouveau module candidat (CV, lettres, documents, candidatures) doit livrer ses tests
  co-localisés, sur le modèle existant : tests de service avec Prisma mocké, tests de contrôleur avec
  Zod, tests de composants côté web.
- Les tests supprimés des anciens paquets (`documents`, `matching-engine`, `resume`, `letters`,
  `applications`) sont une base directe à réadapter.

---

## Synthèse des points d'intégration principaux

1. **Profil enrichi** : étendre le singleton `Profile` (`schema.prisma` + `profile.service.ts` +
   `profile.controller.ts` + `/moi` + `profile-api.ts`) avec certifications, formation, projets
   structurés, ou réintroduire `CandidateProfile` + `SourceResume` (séparation profil / CV source).
2. **Import/parsing CV** : récupérer `extract-text.ts` (PDF via `unpdf`, DOCX via `mammoth`, TXT) et
   `structured-resume.ts` (schémas Zod + garde-fou anti-invention des dates) ; brancher sur une route
   privée gardée par `ProfileKeyGuard`, avec stockage et rétention (modèle `SourceResume`).
3. **Génération de CV (3 modèles PDF/DOCX)** : récupérer `@findit/documents`
   (`cv-document.tsx`, `render.tsx`), ajouter 2 variantes de modèle et un export DOCX neuf
   (`@react-pdf/renderer` ne fait que du PDF).
4. **Lettres de motivation** : récupérer `letters.service.ts` (génération factuelle, refus
   anti-invention), réadapter sur `@findit/ai` actuel, rendu via `letter-document.tsx`.
5. **Scoring de documents** : réutiliser `@findit/matching` (`structureCv`, `skillMatch`,
   `locationMatch`, `contractMatch`) et/ou récupérer `@findit/matching-engine`
   (`score.ts`, `tech-dictionary.ts`) pour un score par règles, explicable.
6. **Coût IA** : généraliser le patron `MatchingService#recordModelCall` (diff d'`usage()`,
   `computeCostMicroUsd`, écriture `ModelCall`) à tout nouvel appel IA.
7. **Contrats et fraîcheur** : étendre `ContractType` (Prisma) + `JOB_CONTRACTS` (shared) +
   `contract.ts`/`classify.ts`/`extract/contract.ts` à 6 catégories ; étendre
   `EXTENDED_MAX_AGE_HOURS` + `FRESHNESS_WINDOWS` + `job-query.ts` + `persist.ts`/`ingest.ts` +
   connecteurs à 120 h (5 jours).
8. **Design** : réutiliser les tokens CSS de `globals.css` et `PageShell` ; réaccorder l'accent bleu des
   anciens modèles PDF avec l'identité or actuelle.
