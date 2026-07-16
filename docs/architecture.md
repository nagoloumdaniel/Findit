# Architecture initiale

## Flux

```text
Navigateur -> Next.js web -> API NestJS -> PostgreSQL
                                 |
                                 +-------> Redis

Worker NestJS -> BullMQ/Redis -> modules de traitement ajoutés par étapes validées
```

## Responsabilités

- Le web présente les données et ne se connecte jamais directement à PostgreSQL ou Redis.
- L'API porte les opérations synchrones et les validations d'entrée.
- Le worker porte les traitements asynchrones.
- Les packages partagés exposent des contrats étroits.
- Les connecteurs de sources ne doivent pas remonter dans le code de présentation.

## Périmètre métier

Le contrat partagé `@findit/shared` fixe le périmètre validé et sert de source unique aux autres packages.

| Contrat    | Valeur       |
| ---------- | ------------ |
| Alternance | `ALTERNANCE` |
| Stage      | `INTERNSHIP` |

| Métier               | Valeur          |
| -------------------- | --------------- |
| Front-end            | `FRONTEND`      |
| Back-end             | `BACKEND`       |
| Full-stack           | `FULLSTACK`     |
| Développement mobile | `MOBILE`        |
| Data Analyst         | `DATA_ANALYST`  |
| Data Engineer        | `DATA_ENGINEER` |

La fraîcheur par défaut est de 24 heures (`DEFAULT_MAX_AGE_HOURS`) et la fenêtre étendue est de 72 heures au maximum (`EXTENDED_MAX_AGE_HOURS`). La zone couverte est l'Île-de-France.

## Packages

| Package              | Rôle                                       | État                      |
| -------------------- | ------------------------------------------ | ------------------------- |
| `@findit/shared`     | Contrats de périmètre partagés             | Actif                     |
| `@findit/config`     | Schémas Zod et lecture d'environnement     | Actif                     |
| `@findit/database`   | Datasource Prisma et fabrique de client    | Actif, sans modèle métier |
| `@findit/ui`         | Composants d'interface réutilisables       | Actif                     |
| `job-connectors`     | Accès aux sources autorisées               | Frontière réservée        |
| `job-normalization`  | Homogénéisation des offres brutes          | Frontière réservée        |
| `job-classification` | Décisions contrat, métier, lieu et risque  | Frontière réservée        |
| `job-deduplication`  | Groupes de doublons et fusions réversibles | Frontière réservée        |
| `resume-parser`      | Extraction de faits d'un CV                | Frontière réservée        |
| `matching-engine`    | Score explicable CV/offre                  | Frontière réservée        |
| `ai`                 | Encapsulation des fournisseurs IA          | Frontière réservée        |

Les frontières réservées documentent une responsabilité et n'exposent volontairement aucune API d'exécution pendant l'initialisation.

## État

L'initialisation fournit uniquement les processus, la configuration, les connexions locales et l'endpoint de santé. Aucun flux d'offre n'est actif.
