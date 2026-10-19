# Roadmap — travail restant (Findit enrichi par Jobscout)

> Établie le 2026-10-19 après la première livraison. Ne liste que ce qui n'est **pas encore fait**.
> Ce qui est déjà livré (audit, 6 contrats, fraîcheur 5 jours, package `@findit/documents` 3 modèles,
> `@findit/matching-engine`, mode correspondance, profil enrichi, import CV, génération CV/lettre) n'est
> pas répété ici.

## Légende de priorité

- **P0** : indispensable pour la cohérence du produit (fondations).
- **P1** : fonctionnalité majeure attendue.
- **P2** : amélioration ou confort.
- **P3** : optionnel ou différé.

Les items d'une phase dépendent de la phase précédente, sauf mention explicite.

---

## Phase 1 — Fondations de données (P0)

### 1.1 ✅ Valeur brute de contrat conservée pour audit

- **Objectif** : chaque offre porte son type normalisé ET le libellé brut de la source, pour auditer les classifications ambiguës sans les transformer en certitudes (§7.1).
- **État** : le libellé brut (`commitmentLabel`) est cité dans `JobClassificationDecision.reasons`, mais pas stocké dans un champ dédié.
- **Travail** : ajouter `Job.contractTypeRaw String?` (ou une colonne dédiée dans `JobClassificationDecision`), migration additive, le remplir dans `persist.ts` / `ingest.ts`, l'exposer dans le détail.
- **Fichiers** : `packages/database/prisma/schema.prisma`, `packages/persist/src/persist.ts`, `packages/job-pipeline/src/ingest.ts`, `apps/api/src/jobs`.
- **Acceptation** : une offre « CDD intérim » garde son libellé brut lisible ; le type normalisé reste distinct.

### 1.2 ✅ Marquage des offres sans date fiable

- **Objectif** : distinguer une date de publication vérifiée d'une date absente/insuffisamment fiable, au lieu de rejeter silencieusement (§7.2).
- **État** : aujourd'hui une offre sans date ISO est rejetée (`parsePublishedAt`).
- **Travail** : ajouter un statut `dateVerified Boolean` ou un statut `JobStatus` dédié ; centraliser la règle d'inclusion dans un service métier commun (pages, API, filtres, stats appliquent le même critère).
- **Fichiers** : `packages/shared/src/job-scope.ts`, `packages/persist`, `packages/job-pipeline`, `apps/api/src/jobs`.
- **Acceptation** : une offre « date non vérifiée » n'apparaît jamais dans les résultats garantis récents.

### 1.3 ✅ Profil candidat — préférences de recherche structurées

- **Objectif** : rendre le profil exploitable pour le filtrage et le matching (§10.1, §10.4) : secteurs cibles, intitulés de poste cibles, rémunération souhaitée, mobilité géographique, disponibilité/date de début.
- **État** : `preferredContracts` est fait ; manquent les autres préférences.
- **Travail** : étendre `Profile` (`targetRoles String[]`, `targetSectors String[]`, `desiredSalary Json`, `mobility Json`, `availability String?`), migration additive, chaîne service/contrôleur/web.
- **Fichiers** : `packages/database/prisma/schema.prisma`, `apps/api/src/profile`, `apps/web/src/lib/profile-api.ts`, `apps/web/src/app/moi`.
- **Acceptation** : un profil renseigné fournit une source unique pour recherche, filtres, matching et génération.

### 1.4 ✅ Stockage du CV fichier et versions multiples

- **Objectif** : importer le CV comme **fichier**, le conserver, le remplacer/supprimer, garder plusieurs versions, choisir le CV de référence (§10.2, §10.4).
- **État** : `POST /api/resume/import` extrait et structure mais **n'écrit rien en base** ; le profil ne garde que `cvText`.
- **Travail** : réintroduire une table `Resume` (ou `SourceResume`) : `fileName`, `fileType`, `fileSize`, `contentHash`, `extractedText`, `structuredFacts Json`, `confidence`, `expiresAt`, `active Boolean` ; routes upload/remplacement/suppression/sélection ; stockage fichier sécurisé (validation type + taille, autorisation).
- **Fichiers** : `packages/database/prisma`, `apps/api/src/resume`, `apps/web/src/app/moi`.
- **Acceptation** : un CV réel est uploadé, relu, remplaçable ; aucun CV d'un autre utilisateur n'est accessible (garde `ProfileKeyGuard`).

---

## Phase 2 — Matching et scoring (P1)

### 2.1 ✅ Score de documents distinct du score profil

- **Objectif** : mesurer la correspondance d'un **CV généré** et d'une **lettre** avec une offre, séparément du score de profil (§16.1, §16.2).
- **État** : `@findit/matching-engine` fournit le score profil ; aucun score de document n'est calculé ni exposé.
- **Travail** : un service de scoring de document (couverture des compétences requises/souhaitées, pertinence des expériences, adéquation formation, présence des mots-clés, clarté, absence de contradictions) ; table `DocumentScore` ou extension de `ModelCall` ; affichage du score sur la page de détail.
- **Fichiers** : nouveau service dans `apps/api/src/documents` (ou package dédié), `packages/database/prisma`.
- **Acceptation** : les scores de profil, de CV généré et de lettre restent distincts et explicables.

### 2.2 ✅ Boucle de qualité > 90 % avec itérations

- **Objectif** : générer, analyser, améliorer, réévaluer le document jusqu'au seuil cible ou une limite de tentatives, sans jamais manipuler le score (§16.3).
- **État** : la génération est en une passe, sans réévaluation.
- **Travail** : cycle génération → analyse → identification des critères insuffisamment couverts → amélioration à partir des faits réels → réévaluation (borné, ex. 3 itérations) ; exposer les critères non couverts et les améliorations effectuées.
- **Dépend** : 2.1.
- **Acceptation** : le score affiché correspond à la version réellement téléchargée ; aucune compétence inventée pour gonfler le score.

### 2.3 ✅ Adaptation IA fine du contenu de CV

- **Objectif** : réordonner les expériences/compétences réellement pertinentes, reformuler les réalisations, adapter le résumé aux termes de l'annonce, sans rien inventer (§14.4).
- **État** : le CV est généré déterministiquement depuis les faits du profil ; résumé IA optionnel.
- **Travail** : prompt de génération (équivalent `generate-cv` de Jobscout) sur `@findit/ai`, validation anti-hallucination (entreprises/compétences non ancrées supprimées), relecture non bloquante ; cache et journalisation `ModelCall`.
- **Fichiers** : `apps/api/src/documents/documents.service.ts`, prompts versionnés (`PromptVersion`).
- **Acceptation** : le CV met en avant ce qui correspond réellement à l'offre, jamais une compétence absente du profil.

### 2.4 ✅ Explication du score sur la page de détail

- **Objectif** : sur la page d'offre, montrer le score global, les forces, les compétences couvertes, les exigences non couvertes, les points à vérifier, les recommandations (§12.3).
- **État** : `@findit/matching-engine` produit le breakdown, mais il n'est pas affiché sur la fiche d'offre.
- **Travail** : endpoint de détail du match (ou enrichir `GET /api/matching/rank`), composant d'explication côté web, avec l'avertissement d'insuffisance de données.
- **Fichiers** : `apps/api/src/matching`, `apps/web/src/app/offres/[slug]`.
- **Acceptation** : un chiffre n'apparaît jamais sans son explication.

---

## Phase 3 — Génération de documents : prévisualisation et contrôle (P1)

### 3.1 ✅ Prévisualisation du CV avant téléchargement

- **Objectif** : voir le CV, changer de modèle, activer/désactiver la photo, personnaliser la couleur, corriger des informations, relancer la génération, puis télécharger (§14.5).
- **État** : `POST /api/documents/cv` télécharge directement le fichier, sans prévisualisation.
- **Travail** : rendre le PDF en aperçu (iframe/objet), formulaire de personnalisation (modèle/photo/couleur), puis téléchargement du document effectivement affiché.
- **Fichiers** : `apps/web/src/app/offres/[slug]/candidature.tsx`, `actions.ts`.
- **Acceptation** : le PDF téléchargé est identique à l'aperçu.

### 3.2 ✅ Prévisualisation et modification de la lettre

- **Objectif** : prévisualiser la lettre, la modifier manuellement, la régénérer, la télécharger (§15).
- **État** : la lettre est générée et téléchargée directement.
- **Travail** : aperçu + champ d'édition + régénération ciblée ; contrôle de cohérence CV/lettre.
- **Fichiers** : `apps/web/src/app/offres/[slug]/candidature.tsx`, `actions.ts`, `apps/api/src/documents`.
- **Acceptation** : la lettre correspond à l'offre et ne contient aucune expérience/motivation inventée.

### 3.3 ✅ Vérification finale du document

- **Objectif** : avant de rendre un document disponible, vérifier la validité technique, l'extraction du texte, l'absence de texte coupé, les dates/noms/coordonnées, la cohérence CV/lettre/annonce, et le score de la version téléchargée (§16.4).
- **État** : `@findit/documents` garantit une page A4 ; la vérification de contenu n'est pas automatisée.
- **Travail** : étape de validation (extraction texte du PDF/DOCX généré, contrôle des accents/coupures), enregistrement de la version et de ses résultats de vérification.
- **Fichiers** : `apps/api/src/documents`, `packages/documents`.
- **Acceptation** : un document modifié n'affiche jamais un score ancien.

---

## Phase 4 — Recherche et interface (P1/P2)

### 4.1 ✅ Filtres avancés réellement supportés

- **Objectif** : exposer les filtres dont la donnée existe déjà en base (§8.2) : niveau d'études (`studyLevel`), rémunération (`salaryMin`/`salaryMax`), durée, date de début (`startDate`), source, offre à date vérifiée (dépend 1.2), et rayon géographique (si coordonnées `latitude`/`longitude`).
- **État** : seuls `role`, `contract`, `department`, `workMode`, `city`, `q`, `officialOnly`, `freshness`, `sort` sont filtrables.
- **Travail** : étendre `jobQuerySchema` + `JobsService.publicWhere` + `JobFilters` + `job-filters.tsx` ; ne proposer que les facettes dont la donnée est réellement exploitable.
- **Fichiers** : `apps/api/src/jobs`, `apps/web/src/components/job-filters.tsx`, `apps/web/src/lib/labels.ts`.
- **Acceptation** : chaque filtre agit réellement sur les résultats ; aucun filtre fantôme.

### 4.2 ✅ Tris complémentaires

- **Objectif** : pertinence textuelle, rémunération (si fiable), correspondance (uniquement en mode profil) (§8.4).
- **État** : tri `DATE` et `QUALITY` seulement.
- **Travail** : ajouter `sort=RELEVANCE` et `sort=SALARY` à `jobQuerySchema`/`JobsService` ; le tri par correspondance reste réservé au mode `rank`.
- **Acceptation** : le tri par score n'est actif que dans le mode correspondance.

### 4.3 ✅ Recherche textuelle par champs

- **Objectif** : chercher sur l'intitulé, les compétences/technologies, l'entreprise, la localisation, séparément du texte libre (§8.1).
- **État** : un seul paramètre `q` (titre + description + entreprise).
- **Travail** : paramètres ciblés (`title`, `skills`, `company`, `location`) ou une syntaxe de recherche enrichie ; synonymes d'intitulés.
- **Acceptation** : une recherche « React » sur les compétences ne matche pas une description qui mentionne React par hasard.

### 4.4 ✅ Logique de combinaison des compétences

- **Objectif** : quand plusieurs compétences sont sélectionnées, une logique explicite « toutes / au moins une / configurable » (§8.3).
- **Travail** : paramètre `skillsMode=all|any`, appliqué au filtre de compétences.

### 4.5 ✅ Favoris et notifications candidat

- **Objectif** : sauvegarder des offres en favori, historique de consultation, alertes sur les nouvelles offres correspondantes (§4.1, §10.4).
- **État** : absent (seules les notifications Telegram de l'opérateur existent).
- **Travail** : table `Favorite` (jobSlug + profil), routes protégées, page « Favoris », alertes optionnelles.
- **Acceptation** : un favori est rattaché au profil, jamais visible par un autre utilisateur.

---

## Phase 5 — Collecte et observabilité (P2)

### 5.1 Connecteurs spécialisés en repli

- **Objectif** : invoquer les connecteurs ATS/job boards comme stratégie de secours de l'agent (§4.7 étape 3).
- **État** : déjà noté « reste à faire » dans `roadmap.md` (les connecteurs vivent dans `packages/job-connectors` mais ne sont pas invoqués par `run-agent`).
- **Fichiers** : `packages/orchestrator`, `packages/job-connectors`.

### 5.2 ✅ Indicateurs de santé réels

- **Objectif** : métriques issues des données réelles (§25) : offres collectées/valides/doublons/écoles, taux de dates vérifiables, échecs, durée d'analyse, échecs de génération.
- **État** : `ModelCall`, `ConnectorRun`, logs structurés existent, mais pas de tableau de bord consolidé.
- **Travail** : agrégats exposés par l'API + section dédiée du dashboard.

---

## Phase 6 — Sécurité et données personnelles (P1)

### 6.1 ✅ Rétention et suppression des CV

- **Objectif** : durée de conservation adaptée et suppression des fichiers temporaires après usage (§19, §10.2).
- **État** : rétention `MatchingRun` (72 h) existe ; pas de rétention sur le CV fichier (dépend 1.4).
- **Travail** : `expiresAt` + purge sur les CV importés, suppression des fichiers temporaires.

### 6.2 ✅ Politique de confidentialité des documents générés

- **Objectif** : informer clairement sur les traitements, limiter ce qui est transmis au fournisseur IA (§19).
- **Travail** : documentation + écran de consentement ; transmission minimale au fournisseur.

### 6.3 Authentification multi-utilisateurs (différé, Q-2)

- **Objectif** : comptes et rôles distincts, contrôle d'accès par document (§18, §19).
- **État** : mono-utilisateur (mot de passe unique + `x-internal-key`), question ouverte Q-2 dans `roadmap.md`.
- **Note** : décision d'architecture à trancher avant toute implémentation ; ne pas bricoler.

---

## Phase 7 — Tests et stabilisation (P0 avant mise en production)

### 7.1 ✅ Tests Playwright de bout en bout

- **Objectif** : parcours complets dans un navigateur (§22.6, §23) : recherche classique → filtres → détail → profil → import CV → recherche par correspondance → scores → génération CV → génération lettre → téléchargement → lien source.
- **Travail** : suite Playwright (desktop + mobile), états d'erreur/vide/chargement, erreurs console, captures d'écran.

### 7.2 ✅ Tests de non-régression de la règle d'affichage des scores

- **Objectif** : verrouiller que la recherche classique n'affiche jamais de score, et que le mode correspondance n'affiche un pourcentage que sur les analyses fiables (§11.4).
- **État** : tests unitaires du composant `MatchCard` et du contrat API présents ; ajouter un test E2E du parcours complet.

### 7.3 ✅ Vérification réelle des générations

- **Objectif** : avec une clé DeepSeek réelle, générer CV + lettre et vérifier le contenu, les accents, la pagination, l'extraction texte du document final (§22.5).
- **Note** : nécessite `DEEPSEEK_API_KEY` ; consigner précisément ce qui n'a pas pu être vérifié sans clé.

### 7.4 ✅ Application des migrations en production

- **Objectif** : appliquer `20261019000000_extend_contracts_and_freshness` et `20261019010000_candidate_profile_extension` à la base Neon avec `DATABASE_URL_OWNER`, puis `migrate resolve`.
- **Acceptation** : `pnpm db:migrate` et vérification que les nouvelles colonnes/enum sont en place.

---

## Dépendances principales

```
1.2 (date fiable) ────────────────► 4.1 (filtre date vérifiée)
1.1/1.3/1.4 (données) ────────────► 2.x (matching), 4.x (recherche)
2.1 (score document) ─────────────► 2.2 (boucle qualité), 3.3 (vérification)
1.4 (CV fichier) ─────────────────► 6.1 (rétention)
2.x + 3.x (documents) ────────────► 7.x (tests E2E)
1.x migrations ───────────────────► 7.4 (migration prod)
```

## Ordre recommandé

1. **Phase 1** (fondations de données) puis **7.4** (migrations) : débloque tout le reste en base.
2. **Phase 2** (matching/scoring) : c'est le cœur de la valeur différentielle.
3. **Phase 3** (prévisualisation documents) : rend la génération réellement utilisable.
4. **Phase 4** (recherche/filtres) puis **5** (collecte/observabilité).
5. **Phase 6** (sécurité) en parallèle, **Phase 7** (tests) en continu.
