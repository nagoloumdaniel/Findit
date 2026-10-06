# Cahier des charges - Web Intelligence Agent

> Pivot du projet Findit, validé le 2026-10-06. Ce document remplace l'ancien cahier des charges « Findit, agrégateur d'offres d'alternance ». Le produit devient un agent IA autonome de collecte web, piloté par un planificateur LLM encadré par des outils déterministes.

## 1. Résumé exécutif

Le **Web Intelligence Agent** recherche quotidiennement des informations sur Internet, navigue sur les sites, identifie les pages pertinentes, extrait les données, les analyse, les structure, les enregistre en base puis les publie sur un site web cible, avec un rapport d'exécution.

L'agent n'est pas limité à un scraper prédéfini : il décide de ses actions.

```
Search → Discover → Crawl → Read → Extract → Analyze → Validate → Deduplicate → Store → Publish → Report
```

Il sait aussi recommencer une recherche, changer de source, approfondir une page ou abandonner une source quand l'information est insuffisante.

## 2. Vision du système

L'utilisateur configure une mission en langage naturel :

> « Tous les jours à 8h, trouve les nouvelles offres d'alternance Full Stack en Île-de-France publiées depuis moins de 24h. »

L'agent doit alors : lancer des recherches, identifier les sites pertinents, ouvrir les résultats, crawler les pages, identifier les offres, extraire, analyser avec un LLM, vérifier la pertinence, détecter les doublons, enregistrer, mettre à jour le site, générer un rapport et signaler les erreurs.

## 3. Pipeline de traitement

| Étape       | Rôle                                                         |
| ----------- | ------------------------------------------------------------ |
| Search      | Générer plusieurs requêtes à partir de l'objectif            |
| Discover    | Décider quels sites valent d'être explorés (score)           |
| Crawl       | Naviguer, suivre les liens, gérer pagination et profondeur   |
| Extract     | Transformer HTML/DOM en JSON structuré (LLM)                 |
| Analyze     | Catégoriser et enrichir (contrat, technos, séniorité, score) |
| Validate    | Vérifier la qualité avant insertion (score de validation)    |
| Deduplicate | Fusionner les mêmes données vues sur plusieurs sites         |
| Store       | Écrire en base                                               |
| Publish     | Exposer sur le site cible                                    |
| Report      | Journal d'exécution, erreurs, coûts                          |

## 4. Les agents

### 4.1 Agent Search

Génère plusieurs requêtes à partir d'un objectif, reformule, recherche par entreprise / technologie / localisation / date, identifie et priorise les nouvelles sources.

### 4.2 Agent Discovery

Pour chaque résultat : domaine, URL, titre, description, type de page, pertinence, réputation, présence d'une liste d'offres, d'une API ou d'un flux. Attribue un score (ex. 95/100) ; sous un seuil, la source est ignorée.

### 4.3 Agent Crawl

Ne se contente pas de télécharger une page : il décide si c'est la bonne page, sinon suit les liens pertinents. Capacités : ouvrir une page, suivre des liens, pagination, catégories, listings, retour en arrière, profondeur et nombre de pages bornés, pages déjà visitées, URLs relatives, redirections, pages JavaScript (attente du rendu dynamique).

### 4.4 Agent Extract

Extrait des données structurées depuis des pages non structurées : HTML → DOM → contenu visible → LLM → JSON. Champs cibles : titre, entreprise, localisation, contrat, technologies, salaire, date, URL de candidature, emails/téléphones professionnels publics, adresses, prix, descriptions, réseaux sociaux professionnels, catégories, métadonnées. Les coordonnées personnelles et données sensibles sont soumises aux règles de conformité (section 11).

### 4.5 Agent Analyze

Après extraction, l'IA détermine catégorie, type de poste, séniorité, score de pertinence, technologies. Détecte et écarte ce qui relève d'une école ou d'un organisme de formation.

### 4.6 Agent Validation

Vérifie : titre présent, entreprise présente, URL valide, source accessible, offre réellement existante, date cohérente, contrat identifiable, contenu suffisant, absence de contradiction, doublon potentiel. Un score bas déclenche un retry.

### 4.7 Agent Retry / Recovery

Stratégies en cascade :

1. HTTP classique
2. Navigateur headless (Playwright)
3. Extraction spécialisée (connecteurs / API officielles)
4. LLM
5. Abandon avec log d'erreur

### 4.8 Agent Deduplication

Détecte les doublons inter-sites (même offre sur LinkedIn, Indeed, Welcome to the Jungle, le site entreprise). Compare URL, titre, entreprise, localisation, date, description, identifiant externe, similarité sémantique.

### 4.9 Agent Memory

Mémoire des opérations : sites visités, URLs analysées, recherches effectuées, données collectées, erreurs, sources fiables, sources problématiques, patterns de sites, résultats précédents.

### 4.10 Planification automatique

Scheduler (cron) : quotidien, périodique, hebdomadaire. Et traitement immédiat à la détection d'une nouvelle donnée.

### 4.11 Matching et scoring de CV (agent IA)

Conservé depuis Findit, piloté par DeepSeek : import d'un CV (PDF/DOCX/TXT), structuration par LLM (faits : expériences, compétences, langues), puis score de chaque offre publiée contre ce CV - calculé par DeepSeek avec explication (compétences couvertes / manquantes, raisons) - et classement du meilleur au moins bon. Le score est indicatif, jamais présenté comme une décision d'employeur. Design : une section « Matching » du dashboard (CV importé, liste des offres scorées, score + raisons par offre).

## 5. Architecture agent : LLM + outils déterministes

Le LLM est l'orchestrateur, jamais le tout-puissant. Il décide, les outils sécurisés exécutent, le résultat revient au LLM.

```
LLM → décide → outils sécurisés → résultat → LLM
```

Outils : `search_web()`, `crawl_page()`, `extract_content()`, `extract_structured_data()`, `open_browser()`, `follow_link()`, `find_links()`, `validate_data()`, `search_database()`, `check_duplicate()`, `save_data()`, `update_data()`, `send_notification()`.

La plupart des étapes sont des services déterministes ; seul le raisonnement qui nécessite réellement de l'IA passe par le LLM. Moins cher, plus rapide, plus fiable.

## 6. Stack technique

| Fonction         | Technologie                                   |
| ---------------- | --------------------------------------------- |
| Frontend         | Next.js                                       |
| Langage          | TypeScript                                    |
| UI               | Tailwind CSS                                  |
| Backend          | NestJS (Fastify)                              |
| Base de données  | PostgreSQL                                    |
| ORM              | Prisma (déjà en place)                        |
| Navigateur       | Playwright                                    |
| Parsing HTML     | Cheerio                                       |
| LLM              | DeepSeek API (unique, décision du 2026-10-06) |
| File / queue     | Redis + BullMQ                                |
| Scheduler        | Cron (BullMQ)                                 |
| Auth             | à choisir (Better Auth recommandé)            |
| Logs             | PostgreSQL + monitoring                       |
| Hosting          | VPS / Railway / Render                        |
| Containerisation | Docker                                        |
| CI/CD            | GitHub Actions                                |

## 7. Modèle de données

Tables principales : `users`, `sources`, `crawl_jobs`, `crawl_pages`, `search_queries`, `extractions`, `job_offers`, `companies`, `contacts`, `agent_runs`, `agent_actions`, `agent_errors`, `agent_memory`, `notifications`.

## 8. Structure d'une offre

```ts
interface JobOffer {
  id: string;
  title: string;
  company: string;
  location?: string;
  contractType?: string;
  description?: string;
  technologies: string[];
  salary?: string;
  publishedAt?: Date;
  applicationUrl: string;
  sourceUrl: string;
  sourceDomain: string;
  contactEmail?: string;
  relevanceScore?: number;
  contentHash: string;
  scrapedAt: Date;
  status: "new" | "verified" | "rejected" | "expired";
}
```

## 9. Dashboard administrateur

Vue générale (statut de l'agent, dernier run, durée, sources, pages, nouvelles données), sections : Dashboard, Sources, Jobs, Crawls, Agent, Matching, Logs, Configuration, Analytics, Users. Gestion des sources (nom, URL, type, fréquence, profondeur max, pages max, priorité). Configuration de l'objectif en langage naturel, transformée en configuration structurée. Historique des runs, logs de raisonnement opérationnel (pas la chaîne de pensée privée), suivi des coûts.

## 10. Sécurité, anti-boucle, respect des sites

- Protéger les clés API (variables d'environnement, jamais exposées).
- Limiter les permissions des outils, journaliser, quotas, timeouts, retries contrôlés.
- Anti-boucle : `MAX_SEARCHES`, `MAX_PAGES`, `MAX_DEPTH`, `MAX_RETRIES`, `MAX_RUNTIME` ; limite atteinte = stop.
- Respecter `robots.txt` quand applicable, les conditions d'utilisation, les limites de fréquence, les APIs officielles quand elles existent.
- Ne jamais contourner les anti-bots, CAPTCHA ou restrictions d'accès. Pour les sites d'emploi restrictifs, privilégier les pages carrière publiques, les APIs/flux autorisés ou les sources sous licence.

## 11. Conformité (RGPD et écoles)

- Coordonnées personnelles et données sensibles : ne collecter que ce qui est nécessaire et légalement exploitable. Emails/téléphones professionnels publics uniquement, avec base légale documentée dans `docs/legal-compliance.md`.
- Exclusion explicite des offres d'écoles, d'organismes de formation et de tout ce qui tourne autour de l'école : ces offres ne sont ni publiées ni conservées comme des offres d'emploi (elles sont écartées à l'analyse/validation).

## 12. Coûts

Suivi des tokens, coût estimé, nombre de pages, de requêtes, d'appels LLM, temps d'exécution. Le LLM est DeepSeek (facturé à l'usage) ; un budget mensuel/par cycle plafonne la dépense, comme la garde de budget Apify existante.

## 13. Périmètre des versions

- **MVP V1** : Scheduler + Search + Crawl + Extract + LLM classification + Deduplication + PostgreSQL + Dashboard, sur 10 à 20 sources.
- **V2** : agent autonome, retry intelligent, memory, scoring, notifications, analytics.
- **V3** : multi-agents, recherche sémantique, auto-discovery, apprentissage des sources, crawl adaptatif.

## 14. Supprimé (hors périmètre)

Sont supprimés : le profil candidat, les lettres de motivation, le suivi de candidatures, le rendu PDF des documents, le `/espace` du web et le garde `WorkspaceGuard`.

Le **matching et le scoring de CV** (score CV ↔ offre, avec explication) sont **conservés**, mais pilotés par un agent IA (DeepSeek) au lieu de règles déterministes (section 4.11).

## 15. Questions ouvertes

- Q-1 : hébergement (worker, API, web) — où faire tourner le cron en continu ?
- Q-2 : authentification (Better Auth vs autre) et multi-utilisateurs — périmètre exact du MVP ?
- Q-3 : sources de départ du MVP (les 10-20 sources) et leur mode d'accès (pages carrière, API officielle, moteur de recherche) ?
