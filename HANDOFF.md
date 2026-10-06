# Passation - Findit

Document destiné à un agent qui reprend le travail (Codex ou autre). Il dit ce
qu'est le projet, comment on y travaille, ce qui est **réellement** fait, ce qui
a déjà été tranché et pourquoi, et les pièges déjà payés.

À jour au 2026-10-06. Depuis le 2026-07-27, un pivot : le propriétaire veut un
véritable outil de scraping multi-sources (Apify, ScrapeGraphAI, Playwright) sur
les sites carrières et les job boards, plus une refonte de la disposition du
site. La question Q-4 du cahier des charges est tranchée : les job boards sont
collectés sous un régime d'accès **toléré, non autorisé**
(`OWNER_ACCEPTED_SCRAPING`, risque assumé par le propriétaire), avec les
garde-fous intacts - ni compte, ni cookie, ni CAPTCHA contourné, ni module de
furtivité, URL d'origine obligatoire.

Livré et poussé : registre de conformité rouvert et daté, conditions d'Apify et
fiches d'acteurs lues, un acteur épinglé et un secours par source, garde de
budget par cycle et par mois (plan Apify gratuit, 5 $), connecteur Apify
générique, déduplication inter-sources avec élection de la source canonique et
lien de candidature employeur, et Welcome to the Jungle dans un cycle quotidien
à 6 h - **livré mais éteint** (`SCRAPED_SOURCES_ENABLED=false`).

Trois réserves à connaître avant de continuer : ces briques attendent encore la
validation du propriétaire (aucune case de la roadmap n'est cochée) ; **aucun
connecteur de job board ne tourne**, l'interrupteur `SCRAPED_SOURCES_ENABLED`
étant éteint, donc seul l'outil `pnpm board:proof` exécute Welcome to the
Jungle - la garde de budget, elle, est déjà câblée dans les deux cycles ; et la
règle d'affichage public d'une offre de job board n'est pas tranchée.

La base est passée **en ligne** (Neon, TLS obligatoire) ; Redis reste local. Le
rôle applicatif n'est pas propriétaire du schéma, ce qui a déjà cassé
`migrate deploy` deux fois. CI écrite mais toujours bloquée : GitHub répond
« Actions has been disabled for this user », rien à corriger côté dépôt.

---

## 1. Le projet

**Findit** agrège les offres d'**alternance et de stage développeur en
Île-de-France**, à partir de sources publiques autorisées. La liste publique est
le cœur.

Par-dessus vit une **extension personnelle** derrière un espace protégé :
profil candidat, CV, analyse GitHub, correspondance offre/profil, génération de
CV et de lettre, suivi de candidatures, alertes Telegram.

Deux mondes à ne pas mélanger : **le flux d'offres est public**, tout ce qui
touche au profil, au CV et aux candidatures est **privé et gardé**.

---

## 2. Règles de travail (non négociables)

Elles viennent du propriétaire du projet. Les ignorer fait rejeter le travail.

1. **Français**, réponses courtes, sans remplissage. Précision technique intacte.
2. **Une brique à la fois, sur ordre explicite.** Ne pas enchaîner cinq chantiers
   parce qu'ils semblent liés. Livrer, montrer, attendre.
3. **Vérifier sur le réel.** Base réelle, Redis réel, API réelles, modèle réel.
   **Aucun mock non signalé.** Une doublure de test est permise si elle est
   nommée comme telle dans le test.
4. **Rien d'inventé.** Si une donnée manque ou qu'une sortie ne valide pas, lever
   une erreur explicite. Jamais de valeur fabriquée qui passe pour un succès.
5. **Commit et push seulement sur demande.** L'historique est linéaire sur `main`.
6. **Le registre de conformité fait foi** ([docs/legal-compliance.md](docs/legal-compliance.md)).
   Aucune source nouvelle n'est collectée sans y être inscrite et datée.
7. **Ne jamais toucher au port 3000 ni à ses conteneurs** : ils appartiennent à un
   autre projet de la machine (KiliCasa_MVP). Le site Findit est sur **3100**.

---

## 3. Architecture

Monorepo **pnpm workspaces + Turborepo**. Node `>=24.18 <25`, pnpm `11.13.1`.

**Applications** (`apps/`)

- `web` - Next.js 16, port **3100**.
- `api` - NestJS sur Fastify, port **4000**.
- `worker` - NestJS + BullMQ, deux planifications : ATS natifs toutes les 4 h,
  sources scrapées une fois par jour à 6 h (heure de Paris), même file, concurrence 1.

**Paquets** (`packages/`)

- `config` - schémas d'environnement Zod + `loadRootEnv()`.
- `database` - Prisma 7.8, client généré, migrations **additives uniquement**.
- `shared`, `ui` - types communs, composants.
- `job-connectors` - connecteurs ATS, lecture `robots.txt`, découverte Brave,
  garde-fou d'accès, garde de budget (`spend-budget`) et connecteur Apify.
- `job-normalization` - HTML → texte, titre comparable, localisation Île-de-France.
- `job-classification` - contrat + métier, détection d'écoles.
- `job-deduplication` - similarité, fusion, groupe de revue, priorités de source.
- `job-pipeline` - décision d'ingestion, élection de la source canonique,
  lien de candidature employeur, écriture en base.
- `notifications` - Telegram.
- `ai` - modèle local (voir §7).
- `matching-engine` - score CV/offre pur, sans IA, déterministe et explicable.
- `documents` - modèles de CV et de lettre pré-conçus, rendu PDF déterministe
  (React-PDF, pur Node, aucun navigateur). Le design et les formules d'usage
  vivent dans le code, pas dans l'IA.
- `resume-parser` - **vide**, README seulement.

---

## 4. Environnement de développement

```bash
pnpm install
pnpm setup:hooks        # active le hook anti-secret - à faire une fois
pnpm infra:up           # postgres + redis via docker compose
pnpm db:migrate
pnpm dev                # turbo, toutes les apps
```

Le fichier `.env` vit **à la racine**. `loadRootEnv()` de `@findit/config` la
retrouve via `pnpm-workspace.yaml` : sans cet appel, Prisma et les apps lisent le
`.env` du dossier du paquet et ne trouvent rien.

**Ollama** doit tourner pour toute brique IA :

```bash
ollama serve                      # si le serveur ne répond pas
curl http://localhost:11434/api/tags   # doit lister qwen2.5:7b
```

---

## 5. Conventions de code

- TypeScript strict, plus `verbatimModuleSyntax` (les imports de type doivent
  être `import type`), `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noUnusedLocals`, `noUnusedParameters`.
- ESLint avec `--max-warnings=0`. Règles qui mordent souvent :
  `no-base-to-string`, `no-unsafe-assignment`, `consistent-type-imports`,
  `no-unused-vars` (mode `after-used`), `require-await`,
  `no-unnecessary-type-assertion`.
- Imports relatifs avec l'extension `.js` (modules NodeNext).
- **Jamais de tiret cadratin (U+2014) ni demi-cadratin (U+2013)** : toujours le
  tiret simple « - ». Règle définitive du propriétaire (2026-07-26), valable
  pour le code, les docs, le site, les PDF et toute feature à venir. Seules
  exceptions : les données externes à traiter (la regex de `location.ts` qui
  les élimine, et les entrées de tests qui prouvent cette élimination).
- Commentaires et documentation **en français**, et ils expliquent le _pourquoi_,
  pas le _quoi_.
- Tables Markdown **alignées** (la règle MD060 avertit sinon).
- Messages de commit **en anglais**, minuscule, avec portée :
  `feat(ai): run the model locally, and validate what it answers`. Le corps dit
  la raison, pas la liste des fichiers.
- `.githooks/pre-commit` refuse tout `.env` (sauf `.env.example`) et les motifs de
  secrets connus. Il ne réaffiche jamais le secret trouvé.

---

## 6. État réel du travail

[roadmap.md](roadmap.md) a été réaligné sur cette réalité le 2026-10-06 : ses
cases et celles de ce document disent désormais la même chose. En cas de doute,
le code et les commits tranchent.

### Fait, vérifié contre le réel, poussé

- **Fondations** : monorepo, schéma métier, migrations, API des offres (recherche,
  filtres, liste, détail).
- **Connecteurs ATS** actifs : Greenhouse, Lever (délai 1 s), Workable - tous
  `PUBLIC_FEED`, vérifiés contre les API réelles. Refusés et documentés :
  SmartRecruiters, Ashby, LinkedIn, Indeed, Glassdoor, Welcome to the Jungle.
- **Garde-fou structurel** : un connecteur dont le `SourceAccessStatus` ne
  l'autorise pas **ne peut pas** s'exécuter - la permission est un type, non une
  déclaration, donc non contournable par oubli.
- **Lecture de `robots.txt` et des Content-Signals** avant toute collecte.
- **Traitement** : normalisation HTML → texte, titre comparable, localisation
  Île-de-France (1262 communes issues de geo.api.gouv.fr), classification
  contrat + métier avec confiance et raisons, détection d'écoles et d'organismes
  de formation, déduplication.
- **Ingestion** : décision (acceptée / en quarantaine / rejetée) puis écriture
  `Company`, `Job`, `ProcessingLog`.
- **Worker** : cron 4 h (Europe/Paris), file BullMQ, verrou de concurrence,
  découverte via Brave, registre d'entreprises. Vérifié contre Redis et
  PostgreSQL réels.
- **Telegram** (`484055e`) : alerte sur nouvelles offres uniquement, idempotence
  par empreinte, jamais de message « aucune offre », token jamais exposé,
  simulation active par défaut.
- **Espace privé** (`a34cfe1`) : `WorkspaceGuard` sur en-tête `x-workspace-key`,
  comparaison à temps constant, profil candidat en exemplaire unique.
- **Import du CV** (`d1d2914`) : téléversement gardé, extraction du texte (PDF via
  `unpdf`, DOCX via `mammoth`, TXT), déduplication par empreinte de contenu, refus
  des fichiers illisibles.
- **Couche IA** (`c14b1b5`) : `@findit/ai`, modèle local, sortie structurée
  validée. Voir §7.
- **Structure du CV** : `POST /api/resumes/:id/structure`, route gardee par
  `WorkspaceGuard`, lit le texte `SourceResume`, appelle Ollama via
  `generateStructured`, valide la sortie par Zod, puis stocke `structuredFacts`,
  `structuredWarnings`, `structuredConfidence` et `structuredAt`.
- **Suppression et rétention du CV source** : `DELETE /api/resumes/:id` supprime
  physiquement le `SourceResume`, remet à `null` le `activeResumeId` du profil si
  besoin, ajoute `expiresAt` à chaque import et purge les CV expirés quand les
  routes CV sont utilisées. Prouvé le 2026-07-25 contre API et base réelles :
  401 sans clé, upload avec `expiresAt` à +24 h, DELETE 204 puis 404, expiration
  forcée en SQL suivie d'une purge physique constatée à zéro ligne.
- **Score de correspondance offre/profil** : `@findit/matching-engine`, moteur
  pur sans IA - dictionnaire technique explicite, 4 critères pondérés
  (exigées 50, souhaitées 20, intitulé 15, langues 15), renormalisation quand
  un critère n'a pas de signal, avertissement explicite quand la matière
  manque. Routes gardées `POST /api/resumes/:id/matches/:slug` (recalcule et
  remplace) et `GET /api/resumes/:id/matches` (meilleur d'abord), stockage
  `SourceResumeMatch` en cascade avec le CV et l'offre. Prouvé le 2026-07-25
  contre Ollama et base réels : CV structuré puis scoré 93/100 sur l'offre
  front-end démo et 36/100 sur la back-end, raisons listées, cascade vérifiée.
- **Correctif `@findit/ai`** : llama.cpp refusait le schéma JSON dérivé de Zod
  (400 « failed to parse grammar ») à cause des regex à lookahead (e-mail) et
  des bornes `minLength`/`maxLength`. Le client retire ces mots-clés du schéma
  **envoyé** ; la revalidation Zod conserve toutes les contraintes. Sans ce
  correctif, la structuration n'avait jamais fonctionné contre le serveur réel.
- **Modèle de CV + rendu PDF** (2026-07-26) : `@findit/documents` rend un A4
  sobre depuis les faits structurés - champ absent, absent du PDF ; les tests
  relisent le texte du PDF rendu. Route gardée
  `GET /api/resumes/:id/documents/cv.pdf`, régénérée à chaque appel, 409 tant
  que le CV n'est pas structuré. Prouvé contre Ollama et base réels.
- **Extraction durcie au passage** : `identity` est devenue **requise** dans le
  schéma (la grammaire de décodage saute un objet optionnel, le nom n'était
  jamais extrait) et le prompt interdit de fabriquer des « links » depuis un
  e-mail. Constaté sur le modèle réel, testé.
- **Lettre de motivation factuelle** (2026-07-26) : `SourceCoverLetter` (une
  lettre courante par couple CV/offre, cascade), génération via le modèle
  local (`AI_MODEL_REASONING`, température 0,3) contrainte par schéma **puis**
  garde-fou anti-invention - toute technologie citée doit exister dans le CV
  structuré, même dictionnaire que le score ; violation → 502, rien stocké.
  Relecture par `GET /api/resumes/:id/letters` avant le PDF
  (`GET .../letters/:slug/pdf`). Les formules d'adresse et de politesse sont
  du modèle de document, pas de l'IA. Prouvé sur le réel : lettre 100 %
  factuelle en 33 s, PDF relu fidèle, cascade vérifiée à zéro ligne.
- **Espace privé dans le navigateur** (`/espace`, 2026-07-26) : porte à clé
  (sessionStorage, jamais dans une URL ni le code), import de CV avec input
  stylé, structuration avec barre de progression estimée (annoncée comme
  estimation), faits extraits affichés, export CV PDF, suppression. Erreurs
  affichées avec la vraie raison de l'API. Page non indexable, lien discret
  depuis l'accueil. Validé par le propriétaire dans le navigateur avec son
  vrai CV.
- **Corrections payées sur le vrai CV du propriétaire** : URLs acceptées
  telles qu'écrites (« github.com/x » sans protocole), dates lues jusqu'à
  120 caractères (« admission prévue, rentrée 2026 - ... »), prompt durci
  (technologies individuelles et jamais les intitulés de rubriques, noms de
  projets et titres de postes conservés).
- **Modèle de CV v3** : bleu (#1D4ED8), compact pour tenir sur une page,
  liens cliquables (mailto et https ajoutés aux adresses sans protocole),
  stack sans préfixe de remplissage.
- **Candidature dans le navigateur** (/espace, section « Candidature ») :
  offres publiées listées, score calculé et expliqué (critères pondérés en
  français, compétences couvertes et manquantes en pastilles,
  recommandations, avertissement affiché tel quel), lettre générée avec
  barre de progression estimée puis affichée en entier pour relecture (faits
  utilisés, points fragiles), PDF de lettre téléchargeable. Scores et lettres
  stockés rechargés à l'ouverture. Validé par le propriétaire dans le
  navigateur. Le parcours complet vit désormais dans la page : importer,
  structurer, scorer, lettre, PDF, supprimer.
- **Suivi des candidatures, socle** (2026-07-26) : `Application` photographie
  l'offre, le nom du CV, le score et la lettre au moment de candidater - le
  dossier survit à l'expiration de l'offre et à la purge du CV.
  `ApplicationEvent` historise chaque changement de statut (à postuler,
  envoyée, entretien, offre reçue, refusée, abandonnée) ; le passage à
  « envoyée » fixe `appliedAt` une seule fois. Routes gardées
  POST/GET/PATCH/DELETE `/api/applications`. Prouvé sur le réel avec le vrai
  CV du propriétaire (instantanés constatés, historique daté, base laissée
  propre).
- **Suivi dans /espace** : « Suivre cette candidature » sur chaque offre crée
  le dossier avec ses instantanés ; la section « Suivi des candidatures »
  liste les dossiers avec statut (menu déroulant), note d'historique
  optionnelle, notes libres, historique daté et suppression. Une offre
  retirée du flux est signalée, le dossier reste.
- **Dette B005 fermée** : la variable OPENAI_API_KEY obsolète a été retirée
  du .env local (IA locale seule décision retenue). Si la clé était réelle,
  la révoquer chez OpenAI.
- **Dette B003 fermée - Workable dans le cycle réel** : `RawJob` porte
  l'employeur par offre (Workable le remplit, l'orchestrateur rejette une
  offre de recherche sans entreprise plutôt que d'inventer un employeur), et
  le cycle exécute deux recherches permanentes (« alternance développeur »,
  « stage développeur », Île-de-France) avec les mêmes permis, la même
  ingestion et les mêmes journaux. Prouvé par un cycle réel : 31 offres
  Workable ramenées du vrai réseau, zéro échec, tri d'ingestion normal.
- **Dette B004 fermée - déduplication persistée** : à la création d'une offre,
  comparaison aux candidates de même titre normalisé, fusion en DUPLICATE
  (groupe + canonique, la liste publique ne montre plus deux fois la même) ou
  groupement REVIEW en cas de doute, décision écrite avec score, détail et
  raisons. Prouvé sur PostgreSQL réel : fusion à 0,94, zéro trace après
  nettoyage. La clé privée est désormais mémorisée (localStorage) : plus de
  saisie à chaque visite, « Verrouiller » l'oublie.
- **Sources élargies (2026-07-26)** : le client HTTP des connecteurs accepte
  POST et en-têtes (l'identité FinditBot reste non contournable) et sait lire
  du texte pour robots.txt. Connecteur **France Travail** (API officielle,
  OAuth partenaire, alternance x Île-de-France x fraîcheur filtrées côté
  serveur) : monté dans le cycle SEULEMENT si les identifiants existent ; la
  première collecte réelle reste à constater après inscription sur
  francetravail.io. Connecteur **Workday** (flux CXS par locataire) : robots
  du locataire relu avant CHAQUE collecte, listes en POST, détail par offre
  fraîche - la date vient de `startDate` (absolue), jamais du libellé relatif.
  Prouvé sur le vrai réseau : Thales refusé par son robots, Workday collecté
  (dates 2026-07-24, vraies descriptions). La découverte Brave reconnaît les
  URLs `myworkdayjobs.com` et les requêtes couvrent désormais tous les ATS à
  chaque cycle. SuccessFactors vérifié le 2026-07-26 : pas de flux stable,
  reste fermé au registre.
- **Scan des sites carrières (2026-07-27)** : `pnpm careers:scan` visite les
  sites carrières de l'annuaire sans source collectable, robots.txt lu
  d'abord (refus respecté), et en extrait les liens Greenhouse/Lever/Workday
  rattachés à l'entreprise déjà connue. Premier passage réel : 26 sources
  enregistrées (Accenture, Airbus, Canonical, Palantir, Mastercard, Valeo,
  Onepoint...). LinkedIn reste REFUSÉ - conditions d'utilisation, aucune API
  publique (registre) ; la fenêtre publique par défaut est passée à 3 jours,
  tri du plus récent au plus ancien (ordre du propriétaire).

### Fait, en attente de validation du propriétaire (2026-10-05 et 2026-10-06)

Ces briques sont écrites, testées et poussées, mais **aucune case de la roadmap
n'est cochée** : le propriétaire valide, il ne constate pas.

- **Registre rouvert** (TASK-301) : nouveau régime
  `SourceAccessStatus.OWNER_ACCEPTED_SCRAPING`, distinct de `PUBLIC_FEED` - un
  accès toléré n'est jamais présenté comme autorisé. Migration additive
  `20261005100000`, appliquée sur la base en ligne. `PROHIBITED`,
  `DISABLED_PENDING_PERMISSION`, `SEARCH_ENGINE_DISCOVERY_ONLY` et
  `MANUAL_IMPORT` restent refusés. Conséquence : les sources encore en attente
  de permission ont été **retirées du registre**, qui ne porte plus que
  Greenhouse, Lever, Workable, France Travail, Workday et Welcome to the Jungle.
- **Conditions lues et acteurs épinglés** (TASK-302, TASK-303) : conditions
  générales d'Apify, politique d'utilisation acceptable et 10 fiches d'acteurs
  lues et datées. Clause 11.1 relevée : Apify impose d'indemniser en cas
  d'extraction de sources non autorisées, donc le risque des job boards porte
  aussi sur le compte Apify - compte dédié confirmé par le propriétaire. Un
  acteur et un secours par source. Les acteurs annonçant un contournement
  d'anti-bot sont écartés.
- **Garde de budget** (TASK-305) : coût maximal estimé avant l'appel, refus
  d'un run sans plafond de résultats, billet de réservation par run,
  `CYCLE_BUDGET_EXCEEDED` et `MONTH_BUDGET_EXCEEDED` arrêtent la source sans
  arrêter le cycle, et le cumul du mois est relu dans `ConnectorRun` : un
  redémarrage du worker ne remet pas le compteur à zéro. Défauts : 4,5 $ par
  mois, 0,15 $ par cycle. Prouvé sur la base en ligne réelle.
- **Connecteur Apify générique** (TASK-304) : un acteur épinglé, entrée bornée
  (Zod), jeton dans l'en-tête seulement, jamais dans une URL, sortie revalidée
  avant ingestion, coût réel lu sur la facture du run. 17 tests avec un faux
  serveur Apify nommé comme tel.
- **Première preuve réelle Apify** (TASK-306) : 20 offres, 7 créées, zéro échec,
  0,01605 $ constatés, base rendue à son état d'avant. Ce run a trouvé un vrai
  bug : au statut terminal, les compteurs d'événements facturables n'étaient pas
  à jour et le coût était sous-déclaré. Corrigé par une relecture finale plus un
  plancher calculé depuis les offres reçues, vérifié ensuite par un run à
  0,00405 $ égal à la facture.
- **Déduplication inter-sources** (TASK-307) : à la fusion, l'offre de rang de
  source le plus élevé reste publiée (officiel 100, job board 40) ; une offre
  vue d'abord sur un job board cède sa place à l'ATS de l'entreprise ; les
  sources de l'offre masquée sont recopiées sur la canonique, donc « où et quand
  l'offre a été vue » reste lisible ; `chooseApplyUrl` préfère toujours un lien
  employeur à un lien de job board. Prouvé sur la base en ligne réelle.
- **Cycle quotidien des job boards** (TASK-401) : Welcome to the Jungle via
  Apify, filtre de métier tech, 30 résultats par run, cron quotidien à 6 h dans
  la même file que le cycle de 4 h, donc jamais de chevauchement. **Éteint par
  défaut** (`SCRAPED_SOURCES_ENABLED=false`) et jeton Apify exigé : sinon aucune
  source n'est montée et rien n'est dépensé. Rendement mesuré faible (40 % des
  offres payées acceptées) : la limite est l'offre disponible, pas le filtre.
- **Bugs B009 et B010 fermés** (ordre du propriétaire) : un titre « Business
  Developer » n'est plus pris pour un métier de développeur, et deux entreprises
  aux noms voisins ne fusionnent plus. Tests écrits avant le correctif, échec
  constaté puis succès.

### Pas encore fait

- Export DOCX des documents générés.
- Analyse GitHub.
- Versions du CV source, conservation et chiffrement du **binaire** du CV : seul
  le texte extrait est stocké aujourd'hui.
- Hébergement public du web, de l'API et du worker : la base est en ligne, mais
  le cron vit encore sur le poste, donc pas de collecte quand il est éteint.
- Les job boards restants : Indeed, Glassdoor, LinkedIn (phase 22,
  un site par brique, chacun sur ordre explicite du propriétaire).
- Sites carrières par extraction IA (phase 23), pilotage et santé des sources
  (phase 24), refonte de la disposition du site (phase 25).
- Le branchement de la garde de budget dans le cycle réel : elle n'est appelée
  que par `pnpm board:proof` aujourd'hui, faute de connecteur monté.
- Trois décisions du propriétaire encore ouvertes : Q-1 (le profil, le CV et les
  lettres peuvent-ils aller en base en ligne ?), Q-6 (où héberger worker, API et
  web) et la règle d'affichage public d'une offre de job board.

### Un résultat à connaître avant de crier au bug

En juillet, **hors saison**, aucune alternance développeur en Île-de-France
n'existe sur les ATS d'entreprise autorisés (Greenhouse, Lever, Workable).
Vérifié sur 462 offres réelles et par recherche web. Une collecte qui remonte
zéro offre exploitable de ces sources **n'est pas forcément cassée** -
vérifier la saison avant de suspecter la chaîne.

Nuance depuis le 2026-07-26 : **France Travail rend des offres même en
juillet**. La première collecte réelle a publié les deux premières vraies
offres du site (alternance développeur, Nanterre et Chatou, fraîches de la
veille). Les données démo ont été supprimées le 2026-07-27 sur ordre du
propriétaire : la base publique ne porte plus que du réel. `pnpm db:seed`
reste un outil de développement manuel - aucun chemin de production ne
l'appelle.

---

## 7. Décisions déjà tranchées

Les rouvrir demande une raison, pas une préférence.

### L'IA tourne en local

**Ollama + `qwen2.5:7b`**, sur `http://localhost:11434`. Décidé le 2026-07-24.

Un fournisseur distant (Anthropic) avait été retenu le matin même, puis écarté :
il faisait payer des tokens à chaque offre. Le local règle le coût **et** la
conformité - comme rien ne quitte le poste, les signaux `ai-train` et `ai-input`
de Lever **deviennent sans objet** : ils encadrent ce qu'un tiers a le droit de
faire d'un contenu qu'on lui envoie, or on n'envoie rien.

Mesuré sur la machine cible (RTX 2060 6 Go, 32 Go RAM) : **21,4 tokens/s** à
chaud, GPU. Le démarrage à froid charge 4,7 Go et prend du temps.

### L'IA a un rôle étroit, par choix de coût

Les **modèles de CV et de lettre sont pré-conçus et designés à part**. L'IA ne
fait que **remplir le texte** et produire des analyses courtes. Le **rendu PDF est
déterministe**, sans IA. Le **score de correspondance se calcule par recoupement**
de compétences et de mots-clés, **sans IA** - donc gratuit et explicable.

Conséquence : on ne régénère pas un CV entier par offre. C'était le point de
départ de la décision.

### Brave ne sert qu'à découvrir

Ses conditions interdisent de stocker les résultats. Un résultat Brave **ne va
jamais en base** : il vit en mémoire le temps d'en tirer une URL, puis on remonte
à la source officielle, et c'est **l'offre venue de la source** qui est stockée.
Un résultat de moteur ne suffit jamais à publier une offre.

### Un domaine découvert n'est pas un domaine autorisé

Le registre dynamique ne rend collectable un domaine que si son `robots.txt`
**autorise explicitement** `FinditBot`. Un statut inconnu vaut refus.

### Le stage reste, l'alternance est le défaut

Les stages sont collectés, mais le filtre par défaut porte sur l'alternance.

### Les job boards sont collectés, sous un risque assumé

Décidé le 2026-10-05 par le propriétaire. LinkedIn, Welcome to the Jungle,
HelloWork, Glassdoor, Indeed et les autres job boards sont collectés. Leurs
conditions d'utilisation interdisent la collecte automatisée : la conséquence
réaliste est civile (blocage d'IP, d'accès ou de compte), pas pénale, et elle est
assumée. Le régime de registre `OWNER_ACCEPTED_SCRAPING` traduit exactement cela :
**toléré, jamais présenté comme autorisé**.

Garde-fous non négociables, proposés par l'assistant et conservés :

- aucun compte, aucun login, aucun cookie : seules les pages publiques sont lues ;
- aucun CAPTCHA contourné, aucun module de furtivité dans le code Findit ;
- un acteur annonçant un contournement d'anti-bot est écarté ;
- chaque offre garde son URL d'origine ; une offre sans URL d'origine est rejetée ;
- cadence et volume bornés par source, budget plafonné par cycle et par mois,
  interrupteur par source ;
- le registre reste la porte d'entrée : un site n'est ouvert qu'à sa propre brique.

### Les sources scrapées tournent une fois par jour

Décidé le 2026-10-06. Les ATS natifs restent à 4 h ; tout ce qui est scrapé
(job boards via Apify, sites carrières via ScrapeGraphAI) tourne une fois par
jour, dans un cron dédié. Motif : le plan Apify gratuit donne 5 $ par mois, et
la même collecte toutes les 4 h coûterait environ 77 $ par mois contre environ
13 $ à une collecte par jour.

### ScrapeGraphAI sert aussi, mais pas les job boards via le cloud

Décidé le 2026-10-06. ScrapeGraphAI prend trois rôles : fournisseur des sites
carrières sans ATS reconnu, repli de Welcome to the Jungle et HelloWork quand le
budget Apify est épuisé ou qu'un acteur casse, et peut-être fournisseur principal
de ces deux sources après mesure. Ses conditions imposent de respecter celles des
sites cibles : tant que le propriétaire n'a pas confirmé ce risque pour ce
fournisseur, le repli n'utilise que la bibliothèque locale avec Ollama, jamais
l'API cloud. LinkedIn, Indeed et Glassdoor n'ont pas de repli local : leur
protection anti-bot imposerait de la contourner, ce qui reste interdit.

---

## 8. Claude Code branche sur le compte DeepSeek (outillage)

Depuis le 2026-10-06, Claude Code est relie a DeepSeek pour que l'agent puisse lui
deleguer des taches isolees : le bundle `@deepseek-ai/dsh-subagent-claude-code` est
installe dans le profil `desktop`, et le profil declare la ligne d'outil
`subagent_claude_code`. Le montage suit la documentation DeepSeek
(« Integrate with Claude Code »), appliquee a l'environnement du sous-agent dans
`~/.dsh/profiles/desktop/cordis.patch.yml` :

```yaml
env:
  ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic"
  ANTHROPIC_AUTH_TOKEN: "<cle API DeepSeek>" # platform.deepseek.com
  ANTHROPIC_MODEL: "deepseek-flash[1m]"
  ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-v4-pro"
  ANTHROPIC_DEFAULT_SONNET_MODEL: "deepseek-flash[1m]"
  ANTHROPIC_DEFAULT_HAIKU_MODEL: "deepseek-flash"
  CLAUDE_CODE_SUBAGENT_MODEL: "deepseek-flash"
  CLAUDE_CODE_EFFORT_LEVEL: "max"
  CLAUDE_CODE_AUTO_COMPACT_WINDOW: "786432"
```

### Aucun modele Claude n'est servi

C'est le point a ne pas se raconter : l'API DeepSeek **redirige** les noms de
modeles Claude vers les siens. Il n'y a donc pas d'acces a Opus, Sonnet ou Haiku.

| Demande                              | Modele reellement servi |
| ------------------------------------ | ----------------------- |
| `claude-opus-*` (alias `opus`)       | `deepseek-v4-pro`       |
| `claude-sonnet-*` (alias `sonnet`)   | `deepseek-flash`        |
| `claude-haiku-*` (alias `haiku`)     | `deepseek-flash`        |
| tout autre nom (`claude-fable-5`...) | `deepseek-flash`        |

Difference a connaitre avant d'envoyer une image : **`deepseek-v4-pro` ne supporte
pas la vision**, `deepseek-flash` oui. Les deux ont 1M de contexte et 384K de
sortie maximale. `v4-pro` coute environ 4 fois plus cher que `flash` et repond
plus lentement (mesure : 1,5 s contre 0,5 s sur une requete courte).

Le sous-agent reste **fixe sur `deepseek-flash`** : `CLAUDE_CODE_SUBAGENT_MODEL`
et le champ `model` de la ligne du provider le forcent. `ANTHROPIC_DEFAULT_OPUS_MODEL`
est pose pour que le tier haut existe si on l'ouvre un jour.

Trois constats verifies contre l'API reelle, qui evitent de repayer l'enquete :

- **Le jeton de compte n'est pas une cle API.** Il rend 401 « api key invalid » en
  `Authorization: Bearer` ; il n'est accepte que dans l'en-tete `x-dsh-auth-token`.
  Une cle de plateforme est donc obligatoire pour cette voie, et elle est facturee
  a l'usage. Le montage par jeton de compte, mis au point et prouve le 2026-10-06,
  a ete retire : il dependait d'un en-tete non documente et d'un proxy local.
- **Le mapping des modeles est fait par le serveur** : `claude-opus-5-5` envoye tel
  quel rend 200 avec `deepseek-v4-pro` comme modele servi. Aucun proxy local, aucune
  reecriture de nom de modele n'est necessaire.
- **La cle n'est pas heritee de l'exterieur** : le provider ecrit cet environnement
  dans la requete du SDK, et l'environnement ambiant est purge de ses variables
  `ANTHROPIC_*` avant l'application.

Prouve sur le reel : une delegation `subagent_claude_code` a lu `package.json` du
depot et rendu `NOM=findit VERSION=0.1.0 SCRIPTS=16`, chiffres verifies a la main
contre le fichier, avec le proxy local arrete.

**Version du bundle** : elle doit correspondre a celle de l'application
(`0.2.0-rc.2` aujourd'hui). Ce bundle est publie en versions pre-liminaires, et une
plage de versions npm ignore les pre-versions : `0.0.1-rc.1`, qui ne declare aucun
bundle de profil, serait choisie a la place. Apres une mise a jour de DeepSeek
Harness, lancer
[scripts/update-claude-subagent.cjs](scripts/update-claude-subagent.cjs), qui lit
la version de l'application, verifie que le bundle correspondant existe au registre
et declare bien un patch, puis installe et selectionne.

La session one-shot est **unattended** : `AskUserQuestion` est desactive et les
demandes de permission sont refusees hors mode `bypassPermissions`. Le mode retenu
est `acceptEdits`.

---

## 9. Pièges déjà payés

Chacun a coûté du temps. Les relire évite de les repayer.

- **`.env` non lu** - appeler `loadRootEnv()` avant toute lecture de
  `process.env`, et avant que Nest ne construise ses modules.
- **`next build` cassé par `NODE_ENV`** - la valeur venant du fichier `.env`
  empoisonnait la compilation ; `run-next.mjs` retire `NODE_ENV` du fichier et
  garde celui du shell.
- **Injection NestJS silencieusement cassée** - esbuild n'émet pas
  `emitDecoratorMetadata`, donc un contrôleur recevait un service `undefined` en
  développement. **Écrire `@Inject(MonService)` explicitement** dans chaque
  contrôleur.
- **Champs JSON Prisma** - écrire seulement des objets validés par Zod et
  compatibles JSON ; ne jamais stocker une sortie IA brute.
- **`unpdf`** - passer `new Uint8Array(buffer)` directement à `extractText` ;
  passer par `getDocumentProxy` donne un type qui ne se résout pas.
- **Port 4000 occupé** par un processus fantôme - le retrouver avec
  `Get-NetTCPConnection -LocalPort 4000` puis le tuer.
- **pnpm ne remonte pas les dépendances** - un script placé à la racine ne résout
  pas `zod`. Exécuter depuis le paquet qui déclare la dépendance.
- **L'outil Bash n'est pas PowerShell** - une chaîne `@'...'@` y est prise au pied
  de la lettre et a produit un message de commit encadré de `@`. Utiliser un
  heredoc.
- **Le serveur Ollama meurt avec sa session** s'il est lancé en processus caché.
  Vérifier `/api/tags` avant d'appeler le modèle, et relancer si besoin.
- **Incident sécurité, déjà traité** - une vraie clé Brave a été écrite dans
  `.env.example` puis poussée sur un dépôt public. Historique réécrit, clé
  révoquée, hook de pré-commit ajouté. **Aucune valeur réelle dans
  `.env.example`, jamais.**
- **Le rôle applicatif n'est pas propriétaire du schéma** de la base en ligne :
  une migration qui change la structure échoue et laisse une ligne d'historique
  en échec. Appliquer la valeur avec une connexion propriétaire, puis
  `migrate resolve` (rolled-back puis applied). C'est arrivé deux fois.
- **Le hook de pré-push rejoue `format:check`** : un dépôt mal formaté fait
  échouer le push. Lancer `pnpm format:check` avant de pousser, et corriger,
  plutôt que de forcer avec `--no-verify`.
- **Un « vert » peut venir du cache Turborepo** : il prouve qu'un run identique
  est déjà passé, pas que le code vient d'être vérifié. Pour une preuve, forcer
  (`--force`) et lancer les tâches **une par invocation** - enchaîner build et
  typecheck dans le même `turbo run` est un piège déjà payé.
- **Node de la machine en v24.10.0** alors que le dépôt exige `>= 24.18 < 25` :
  pnpm affiche un avertissement d'environnement à chaque commande. Les contrôles
  passent, mais un environnement non conforme ne doit pas être présenté comme
  conforme.
- **Un test peut flotter sous charge** : `@findit/api#test` a échoué une fois
  après deux runs Turbo lourds, puis est passé cinq fois de suite en run frais.
  Avant de conclure à une régression, relancer et noter le nom du test fautif.

---

## 10. La couche IA en pratique

Paquet `@findit/ai` ([packages/ai/src/](packages/ai/src/)).

```ts
import { createOllamaModel, AiOutputError } from "@findit/ai";

const model = createOllamaModel({
  baseUrl: env.OLLAMA_BASE_URL, // http://localhost:11434
  model: env.AI_MODEL_EXTRACTION, // qwen2.5:7b
});

// Sortie structurée : le schéma contraint le modèle ET revalide sa réponse.
const cv = await model.generateStructured({
  schema: CvSchema, // un schéma Zod
  system: "Tu extrais des données d'un CV. N'invente rien.",
  prompt: texteDuCv,
});

// Texte libre, pour une lettre.
const lettre = await model.generateText({ prompt, system });
```

Le point important : **une contrainte n'est pas une garantie**. Le schéma est
envoyé à Ollama pour contraindre le décodage, _et_ la réponse est revalidée
ensuite. Toute sortie hors schéma lève `AiOutputError` au lieu de passer pour un
texte fabriqué. Serveur injoignable ou en erreur → `AiUnavailableError`.
`AiDisabledError` est prévu pour la couche application quand
`AI_PROVIDER=disabled`.

Variables d'environnement concernées : `AI_PROVIDER` (`disabled` | `ollama`,
éteint par défaut), `OLLAMA_BASE_URL`, `AI_MODEL_REASONING`, `AI_MODEL_EXTRACTION`.

---

## 11. Prochaines briques, dans l'ordre

Mise à jour du 2026-10-06. Le chantier de scraping des 2026-10-05 et 2026-10-06
est écrit, testé et poussé, mais **attend la validation du propriétaire** : tant
qu'elle n'est pas donnée, rien de nouveau ne se construit dessus. `roadmap.md`
porte les phases 20 (base en ligne), 21 (moteur de scraping), 22 (job boards),
23 (sites carrières par extraction IA), 24 (pilotage) et 25 (refonte du site).

Suivant ce que le propriétaire ordonne :

1. **Valider les briques en attente** (TASK-301 à TASK-307, TASK-401, TASK-402) : elles
   sont livrées et prouvées, il ne manque que la case cochée.
2. **Trancher ce qui bloque** : la règle d'affichage public d'une offre de job
   board (seul obstacle à l'allumage de Welcome to the Jungle), Q-1 (le privé
   peut-il aller en base en ligne ?) et Q-6 (où héberger le worker).
3. **Allumer le cycle des sources scrapées** : tout est câblé, garde de budget
   comprise, mais `SCRAPED_SOURCES_ENABLED` vaut `false`, donc aucun job board
   ne tourne en production.
4. **Poursuivre la phase 22** : Indeed, puis Glassdoor et LinkedIn,
   un site par brique et sur ordre explicite.

Ensuite, phases 23 à 25 : extraction déterministe des sites carrières (JSON-LD,
sitemaps, puis Playwright, et ScrapeGraphAI en dernier recours), pilotage et
santé des sources, refonte de la disposition en quatre espaces (Offres, Mon CV,
Candidatures, Sources).

Dette d'extraction connue : le modèle local invente parfois des jours précis
(« 2025-01-01 » quand le CV dit « 2025 »). Rien de faux ne franchit Zod, mais
la précision affichée peut dépasser la source - à durcir dans une brique
extraction dédiée.

Deux dettes plus petites : l'absence de versionnement et de chiffrement du
binaire des CV sources, et l'export DOCX des documents générés.

---

## 12. Vérifier son travail

```bash
pnpm format:check   # Prettier ; rejoué par le hook de pré-push
pnpm typecheck      # 30 tâches
pnpm lint           # 30 tâches, zéro avertissement toléré
pnpm test           # 30 tâches
pnpm build          # 17 tâches
```

Pour une preuve et non un cache, forcer (`--force`) et lancer chaque tâche
**une par invocation** : enchaîner build et typecheck dans le même `turbo run`
est un piège déjà payé.

Validation locale des briques structure CV puis suppression/rétention CV, le
2026-07-24 :

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm db:migrate`
- `pnpm --filter @findit/database prisma:validate`

Validation sur le réel du 2026-07-25 : API démarrée sur 4000, scénario complet
suppression/rétention joué contre PostgreSQL Docker, base laissée propre.

Au-delà de ces contrôles : **tester contre le réel**, puis nettoyer ce qu'on a
écrit en base. Une brique n'est pas finie parce qu'elle compile ; elle est finie
quand on l'a vue fonctionner sur de vraies données, et qu'on peut le montrer.
