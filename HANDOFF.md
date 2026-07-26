# Passation - Findit

Document destiné à un agent qui reprend le travail (Codex ou autre). Il dit ce
qu'est le projet, comment on y travaille, ce qui est **réellement** fait, ce qui
a déjà été tranché et pourquoi, et les pièges déjà payés.

À jour au 2026-07-26, après la candidature complète dans le navigateur :
scores expliqués et lettres relisibles dans /espace.

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
- `worker` - NestJS + BullMQ, collecte planifiée.

**Paquets** (`packages/`)

- `config` - schémas d'environnement Zod + `loadRootEnv()`.
- `database` - Prisma 7.8, client généré, migrations **additives uniquement**.
- `shared`, `ui` - types communs, composants.
- `job-connectors` - connecteurs ATS, lecture `robots.txt`, découverte Brave.
- `job-normalization` - HTML → texte, titre comparable, localisation Île-de-France.
- `job-classification` - contrat + métier, détection d'écoles.
- `job-deduplication` - score de similarité, décision de fusion.
- `job-pipeline` - décision d'ingestion et écriture en base.
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

[roadmap.md](roadmap.md) a été réaligné sur cette réalité le 2026-07-24 : ses
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

### Pas encore fait

- Export DOCX et rattachement des documents à un historique de candidatures.
- Interface privée : profil, score, CV et lettre ne se voient qu'en API.
- Analyse GitHub.
- Suivi des candidatures.
- Commandes du bot Telegram (`/start`, `/status`, `/latest`, `/help`).
- Écriture en base des groupes de doublons : la logique de décision existe, le
  rattachement `DuplicateGroup` n'est pas branché.
- Versions du CV source, conservation et chiffrement du **binaire** du CV : seul
  le texte extrait est stocké aujourd'hui.

### Un résultat à connaître avant de crier au bug

En juillet, **hors saison**, aucune alternance développeur en Île-de-France
n'existe sur les ATS autorisés. Vérifié sur 462 offres réelles et par recherche
web. Une collecte qui remonte zéro offre exploitable **n'est pas forcément
cassée** - vérifier la saison avant de suspecter la chaîne.

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

---

## 8. Pièges déjà payés

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

---

## 9. La couche IA en pratique

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

## 10. Prochaines briques, dans l'ordre

1. **Suivi des candidatures** : dossier liant offre, CV, lettre, statut et
   historique.
2. **Interface privée** minimale : profil, import CV, score, lettre, PDF.
3. Analyse GitHub, commandes du bot Telegram, dettes courtes (Workable dans le
   cycle, dédup persistée).

Le score, l'export PDF du CV et la lettre sont faits côté moteur et API ; il
reste à les exposer dans une interface.

Dette d'extraction connue : le modèle local invente parfois des jours précis
(« 2025-01-01 » quand le CV dit « 2025 »). Rien de faux ne franchit Zod, mais
la précision affichée peut dépasser la source - à durcir dans une brique
extraction dédiée.

Deux dettes connues, plus petites : les **commandes du bot Telegram**
(`/start`, `/status`, `/latest`, `/help`) et l'absence de versionnement/binaire
chiffré pour les CV sources.

---

## 11. Vérifier son travail

```bash
pnpm typecheck   # 24 tâches
pnpm lint        # 24 tâches, zéro avertissement toléré
pnpm test        # 24 tâches
pnpm build       # 15 tâches
```

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
