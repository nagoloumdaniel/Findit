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

- [ ] Connecteurs ATS prioritaires et registre de conformité

Le registre est écrit et vérifié : voir [docs/legal-compliance.md](docs/legal-compliance.md). Il décide de ce qui a le droit de tourner.

Ce que la vérification du 2026-07-17 a établi :

- **Greenhouse** et **Lever** sont les deux seules sources activables aujourd'hui, en `PUBLIC_FEED`.
- **Lever impose `Crawl-delay: 1`**. Le connecteur doit attendre une seconde entre deux requêtes, même si le débit en souffre. C'est une contrainte de la source, pas un réglage.
- **Ashby** répond `200` en JSON sans authentification, mais son `robots.txt` renvoie `Unauthorized`. Une réponse `200` n'est pas une permission : il reste désactivé.
- SmartRecruiters, Teamtailor, Recruitee et Workday n'ont **pas encore été vérifiés**. Ne pas les supposer ouverts.
- LinkedIn, Indeed, Glassdoor et Welcome to the Jungle restent désactivés faute d'accès autorisé.

Reste à faire :

- [ ] Interface `JobSourceConnector` dans `packages/job-connectors`
- [ ] Garde-fou refusant d'exécuter un connecteur dont le `SourceAccessStatus` ne l'autorise pas, pour que la règle soit structurelle et non déclarative
- [ ] Connecteur Greenhouse, vérifié contre l'API réelle
- [ ] Connecteur Lever, avec son délai d'une seconde, vérifié contre l'API réelle
- [ ] Alimentation des tables `Connector`, `ConnectorRun` et `ConnectorError`

## Phase 4 — Qualité des offres

- [ ] Normalisation, validation, classification, détection d'écoles et déduplication

## Phase 5 — CV et correspondance

- [ ] Import sécurisé, extraction, score explicable et suppression

## Phase 6 — IA et lettre

- [ ] Analyse IA encadrée, génération et export de lettre

## Phase 7 — Durcissement

- [ ] Tests complets, sécurité, accessibilité, observabilité et documentation finale
