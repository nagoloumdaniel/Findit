# Roadmap Findit

## Méthode

- On avance une étape à la fois, sous ordre explicite de l'utilisateur.
- Une étape est implémentée, puis vérifiée par des commandes réelles dont le résultat est présenté.
- Une case est cochée uniquement après validation utilisateur de l'étape complète.
- Chaque fonctionnalité validée donne lieu à un commit et un push sur `main`.
- Aucune fonctionnalité n'est présentée comme terminée si elle repose encore sur un mock.

## Périmètre validé

- Contrats : alternance et stage.
- Métiers : Front-end, Back-end, Full-stack, Développement mobile, Data Analyst, Data Engineer.
- Zone : Île-de-France.
- Fraîcheur : 24 heures par défaut, 72 heures au maximum.

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
- Le registre est relu à chaque exécution : fermer une source en base l'arrête à la collecte suivante,
  sans toucher au code.
- La collecte s'arrête à la donnée brute. Rien n'est encore normalisé, classé ni dédoublonné, et
  `ConnectorRun` laisse à zéro les compteurs qui relèvent de la phase 4.

## Phase 4 — Qualité des offres

- [ ] Normalisation, validation, classification, détection d'écoles et déduplication

## Phase 5 — CV et correspondance

- [ ] Import sécurisé, extraction, score explicable et suppression

## Phase 6 — IA et lettre

- [ ] Analyse IA encadrée, génération et export de lettre

## Phase 7 — Durcissement

- [ ] Tests complets, sécurité, accessibilité, observabilité et documentation finale
