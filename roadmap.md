# Roadmap Findit

## Méthode

- On avance une étape à la fois, sous ordre explicite de l'utilisateur.
- Une étape est implémentée, puis vérifiée par des commandes réelles dont le résultat est présenté.
- Une case est cochée uniquement après validation utilisateur de l'étape complète.
- Chaque fonctionnalité validée donne lieu à un commit et un push sur `main`.
- Aucune fonctionnalité n'est présentée comme terminée si elle repose encore sur un mock.

## Périmètre validé

Ce qui a le droit d'exister en base :

- Contrats : alternance et stage.
- Métiers : Front-end, Back-end, Full-stack, Software Engineering, autre développement, mobile,
  Data Analyst, Data Engineer.
- Zone : Île-de-France.
- Fraîcheur : 24 heures par défaut, 72 heures au maximum.

Ce que le flux montre sans filtre — un réglage, pas une règle de la base :

- Contrat : alternance.
- Métiers : les cinq du développement.

Stocker et montrer sont deux choses. Un stage ou un poste data est collecté, stocké et atteignable par
un filtre ; il n'est simplement pas montré d'office. Changer d'avis est alors un réglage de
`@findit/shared`, jamais une migration. Décidé le 2026-07-17 — voir
[docs/premium-extension-report.md](docs/premium-extension-report.md).

## Phase 0 — Initialisation

- [x] Monorepo pnpm/Turborepo, applications, packages, Docker, Prisma, configuration, README et contrôles qualité

## Phase 1 — Modèle de données

- [x] Schéma métier, migrations et index

## Phase 2 — Base fonctionnelle

- [x] API des offres, recherche, filtres, liste et détail

## Phase 3 — Collecte autorisée

- [x] Connecteurs ATS prioritaires et registre de conformité

Le registre est écrit et vérifié : voir [docs/legal-compliance.md](docs/legal-compliance.md). Il décide de ce qui a le droit de tourner.

Ce que la vérification du 2026-07-17 a établi :

- **Greenhouse** et **Lever** sont les deux seules sources activables aujourd'hui, en `PUBLIC_FEED`.
- **Lever impose `Crawl-delay: 1`**. Le connecteur doit attendre une seconde entre deux requêtes, même si le débit en souffre. C'est une contrainte de la source, pas un réglage.
- **Ashby** répond `200` en JSON sans authentification, mais son `robots.txt` renvoie `Unauthorized`. Une réponse `200` n'est pas une permission : il reste désactivé.
- SmartRecruiters, Teamtailor, Recruitee et Workday n'ont **pas encore été vérifiés**. Ne pas les supposer ouverts.
- LinkedIn, Indeed, Glassdoor et Welcome to the Jungle restent désactivés faute d'accès autorisé.

Ce que la vérification du 2026-07-17 a établi en plus, en cherchant un gisement d'alternances dev :

- **Workable est activable** : `Disallow:` vide, et un content signal qui **accorde `ai-input`** — le
  premier à le faire. Son API `jobs.workable.com/api/v1/jobs` cherche à travers tout le réseau et rend
  une localisation structurée portant « Île-de-France ».
- **SmartRecruiters est fermé** : son `robots.txt` n'ouvre `/v1/companies/` qu'à `LinkedInBot` et
  interdit tout le reste à `User-agent: *`. L'API répondrait `200`, mais se faire passer pour LinkedIn
  tomberait sous l'interdiction de falsifier le user-agent.
- **Le gisement d'alternances dev n'existe pas sur ces ATS.** Mesuré sur 462 offres réelles de six
  boards Greenhouse et Lever, puis sur la recherche Workable : zéro offre ayant à la fois un contrat du
  périmètre et un métier de développement. Voir
  [packages/job-classification](packages/job-classification/README.md).

Fait, et vérifié contre les API réelles :

- [x] Interface `JobSourceConnector` dans `packages/job-connectors`
- [x] Garde-fou refusant d'exécuter un connecteur dont le `SourceAccessStatus` ne l'autorise pas, pour que la règle soit structurelle et non déclarative
- [x] Connecteur Greenhouse, vérifié contre l'API réelle
- [x] Connecteur Lever, avec son délai d'une seconde, vérifié contre l'API réelle
- [x] Alimentation des tables `Connector`, `ConnectorRun` et `ConnectorError`

Ce que la construction a établi en plus :

- **Lever déclare `Content-Signal: search=yes,ai-train=no`.** La liste publique est couverte par
  `search=yes`. Mais `ai-train=no` engage la phase 6 : aucune offre venant de Lever ne doit servir à
  entraîner un modèle, ni partir chez un fournisseur qui s'autorise à entraîner sur ce qu'il reçoit.
  `ai-input` n'est pas déclaré — analyser une offre par un modèle demandera une décision explicite.
  **Tranché depuis** : l'IA tourne en local, donc rien ne part chez un tiers et ces deux signaux
  deviennent sans objet. Voir « Extension premium » plus bas.
- Le registre est relu à chaque exécution : fermer une source en base l'arrête à la collecte suivante,
  sans toucher au code.
- La collecte s'arrête à la donnée brute. Rien n'est encore normalisé, classé ni dédoublonné, et
  `ConnectorRun` laisse à zéro les compteurs qui relèvent de la phase 4.

## Phase 4 — Qualité des offres

- [x] Normalisation, validation, classification, détection d'écoles et déduplication

Ce que le modèle de données a déjà tranché, et qui commande le découpage :

- **Une offre rejetée n'est pas stockable.** `Job` exige `roleCategory`, `contractType`, `city`,
  `departmentCode` et `publishedAt` non nuls, et une contrainte de contrôle limite le département à
  l'Île-de-France. Un CDI, un poste DevOps ou une offre lyonnaise ne peut donc pas exister en base,
  même avec `status = REJECTED`. Le rejet a lieu **avant** qu'une ligne `Job` n'existe.
- **La trace d'un rejet va dans `ProcessingLog`**, dont le `jobId` est facultatif. C'est le seul
  endroit où une offre écartée laisse une trace. `JobClassificationDecision` exige un `jobId` : elle
  ne peut donc expliquer que le sort d'une offre retenue ou mise en quarantaine.
- La quarantaine, elle, suppose une offre complète : tous les champs obligatoires doivent être connus.
  Une offre dont le métier est illisible est rejetée, pas mise en quarantaine.

Découpage :

- [x] Normalisation du texte : HTML des sources → texte fidèle, et titre comparable
- [x] Extraction des sections : responsabilités, prérequis, avantages
- [x] Normalisation de la localisation : ville et département, périmètre Île-de-France
- [x] Classification : contrat et métier, avec confiance et raisons citées
- [x] Détection d'écoles et d'organismes de formation
- [x] Déduplication et conservation de toutes les sources
- [x] Écriture en base : `Job`, décisions, `ProcessingLog`, et compteurs de `ConnectorRun`

La localisation s'appuie sur les 1262 communes d'Île-de-France tirées de `geo.api.gouv.fr`, et non sur
une liste écrite à la main. La classification écoute deux voix — le contrat et le métier — et cite les
raisons qui l'ont fait pencher. L'écriture en base passe par `job-pipeline`, qui décide avant d'écrire :
une offre hors périmètre ne crée jamais de ligne `Job`, elle laisse une trace dans `ProcessingLog`.

## Phase 5 — CV et correspondance

- [ ] Import sécurisé, extraction, score explicable et suppression

Partiellement fait, sous la phase 11 de l'extension : l'import gardé et l'extraction du texte tiennent
et sont vérifiés. Restent le **score explicable** et la **suppression** — l'API expose aujourd'hui
l'envoi, la liste et le détail d'un CV, pas son effacement.

## Phase 6 — IA et lettre

- [ ] Analyse IA encadrée, génération et export de lettre

Le fournisseur est tranché et la couche existe (`@findit/ai`, voir plus bas) : un modèle local dont la
sortie est validée contre un schéma. L'analyse encadrée, la génération et l'export restent à écrire.

## Phase 7 — Durcissement

- [ ] Tests complets, sécurité, accessibilité, observabilité et documentation finale

## Extension premium

Demandée le 2026-07-17. Analyse et contradictions :
[docs/premium-extension-report.md](docs/premium-extension-report.md).

Findit devient aussi une plateforme personnelle. **Le flux public reste public** ; tout ce qui touche
au profil, au CV, aux dépôts privés et aux candidatures vit derrière un espace protégé.

Points structurants, tranchés ou encore ouverts :

- **Le fournisseur IA.** Tranché le 2026-07-17 : **IA locale via Ollama** (modèle `qwen2.5:7b`). Rien
  ne quitte le poste → `ai-train`/`ai-input` de Lever sans objet, et zéro token facturé. Les modèles de
  CV et de lettre sont pré-conçus ; l'IA ne fait que remplir le texte et des analyses courtes, le PDF
  est déterministe. Consigné dans [docs/legal-compliance.md](docs/legal-compliance.md) → « Fournisseur
  IA ».
- **Le télétravail hors département.** `Job.departmentCode` est NOT NULL et contraint à l'Île-de-France :
  une offre « Remote — France » n'est pas stockable en l'état.
- **Les moteurs de recherche.** Chaque fournisseur envisagé doit passer par le registre avant d'être
  écrit. Fait pour **Brave** : découverte seulement, et ses résultats ne sont **jamais** écrits en base,
  ses conditions l'interdisent. La règle reste entière pour tout autre fournisseur.

La couche IA est posée et vérifiée contre le modèle réel : `@findit/ai` rend une sortie structurée
**validée contre un schéma**, car contraindre un modèle n'est pas le garantir — une réponse hors schéma
lève au lieu de passer pour un texte fabriqué. Elle sert les phases 11 à 14.

- [x] Phase 8 — Chaîne asynchrone : cron 4 h (Europe/Paris), file BullMQ, verrou de concurrence, découverte Brave, registre d'entreprises, collecte et écriture en base. Vérifié contre Redis et PostgreSQL réels.
- [x] Phase 9 — Telegram : nouvelles offres uniquement, jamais un message pour dire qu'il n'y a rien. Envoi idempotent par empreinte, token jamais exposé, simulation active par défaut. Les commandes du bot (`/start`, `/status`, `/latest`, `/help`) restent à écrire.
- [x] Phase 10 — Espace privé et profil candidat : garde sur l'en-tête `x-workspace-key`, comparaison à temps constant, profil en exemplaire unique. Vérifié contre l'API et la base réelles.
- [ ] Phase 11 — CV source : import, extraction, structure, versions. **Import et extraction faits** (PDF, DOCX, TXT, déduplication par empreinte de contenu) ; la **structure** et les **versions** restent — c'est la brique suivante.
- [ ] Phase 12 — GitHub : synchronisation, analyse par preuves, résumé nettoyé avant tout envoi IA
- [ ] Phase 13 — Correspondance et scores : CV original, projets, CV optimisé, décision
- [ ] Phase 14 — Génération : CV optimisé, lettre, préparation d'entretien, exports DOCX et PDF
- [ ] Phase 15 — Candidatures : dossier, statuts, historique, rappels, rétention des offres expirées
- [ ] Phase 16 — Recherche web : la source la plus incertaine juridiquement, donc la dernière
