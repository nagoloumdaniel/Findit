# Plan de fusion - Findit enrichi par Jobscout

> Établi le 2026-10-19 à partir des audits [Jobscout](audit-jobscout.md) et [Findit](audit-findit.md).
> Objectif : réintroduire et enrichir l'espace candidat, étendre le périmètre des offres, et appliquer
> les règles d'affichage des scores, sans casser l'existant.

## Décisions tranchées

| Sujet             | Décision                                                                                                                    | Justification                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 6 contrats        | `ALTERNANCE`, `INTERNSHIP`, `CDI`, `CDD`, `INTERIM`, `STUDENT_JOB`                                                          | correspond aux 6 catégories demandées (alternance, stage, CDI, CDD, intérim, job étudiant) |
| Fraîcheur         | fenêtre `LAST_5D` (120 h), défaut `LAST_5D` ; `EXTENDED_MAX_AGE_HOURS = 120`                                                | la règle des 5 jours glissants devient le plafond                                          |
| Profil            | étendre le singleton `Profile` (éducation, certifications, projets, préférences) + table `Resume` pour le CV fichier        | préserve le singleton existant, migration additive                                         |
| Rendu CV          | récupérer `@findit/documents`, ajouter 3 modèles (classique, moderne, compact), option photo, couleur d'accent, export DOCX | le PDF seul ne suffit plus ; 3 modèles et DOCX sont un ajout neuf                          |
| Scoring documents | récupérer `@findit/matching-engine` (score par règles + tech-dictionary)                                                    | déterministe, explicable, gratuit, complément du matching LLM                              |
| Lettres           | récupérer `letters.service.ts` + `letter-document.tsx`, réadapter sur `@findit/ai`                                          | génération factuelle avec refus anti-invention éprouvé                                     |
| Identité          | accent or `--color-gold-*` (`#d4af37`) partout, y compris les PDF                                                           | réaccorde l'ancien accent bleu `#1d4ed8` avec l'identité actuelle                          |

## Feuille de route ordonnée

### Phase B - Fondations (6 contrats + 5 jours)

- `packages/database/prisma/schema.prisma` : enum `ContractType` à 6 valeurs + migration.
- `packages/shared/src/job-scope.ts` : `JOB_CONTRACTS`, `DEFAULT_CONTRACTS`, `LAST_5D`, `EXTENDED_MAX_AGE_HOURS`.
- `packages/job-classification/src/contract.ts` : vocabulaires CDI/CDD/INTERIM/STUDENT_JOB.
- `packages/extract/src/contract.ts` + `schema.ts` : prompt d'extraction à 6 contrats.
- `packages/persist/src/persist.ts` + `packages/job-pipeline/src/ingest.ts` : borne et `expiresAt` à 120 h.
- `apps/api/src/jobs/job-query.ts` : enum de fraîcheur + `LAST_5D`.
- Connecteurs : fenêtres dérivées (`france-travail.ts`, `workday.ts`, `linkedin.ts`, seed).

### Phase F - Génération de CV (3 modèles + photo + couleur + DOCX)

- Package `@findit/documents` (récupéré puis étendu).
- 3 modèles, option photo, couleur d'accent, export DOCX aligné sur le PDF.

### Phase D - Espace candidat (import/parsing CV + profil enrichi)

- Récupérer `extract-text.ts` + `structured-resume.ts`.
- Route privée d'import CV (PDF/DOCX/TXT), garde `ProfileKeyGuard`, table `Resume`.
- Étendre `Profile` (éducation, certifications, projets, préférences).

### Phase E - Matching par règles + règle d'affichage des scores

- Récupérer `@findit/matching-engine`.
- Mode de recherche « Correspondance avec mon profil » distinct de la recherche classique.
- Cas A : aucun score sur les cartes en recherche classique. Cas B : scores sur les cartes en mode profil.

### Phase G - Lettres de motivation

- Récupérer `letters.service.ts`, génération factuelle anti-invention, export PDF/DOCX.

### Phase H - Stabilisation

- Tests unitaires + intégration + Playwright + rapport final.

## Critères d'acceptation clés

1. 6 contrats collectés et filtrables, fraîcheur plafonnée à 5 jours, offres sans date fiable exclues des résultats garantis.
2. 3 modèles de CV (avec/sans photo, couleur personnalisable) téléchargeables en PDF et DOCX, lisibles ATS.
3. Lettres cohérentes avec le profil, sans fait inventé.
4. Scores absents des cartes en recherche classique, présents uniquement en mode « correspondance ».
5. Tests verts, aucune régression sur les 779 tests existants.
