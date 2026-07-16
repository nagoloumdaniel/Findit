# Conception de l'initialisation de Findit

## Objectif

Initialiser un monorepo TypeScript strict pour Findit, plateforme de recherche d'offres récentes en Île-de-France. La plateforme couvrira les alternances et les stages pour les métiers Front-end, Back-end, Full-stack, Mobile, Data Analyst et Data Engineer.

Cette étape livre uniquement les fondations techniques. Elle n'introduit aucune offre fictive, aucun connecteur simulé et aucune fonctionnalité métier présentée comme opérationnelle.

## Règles métier déjà arrêtées

- Les contrats acceptés seront l'alternance et le stage.
- Les deux types de contrat suivront la même règle d'ancienneté.
- La vue par défaut affichera les offres publiées depuis moins de 24 heures.
- Un filtre permettra d'afficher les offres âgées de 72 heures au maximum.
- Les catégories métier prévues sont `FRONTEND`, `BACKEND`, `FULLSTACK`, `MOBILE`, `DATA_ANALYST` et `DATA_ENGINEER`.
- Le périmètre géographique reste limité à l'Île-de-France.

## Architecture retenue

Le projet utilisera pnpm workspaces et Turborepo.

```text
apps/
  web/       Application Next.js avec App Router
  api/       API NestJS avec adaptateur Fastify
  worker/    Worker NestJS autonome avec BullMQ

packages/
  database/
  job-connectors/
  job-normalization/
  job-classification/
  job-deduplication/
  resume-parser/
  matching-engine/
  ai/
  shared/
  config/
  ui/

infrastructure/
  docker/
  scripts/
  monitoring/

docs/
```

Les packages métier seront créés avec des frontières explicites, mais sans implémentation factice. Chaque package exposera seulement ce qui est réellement disponible à l'étape courante.

## Composants de l'initialisation

### Application web

- Next.js avec App Router.
- Page minimale présentant honnêtement Findit comme projet en cours d'initialisation.
- Configuration de l'URL publique de l'API par variable d'environnement validée.
- Aucun compteur, aucune offre et aucune statistique inventés.

### API

- NestJS avec adaptateur Fastify.
- Endpoint réel `GET /health`.
- Configuration centralisée et validée.
- Préparation des accès PostgreSQL et Redis sans endpoint métier.

### Worker

- Application NestJS autonome.
- Connexion à Redis et fondation BullMQ.
- Aucun job de collecte simulé.
- Démarrage et arrêt propres avec erreurs explicites.

### Données et infrastructure

- PostgreSQL et Redis fournis par Docker Compose.
- Prisma initialisé dans `packages/database`.
- Schéma Prisma limité à la configuration du générateur et de la source de données pendant cette étape.
- Healthchecks Docker pour PostgreSQL et Redis.
- Aucun secret réel versionné.

### Documentation

- `README.md` décrira le but de Findit, l'installation, le démarrage, le fonctionnement de l'architecture et les fonctionnalités prévues ou disponibles.
- `roadmap.md` décrira toutes les étapes du projet.
- Une case de roadmap ne sera cochée qu'après validation utilisateur.
- Les fonctionnalités partielles, bloquées ou absentes seront indiquées sans ambiguïté.

## Variables d'environnement

Le fichier `.env.example` documentera au minimum :

- les ports du web et de l'API ;
- `DATABASE_URL` ;
- `REDIS_URL` ;
- l'URL interne et l'URL publique de l'API ;
- une clé technique interne sous forme de valeur de démonstration non secrète ;
- les paramètres de conservation temporaire des CV ;
- les emplacements réservés aux fournisseurs IA et aux API de recherche futures.

Les variables seront validées avec Zod. Une variable obligatoire absente ou invalide interrompra le démarrage avec un message exploitable. Les intégrations futures resteront désactivées lorsque leurs secrets ne sont pas configurés.

## Flux technique initial

```text
Navigateur -> Next.js -> API NestJS -> PostgreSQL
                            |
                            +-----------> Redis

Worker NestJS -> BullMQ/Redis -> futurs traitements métier
```

L'application web ne contactera pas directement PostgreSQL ou Redis. L'API portera les accès synchrones. Le worker portera les futurs traitements asynchrones. Les contrats et types réellement partagés seront placés dans les packages communs.

## Gestion des erreurs

- Échec immédiat lorsque la configuration est invalide.
- Erreurs de démarrage lisibles et sans secrets.
- Arrêt propre des connexions et processus.
- Aucun fallback silencieux vers des mocks.
- Aucun état visuel ne prétendra qu'un service indisponible fonctionne.

## Vérification

L'initialisation sera considérée prête à présenter seulement après réussite des contrôles applicables :

- installation reproductible avec le lockfile ;
- lint ;
- vérification TypeScript ;
- tests unitaires et tests de fumée initiaux ;
- build de toutes les applications et packages ;
- démarrage de PostgreSQL et Redis avec Docker Compose ;
- démarrage de l'API et réponse valide de `GET /health` ;
- démarrage contrôlé du worker ;
- absence de secret ou de fichier `.env` réel dans Git.

## Méthode de livraison

1. Une étape commence uniquement après un ordre explicite de l'utilisateur.
2. L'étape est implémentée et vérifiée localement.
3. Le résultat et les limites sont présentés à l'utilisateur.
4. Après validation, la case correspondante de `roadmap.md` est cochée.
5. Un commit cohérent est créé puis poussé sur `main`.
6. L'étape suivante attend un nouvel ordre.

## Hors périmètre de cette initialisation

- Modèle de données métier complet.
- API de recherche d'offres.
- Interface de liste ou de détail d'offre.
- Connecteurs ATS ou agrégateurs.
- Collecte automatisée.
- Classification, déduplication ou détection d'écoles.
- Import et analyse de CV.
- Scoring, IA ou génération de lettre.
- Données de démonstration.
- Authentification utilisateur.

## Critères d'acceptation de l'étape

- La structure complète du monorepo existe.
- Les trois applications démarrent dans leur rôle prévu.
- PostgreSQL et Redis sont configurés localement.
- Prisma et les configurations TypeScript sont opérationnels.
- Les variables d'environnement sont documentées et validées.
- `README.md` et `roadmap.md` reflètent exactement le périmètre corrigé.
- Les commandes de qualité et de build passent.
- Aucun comportement métier non implémenté n'est simulé.
