# Rapport d'analyse - extension premium

Rapport exigé par la demande d'extension avant toute modification. Il porte sur le dépôt tel qu'il est
au 2026-07-17, après la phase 3 et les deux premières briques de la phase 4.

## 1. Ce que le dépôt est aujourd'hui

Monorepo pnpm/Turborepo. Trois applications, onze paquets.

| Élément                       | État                                                                        |
| ----------------------------- | --------------------------------------------------------------------------- |
| `apps/web`                    | Next.js. Liste publique, filtres, recherche, pagination, fiche d'offre.     |
| `apps/api`                    | NestJS/Fastify. `GET /api/jobs`, `/stats`, `/filters`, `/:slug`, `/health`. |
| `apps/worker`                 | NestJS + BullMQ. **Une file déclarée, aucun traitement écrit.**             |
| `packages/database`           | Prisma, 40 modèles, migrations, contraintes de contrôle.                    |
| `packages/shared`             | Le périmètre validé, défini une seule fois.                                 |
| `packages/config`             | Schémas Zod par runtime, chargement du `.env` de la racine.                 |
| `packages/job-connectors`     | Interface, garde-fou, Greenhouse, Lever, registre en base.                  |
| `packages/job-normalization`  | HTML → texte, titre comparable, sections.                                   |
| `packages/ui`                 | Coquille de page.                                                           |
| `packages/ai`                 | **Vide.** README seul.                                                      |
| `packages/job-classification` | **Vide.** README seul.                                                      |
| `packages/job-deduplication`  | **Vide.** README seul.                                                      |
| `packages/matching-engine`    | **Vide.** README seul.                                                      |
| `packages/resume-parser`      | **Vide.** README seul.                                                      |

Deux règles structurent le code et doivent survivre à l'extension :

- **Le droit de collecter vient du registre en base, pas du code.** `runConnector` refuse toute source
  dont le `SourceAccessStatus` ne l'autorise pas, et `collect` exige un permis qui n'existe qu'après
  ce contrôle. Le garde-fou n'est pas contournable : il ne compile pas.
- **Rien n'est inventé.** Une date illisible reste `null` plutôt que de devenir « maintenant ». Une
  section absente reste vide plutôt que d'être fabriquée à partir de prose.

## 2. Ce qui existe déjà

- Collecte autorisée : Greenhouse et Lever, vérifiés contre les API réelles, cadence respectée.
- Registre de conformité : 11 sources en base, relu à chaque exécution.
- Trace d'exécution : `ConnectorRun`, `ConnectorError`.
- Normalisation du texte et du titre, extraction des sections.
- Liste publique et fiche d'offre, servies par de vraies données.
- Modèle de données anticipant les phases 5 et 6 : `Resume`, `ResumeAnalysis`, `JobMatch`,
  `CoverLetter`, `PromptVersion`, `ProcessingLog`, `DuplicateGroup`, `DuplicateDecision`,
  `CompanyClassification`, `SchoolDetectionDecision`, `FraudDetectionDecision`, `CompanySource`.

## 3. Ce qui manque

Tout le reste de la demande. En particulier : la localisation, la classification, la détection
d'écoles, la déduplication, l'écriture en base, la recherche web, GitHub, le CV, la lettre,
l'entretien, les candidatures, Telegram, la planification et l'espace privé.

## 4. Les contradictions, et ce qui a été tranché

Ce sont des contradictions, pas des ajouts. Elles ne pouvaient pas être résolues par du code.
Décidées par l'utilisateur le 2026-07-17.

### 4.1 Le stage

| Source                         | Dit                                        |
| ------------------------------ | ------------------------------------------ |
| `roadmap.md`, périmètre validé | « Contrats : alternance **et stage**. »    |
| `ContractType` en base         | `ALTERNANCE`, `INTERNSHIP`                 |
| Titre du site                  | « Alternances **et stages** développeur… » |
| Extension, § 2.2               | « Rejeter : **stage**. »                   |

Retirer le stage touche l'enum, le périmètre partagé, l'API, les filtres, le titre du site et le jeu
de démonstration. Sur les 10 alternances et stages parisiens réels relevés chez Doctolib, **8 sont des
stages** : le flux perdrait l'essentiel de ce qu'il trouve aujourd'hui.

**Tranché : le stage reste stockable, le flux montre les alternances par défaut.** Stocker et montrer
sont deux choses. `INTERNSHIP` reste dans l'enum et reste atteignable par `contract=INTERNSHIP` ;
`DEFAULT_CONTRACTS` décide seulement de ce qui s'affiche sans filtre. Aucune migration destructrice,
et changer d'avis reste un réglage.

### 4.2 Les métiers de la data et le mobile

| Source                 | Dit                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Périmètre validé       | Front-end, Back-end, Full-stack, **Mobile, Data Analyst, Data Engineer**                                                          |
| `RoleCategory` en base | Les six                                                                                                                           |
| Extension, § 2.1       | `FRONTEND`, `BACKEND`, `FULLSTACK`, `SOFTWARE_ENGINEERING`, `OTHER_DEVELOPER` ; data **exclue**, mobile « activé ultérieurement » |

L'extension retire trois catégories, en ajoute deux, et renomme la notion (`JobCategory` contre
`RoleCategory`). L'enum est utilisé par une contrainte, un index, l'API, les filtres et le seed.

**Tranché : on ajoute sans retirer.** `RoleCategory` passe à huit - les six existantes plus
`SOFTWARE_ENGINEERING` et `OTHER_DEVELOPER`. La migration est purement additive : aucune valeur n'est
retirée ni renommée, donc aucune offre déjà stockée ne devient invalide. `DEFAULT_ROLE_CATEGORIES` ne
montre que les métiers du développement ; la data et le mobile restent à un filtre près. Le nom
`RoleCategory` est conservé : le renommer en `JobCategory` coûterait une migration pour aucun gain.

### 4.3 LinkedIn, Indeed, Glassdoor, Welcome to the Jungle

Le registre les tient en `DISABLED_PENDING_PERMISSION` : aucun accès public autorisé pour cet usage.
L'extension demande de les intégrer « lorsque l'accès est techniquement et juridiquement possible » -
ce qui est compatible - mais propose aussi des requêtes `site:linkedin.com/jobs/view`.

La position du registre est déjà écrite : `SEARCH_ENGINE_DISCOVERY_ONLY`. Un moteur autorisé peut
signaler qu'une offre existe ; Findit remonte alors à la page carrière officielle de l'entreprise pour
la collecter. **Le résultat du moteur ne suffit jamais à publier une offre, et récupérer la page
LinkedIn elle-même reste non autorisé.** Le garde-fou refusera ces sources tant que leur ligne dit
non - c'est le comportement voulu, pas un défaut.

### 4.4 L'IA et le signal de Lever

`jobs.lever.co` déclare `Content-Signal: search=yes,ai-train=no,use=reference`.

L'extension demande une analyse IA de chaque offre (§ 14, 16, 19, 20). Envoyer le texte d'une offre
Lever à un modèle relève de `ai-input`, que Lever **n'accorde ni ne refuse**. Et `ai-train=no`
interdit qu'une offre Lever serve à entraîner un modèle : le fournisseur choisi ne doit pas s'en
arroger le droit sur ce qu'il reçoit. Ce point est une décision à prendre, pas un réglage.

### 4.5 Le télétravail hors département

L'extension (§ 2.3) veut accepter une offre en télétravail si l'entreprise a un établissement en
Île-de-France. Or `Job.departmentCode` est **NOT NULL** et une contrainte de contrôle le limite aux
huit départements. Une offre « Remote - France » n'a pas de département : elle n'est pas stockable en
l'état. Il faudra soit rattacher l'offre au département de l'établissement, soit assouplir la
contrainte - et l'assouplir affaiblit la garantie que le périmètre est tenu par la base.

## 5. Composants à modifier

- `packages/shared/src/job-scope.ts` - le périmètre, si 4.1 et 4.2 sont tranchés.
- `packages/database` - enums, contraintes, migration, seed.
- `apps/api` - filtres, validation, nouvelles routes.
- `apps/web` - titre, filtres, navigation, écrans.
- `apps/worker` - tout : la file est déclarée, rien ne la consomme.
- `docs/legal-compliance.md` - les moteurs de recherche et le fournisseur IA.

## 6. Nouvelles tables

Déjà présentes : `Resume`, `ResumeAnalysis`, `JobMatch`, `CoverLetter`, `PromptVersion`,
`ProcessingLog`, `DuplicateGroup`, `DuplicateDecision`, `CompanySource`.

À créer, environ trente-cinq : `CandidateProfile`, `ResumeVersion`, `ResumeSection`,
`ResumeClaimValidation`, `ResumeGenerationRun`, `ResumeScore`, `ResumeScoreComparison`,
`ResumeTemplate`, `ResumeExport`, `CoverLetterVersion`, `CoverLetterExport`, `InterviewPreparation`,
`InterviewQuestion`, `InterviewPracticeSession`, `ApplicationPackage`, `JobApplication`,
`ApplicationStatusHistory`, `ApplicationNote`, `ApplicationReminder`, `JobOfferSnapshot`,
`GitHubAccount`, `GitHubRepository`, `GitHubRepositoryAnalysis`, `GitHubRepositorySnapshot`,
`GitHubRepositoryTechnology`, `GitHubRepositoryFeature`, `GitHubRepositoryEvidence`, `GitHubSyncRun`,
`JobRepositoryMatch`, `ResumeImprovementPlan`, `ResumeImprovementAction`, `TelegramNotification`,
`TelegramNotificationJob`, `NotificationDeliveryAttempt`, `WebSearchRun`, `WebSearchQuery`,
`WebSearchResult`.

`CompanySourceRegistry` recouvre `CompanySource`, qui existe déjà : à étendre, pas à dupliquer.

## 7. Risques

**Technique.** Le worker est vide : toute la chaîne asynchrone est à écrire. Une migration d'enum
détruit des données si elle est jouée sans plan. La génération DOCX/PDF, l'analyse GitHub et la
recherche web ajoutent chacune des dépendances et des quotas externes.

**Sécurité.** Cinq secrets nouveaux (GitHub, Telegram, moteurs, IA, chiffrement). Le contenu d'une
offre, d'un CV, d'un README ou d'une page web est une donnée **non fiable** : elle ne doit jamais être
lue comme une instruction. Un dépôt privé ne doit jamais partir chez un fournisseur IA en clair.

**Périmètre.** La demande couvre ce qui restait des phases 4 à 7, et davantage. La tenir en une fois
reviendrait à empiler du code non vérifié - l'inverse de la méthode suivie jusqu'ici.

## 8. Plan proposé

Rien n'est écrit avant que 4.1 et 4.2 ne soient tranchés : ces deux points décident du contenu de la
base, et donc de tout ce qui la lit.

Ensuite, dans cet ordre, une étape à la fois et vérifiée à chaque fois :

1. Le périmètre, s'il change : enum, contrainte, migration, `job-scope`, API, site, seed.
2. La fin de la phase 4 : localisation, classification, écoles, déduplication, écriture en base.
   C'est elle qui fait apparaître de vraies offres sur le site.
3. La chaîne asynchrone : planification toutes les quatre heures, files, verrou, reprise, journal.
4. Telegram, notification des nouvelles offres seulement.
5. L'espace privé et le profil.
6. Le CV : import, extraction, structure.
7. GitHub : synchronisation, analyse, preuves.
8. La correspondance et les scores.
9. La génération : CV, lettre, entretien.
10. Les candidatures et leur suivi.
11. La recherche web, en dernier : c'est la source la plus incertaine juridiquement, et celle qui
    dépend le plus du reste.
