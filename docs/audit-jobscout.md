# Audit de référence : JobScout

Audit en lecture seule du projet **JobScout** (`D:\projets\jobscout`), version 3.4.14. Objectif : extraire les bonnes idées pour enrichir le projet **Findit**.

Stack vérifiée (`package.json`) : Next.js 15 (`next ^15.1.0`), React 19, TypeScript 5.6, Tailwind 3.4, SQLite via `node:sqlite` (`DatabaseSync`), Vitest 5. Dépendances clés : `@react-pdf/renderer ^4`, `docx ^9`, `pdf-parse`, `pdfjs-dist ^4.7`, `mammoth`, `tesseract.js ^5`, `playwright ^1.48`, `jsdom`, `zod ^3.23`, `@anthropic-ai/sdk`, `undici`.

Architecture générale : application Next.js App Router dont la logique métier vit dans `lib/` (modules marqués `import "server-only"`), les prompts dans `prompts/*.md`, l'API dans `app/api/*/route.ts`, et l'UI dans `app/` + `components/`.

---

## 1. Génération de CV

### 1.1 Pipeline complet

Le pipeline CV est : génération IA structurée -> validation anti-hallucination -> limites ATS -> relecture -> rendu PDF (boucle une page) -> rendu DOCX (même contenu réduit) -> écriture disque.

- `lib/ai/generate-cv.ts` : `generateCV(profile, offre, lang)` est l'entrée. Elle lit le prompt système `prompts/generate-cv.md`, appelle `callStructured` avec un outil `build_cv` (schéma JSON complet), puis `parseGeneratedCV`, `validateCVAgainstProfile`, `enforceAtsLimits`, `proofreadCV`.
- `app/api/generate/cv/route.ts` et `app/api/generate/all/route.ts` orchestrent la génération, le rendu et la sauvegarde.

### 1.2 Nombre de templates / modèles

**Un seul modèle de CV**, sobre, une colonne, compatible ATS. Pas de galerie de templates. Le modèle est décrit dans le prompt (`prompts/generate-cv.md`, section "Structure attendue") et rendu par deux implémentations parallèles :

- `lib/pdf/cv-template.tsx` : `CVDocument({ cv, language })`, rendu avec `@react-pdf/renderer`.
- `lib/docx/render.ts` : `renderCVDocx(cv, language)`, rendu avec le paquet `docx`.

Les deux partagent exactement les mêmes libellés et la même typographie via `LABELS` et `typographyFor` (`lib/text/lang.ts`, `lib/text/typography.ts`), ce qui garantit la cohérence PDF/DOCX.

### 1.3 Structure des sections

Définie par le type `GeneratedCV` (`lib/ai/generate-cv.ts` lignes 14-51) et le schéma d'outil `build_cv` :

- `identity` : full_name, email, phone, location, linkedin_url, portfolio_url.
- `summary` (profil, 3-5 phrases).
- `sections.experiences` : title, company, location, start_date, end_date, bullet_points.
- `sections.projects` : projet personnel/entrepreneurial, séparé des expériences salariées (0 ou 1).
- `sections.educations` : school, degree, field, start_date, end_date, bullet_points.
- `sections.skills_flat` : liste à plat, rendue pipe-séparée (15-25 compétences).
- `sections.languages` : name + level.

L'ordre de rendu dans `CVDocument` : NOM, ligne de contact, PROFIL, EXPÉRIENCE, PROJET PERSONNEL, FORMATION, COMPÉTENCES ET LANGUES.

### 1.4 Option photo

**Absente.** Aucune photo n'est gérée dans `GeneratedCV`, ni dans `CVDocument`, ni dans `renderCVDocx`. Le modèle est volontairement sobre (noir, Helvetica/Calibri) pour l'ATS. C'est un choix de conception explicite : aucune image, aucun emoji, aucune icône (règle 13 du prompt).

### 1.5 Personnalisation des couleurs

**Aucune.** Les couleurs sont codées en dur dans `cvStyles` (`lib/pdf/cv-template.tsx`) : `color: "#000000"`, `#202020`, `#3a3a3c`. Pas de thème de couleur ni d'accent configurable. Le DOCX utilise `color: "3a3a3c"` pour les dates. Fonts fixes : `Helvetica` (PDF) et `Calibri` (DOCX, `const FONT = "Calibri"`). Le point à noter : la sobriété est assumée comme argument ATS, pas une limitation à combler.

### 1.6 Compatibilité ATS

Explicitement visée :

- Prompt `generate-cv.md` : "génère un CV optimisé pour ATS (Workday, Greenhouse, Taleo, iCIMS)".
- Une seule colonne, police standard, pas de tableau ni d'image.
- `Font.registerHyphenationCallback((word) => [word])` (`lib/pdf/cv-template.tsx` ligne 18) pour désactiver la césure automatique (react-pdf coupe mal les mots français).
- Limites dures `enforceAtsLimits` (`lib/ai/generate-cv.ts` lignes 215-249) pour tenir sur une page : max 4 expériences, max 4 puces/expérience, max 3 formations, résumé tronqué à ~90 mots, max 25 compétences, max 1 projet (3 puces).
- Tri anti-chronologique robuste `compareRecentFirst` + `dateSortKey` (`lib/ai/cv-shape.ts` lignes 122-148), qui gère MM/AAAA, YYYY-MM, YYYY, "present"/"Aujourd'hui". Ce tri est crucial car `enforceAtsLimits` ne garde que les 4 premières expériences.

### 1.7 Boucle de rétrécissement une page A4

`lib/pdf/render.ts` :

- `fitCVToOnePage(cv, language)` (lignes 81-96) : rend le PDF, compte les pages via `pdfPageCount` (qui utilise `pdf-parse/lib/pdf-parse.js` pour lire `numpages`), et si > 1 page, appelle `shrinkCV(cv, level+1)` puis re-rend, jusqu'à 4 itérations, puis un dernier `shrinkCV(cv, 4)` en dernier recours.
- `shrinkCV(cv, level)` (lignes 27-64) : réduit progressivement les plafonds :
  - `expCap = max(2, 4 - level)`, `bulletCap = max(2, 4 - level)`, `eduCap = max(1, 3 - level)`, `skillsCap = max(10, 25 - level*4)`, `summaryWords = max(35, 90 - level*18)`, `eduBulletCap = max(0, 2 - level)`.
  - Les projets personnels sont sacrifiés en premier (`level >= 3 ? 0 : 1`).
- `trimSentence(s, level)` (lignes 66-75) : au-delà du niveau 2, plafonne les puces à ~140 puis ~110 caractères, coupées à la dernière limite de mot.
- `fitCVToOnePage` retourne **le buffer PDF ET le `cv` final réduit**, pour que le DOCX utilise exactement le même contenu (commentaire ligne 79). C'est un point clé : PDF et DOCX restent identiques.

### 1.8 Génération et téléchargement PDF/DOCX

- PDF : `renderToBuffer(React.createElement(CVDocument, ...))` (`@react-pdf/renderer`). Pas de `PDFViewer` (pas de prévisualisation React) : rendu serveur en buffer.
- DOCX : `Packer.toBuffer(new Document(...))` du paquet `docx`.
- Sauvegarde : `saveDocument` (`lib/db/documents.ts`) écrit sur disque dans `data/documents/{offre_id}-{company}-{title}/` avec des noms lisibles `CV - Prénom NOM - Intitulé.pdf/.docx` (`buildDocFilename`). Dédoublonnage en base (une ligne par `(offre_id, type, format)`, mise à jour du chemin). Gestion propre de l'erreur "fichier ouvert dans Word/Acrobat" (`EBUSY`/`EPERM`/`EACCES` -> `AiContentError` 409).
- Téléchargement : `app/api/documents/[id]/route.ts` renvoie le fichier avec `Content-Disposition` RFC 5987 (nom ASCII + `filename*=UTF-8`).

### 1.9 Prévisualisation

Pas de prévisualisation visuelle intégrée du PDF/DOCX. L'UI (`app/(app)/offres/[id]/actions.tsx`) propose des liens de téléchargement Word/PDF par document et un bouton "Ouvrir le dossier" (`/api/settings/open-folder`). Seul le **message V.I.E** a une prévisualisation texte inline (`msgPreview` dans `actions.tsx`). Pour Findit, c'est un axe d'amélioration possible : un aperçu PDF côté client (iframe ou `PDFViewer`) n'existe pas ici.

---

## 2. Génération de lettre de motivation

### 2.1 Où et comment

- `lib/ai/generate-lm.ts` : `generateLM(profile, offre, lang)`. Prompt système `prompts/generate-lm.md`, outil `build_lm` avec un schéma minimal : `object` (ligne d'objet) + `body_paragraphs` (exactement 4, minItems/maxItems 4).
- Rendu : `LMDocument` (`lib/pdf/cv-template.tsx`) et `renderLMDocx` (`lib/docx/render.ts`). Les deux ajoutent eux-mêmes l'en-tête (nom, coordonnées), la date épistolaire (`letterDateLine`), le destinataire, la salutation, la formule de politesse et la signature. Le modèle ne doit produire que l'objet + les 4 paragraphes.

### 2.2 Sections (structure Vous / Moi / Nous / Disponibilité)

Définies dans `prompts/generate-lm.md` :

- §1 [Vous + accroche] : parcours en une phrase + candidature au poste précis + 1-2 éléments tirés de l'annonce.
- §2 [Moi, preuves] : 2-3 expériences avec faits et chiffres **du profil**, chaque expérience datée.
- §3 [Nous] : pourquoi cette opportunité + atouts (langues, mobilité, compétences).
- §4 [Disponibilité] : entretien présentiel/visio + remerciement.

Corps total cible : 300-380 mots, phrases de 25 mots max.

### 2.3 Cohérence avec le CV

- `profileFacts(profile)` (`lib/ai/profile-facts.ts`) est injecté comme **seule source autorisée** pour le §2 : chaque expérience avec ses dates, description, puces et `skills_used`. Le prompt interdit toute affirmation non présente dans ces faits.
- `validateLMAgainstProfile` (`lib/ai/validate.ts` lignes 183-214) détecte (sans supprimer, en prose libre) les mentions d'entreprise non connues du profil, via une regex `chez X / à X / au sein de X`.
- `proofreadLM` (`lib/ai/proofread.ts`) fait une passe de relecture qui supprime/neutralise les affirmations non étayées.
- `enforceLMShape` (`lib/ai/generate-lm.ts` lignes 91-127) normalise défensivement : retire un préfixe "Objet :" ajouté par le modèle, retire salutation/formule de politesse insérées à tort dans les paragraphes, force exactement 4 paragraphes.

### 2.4 Langue détectée (FR/EN)

`detectDocLanguage` (`lib/text/lang.ts` lignes 41-51) détermine `fr` ou `en` à partir du titre + description, avec double vote (comptage global de mots-outils + vote ligne par ligne), et un indice `hint` (langue déclarée par WTTJ) + pays anglophone. Seulement `fr` et `en` sont rendus (`type DocLang = "fr" | "en"`). La consigne de langue est injectée via `lmLanguageInstruction(lang)` (`lib/ai/lang-prompts.ts`). Le garde-fou `looksFrench` + `ensureEnglish` renvoie à la traduction tout texte encore en français après relecture.

### 2.5 Message V.I.E

Séparé : `lib/ai/generate-msg-vie.ts` (`generateMsgVie`), outil `build_msg_vie` à 3 lignes structurées (`intro_line`, `skills_pitch`, `availability_line`), concaténées avec sauts de ligne. Garde-fou de non-vacuité (`text.length < 50` -> erreur) et plafond dur 2000 caractères. Route `app/api/generate/msg/route.ts` refuse les offres non V.I.E (`contract_category !== "vie"`). Le message V.I.E est spécifique à JobScout (Civiweb / Business France) : à transposer seulement si Findit cible aussi les V.I.E.

### 2.6 Garde-fou mobilité (spécifique et intéressant)

`ensureMobility` (`lib/ai/generate-lm.ts` lignes 149-192) : vérifie de façon **déterministe** que le §4 nomme le lieu de l'offre quand il diffère de la ville du candidat, et sinon répare le seul §4 par un appel ciblé (rôle `reviewer`), jamais bloquant. Ignore les cas "Télétravail / Remote". C'est un exemple remarquable de réparation ciblée post-génération.

---

## 3. Scoring

### 3.1 Emplacement

`lib/scoring/local.ts` : scoring **100% local, déterministe, sans IA** (contrairement à l'ancien `lib/ai/score-offre.ts` qui batchait par IA et existe encore mais n'est plus utilisé par le scan). `scoreOffreLocal(profile, offre)` et `scoreOffresLocal`.

L'orchestrateur de scan (`lib/scan/orchestrator.ts`, `scoreBatch`) appelle `scoreOffresLocal` par lots de 20 (`SCORE_BATCH = 20`), sans appel réseau ni coût de tokens.

### 3.2 Pondérations exactes

Base pondérée (ligne 275-277) :

```
base = sector.score * 0.3 + skills.score * 0.5 + country * 0.2
```

Bonus ajoutés ensuite, plafonnés à 100 (lignes 282-289) :

```
languageBonus = (language.score / 100) * 8    // jusqu'à +8
durationBonus = (duration.score / 100) * 5    // jusqu'à +5 (V.I.E uniquement)
contractDelta = ((contract.score - 50) / 50) * 10  // de -6 à +10
finalScore = round(max(0, min(100, base + languageBonus + durationBonus + contractDelta)))
```

### 3.3 Détail des sous-scores

**Secteur** (`scoreSector`, lignes 47-77) :

- Aucun secteur ciblé -> 50 (neutre).
- Pour chaque secteur : token présent dans le titre -> +1.0 ; dans la description -> +0.6.
- `best = (total / nb_secteurs) * 100` ; si au moins un match dans le titre -> `max(best, 70)` ; plafonné 100.

**Compétences** (`scoreSkills`, lignes 79-115) :

- Distingue compétences **ancrées** (`evidence_experience_ids.length > 0`, poids 2) et **listées seulement** (poids 1).
- `maxWeight = ancrées*2 + listées*1` ; `density = hits / maxWeight` ; `absoluteBoost = min(1, matched.length / 6)`.
- `score = min(100, density*70 + absoluteBoost*30)`. Aucune compétence -> 30.

**Pays** (`scoreCountry`, lignes 117-122) : pas de pays cible -> 50 ; pas de pays d'offre -> 50 ; match -> 100 ; sinon 0.

**Langue (bonus)** (`scoreLanguage`, lignes 180-193) : détecte la langue de l'offre par comptage de mots-clés (`LANG_KEYWORDS`), vérifie la maîtrise du candidat (`userMastersLanguage`, niveau B2+ via `PROFICIENT_LEVELS`). Match -> 100 ; anglais en repli sur offre non EN -> 30 ; sinon 0.

**Durée V.I.E (bonus)** (`scoreDuration`, lignes 212-225) : ne s'applique que si `contractCategory === "vie"`. `extractDurationMonths` lit "N mois". 12-24 mois -> 100 ; 6-11 -> 60 ; durée absente -> 30 (neutre) ; sinon 20.

**Contrat** (`scoreContract`, lignes 237-250) : utilise `classifyContract`. Catégorie "autre" -> 50 ; catégorie dans `preferred_contracts` -> 100 ; identifiée mais non recherchée -> 20. Défaut `preferred_contracts = ["cdi", "cdd"]`.

### 3.4 Exposition / détail dans l'interface

- `setOffreScore` (`lib/db/offres.ts`) stocke `score` + `score_breakdown` (JSON avec `reason`).
- `app/(app)/offres/[id]/page.tsx` (lignes 76-90) affiche la section "Pourquoi ce score ?" avec des `ScoreBar` par dimension : Secteur, Compétences, Pays, Langue (si `!= null`), Contrat (si `!= null`), Durée V.I.E (si `> 0`), plus la raison textuelle.
- `components/app/score-orbit.tsx` : jauge orbitale SVG du score (dashboards).
- `lib/utils.ts` : `scoreColor(score)` -> ton "excellent" (>=80) / "bon" (>=60) / "moyen" (>=40) / "faible", avec variables CSS respectant le contraste >= 4,5:1.
- Le classement "smart" des offres (`SMART_ORDER` dans `lib/db/offres.ts`) combine `score` + bonus de fraîcheur léger (<=1j +6, <=3j +4, <=7j +2), départagé par id pour la stabilité de pagination.

Point fort à transposer : le **breakdown détaillé et justifié** d'un score sans IA, avec explication textuelle ("secteur X", "skills ancrées : ...", "pays OK", "langue EN OK", "durée 18 mois", "CDI recherché").

---

## 4. Garde-fous anti-hallucination

C'est le domaine le plus riche et le plus transposable. Stratégie en défense en profondeur, en 5 couches :

### 4.1 Validation post-LLM qui SUPPRIME les entités non ancrées

`validateCVAgainstProfile(cv, profile, lang, opts)` (`lib/ai/validate.ts` lignes 48-175) :

- Construit les ensembles d'entités "connues" depuis le profil : entreprises des expériences + écoles des formations (`knownCompanies`), noms de compétences + `skills_used` (`knownSkills`).
- **Expériences** : supprime toute expérience dont l'entreprise n'est pas connue (comparaison tolérante `looselyEquals` / `looselyContains`, normalisation NFD + minuscules). Un plancher de sécurité conserve au moins 1 expérience pour ne jamais livrer un CV vide.
- **Compétences** (`skills_flat`) : supprime toute compétence non ancrée. Reconnaissance avancée :
  - correspondance exacte normalisée ;
  - sous-chaîne pour les compétences composées ("React Native" vs "React") ;
  - correspondance par ensemble de tokens **d'une seule compétence connue** (`tokensOf` + `knownTokenSets`) pour reconnaître "Office Suite" vs "Suite Office", sans jamais laisser passer une recombinaison de deux compétences distinctes ;
  - `isToolLike` (chiffre, capitale interne, `.js`, `+`, `#`) pour les noms d'outils qui restent soumis à l'ancrage même en anglais ;
  - mode `lenient` pour l'anglais quand la traduction du vocabulaire a échoué (conserve les compétences génériques avec avertissement, mais pas les outils).
- Retourne `{ cv: nettoyé, report: { warnings, stripped } }` avec journalisation (`[generateCV] anti-hallucination: X exp + Y skills supprimées`).

Appelée dans `generateCV` (ligne 197), avec `extraKnownSkills` = vocabulaire de compétences traduit en anglais pour que l'ancrage reconnaisse les compétences traduites par le modèle.

### 4.2 Ancrer les compétences anglaises par traduction préalable

`generateCV` (lignes 160-164, 191-196) : pour un CV en anglais, traduit d'abord le vocabulaire de compétences du profil (`translateToEnglish`), en parallèle de la génération, et le passe au validateur en `extraKnownSkills` + `strict`. Sans cela, une compétence traduite ("Project management") n'aurait pas d'ancre littérale française et serait supprimée à tort.

### 4.3 Injection d'un "digest factuel" dans les prompts

`profileFacts(profile)` (`lib/ai/profile-facts.ts`) : produit un digest textuel des faits (chaque expérience avec dates, description, puces, et **ses outils** `skills_used`), injecté dans `generateLM` et `proofread` comme "SEULE source autorisée". C'est ce qui empêche le modèle d'inventer budgets, prospections, cahiers des charges.

### 4.4 Relecture qui supprime les affirmations non étayées

`proofread.ts` (`proofreadCV`, `proofreadLM`) : passe de relecture (rôle `reviewer`, modèle dédié) dont la règle 2 du prompt (`SYSTEM_FR`/`SYSTEM_EN`) ordonne de "supprimer ou neutraliser toute affirmation NON étayée par les faits". Contrat de sécurité : la relecture ne doit **jamais** faire échouer une génération (en cas d'erreur, on renvoie les textes d'origine et on journalise, lignes 117-120). Un texte vidé volontairement par la relecture reste vide (sauf le résumé, conservé).

### 4.5 LM : log sans suppression (prose libre)

`validateLMAgainstProfile` (`lib/ai/validate.ts` lignes 183-214) : en prose libre on ne peut pas supprimer agressivement, donc on **journalise** les mentions d'entreprises non vérifiées (regex `chez/à/au sein de X`), sans auto-strip.

### 4.6 Réparation ciblée déterministe

`ensureMobility` (LM, cf. §2.6) : vérification déterministe + réparation ciblée d'un seul paragraphe, jamais bloquante.

À retenir pour Findit : la séparation nette entre **rédaction** (writer) et **relecture** (reviewer), la validation structurelle post-LLM qui supprime (pas seulement avertit), l'ancrage par traduction préalable, et le principe "jamais bloquant" pour les passes de qualité.

---

## 5. Parsing CV

### 5.1 Détection de type de fichier

`lib/cv/detect.ts` : `detectFileKind(buffer, filename)` par octets magiques :

- `%PDF` -> pdf ; `PK\x03/\x05` (zip, cherche `word/document.xml`) -> docx ; `\xD0\xCF\x11\xE0` (OLE) -> doc ; PNG/JPEG -> image ; heuristique ASCII imprimable > 85% -> txt.

### 5.2 Cascade d'extraction de texte

`lib/cv/text-extract.ts` : `extractText(buffer, filename)` -> `ExtractionResult { text, kind, strategy, wordCount, hasCvKeywords }` :

- **txt** : décodage UTF-8 direct.
- **docx** : `mammoth.extractRawText` (stratégie "mammoth").
- **image** : `tesseract.js` `recognize(buffer, "fra+eng")` (stratégie "tesseract"). Note : pas d'OCR des PDF scannés côté serveur (commentaire lignes 113-115) ; on signale l'échec à l'UI.
- **pdf** : deux stratégies en parallèle puis choix du plus riche :
  1. `extractPdfFast` via `pdf-parse/lib/pdf-parse.js` (import du chemin interne pour éviter l'effet de bord du test file).
  2. `extractPdfStructured` via `pdfjs-dist/legacy/build/pdf.mjs` qui préserve les coordonnées x/y et **reconstruit les mises en page multi-colonnes** : détection de frontière de colonne (clustering des positions x, écart au milieu), puis tri par y. C'est un vrai plus par rapport à pdf-parse.
  - Sélection : `pdfjs` si son score > `fastScore * 1.1`, sinon `pdf-parse` si >= 50 mots, sinon "pdf-empty" (PDF probablement scanné).
- Le score interne = `wordCount + (hasCvKeywords ? 50 : 0)` avec `CV_KEYWORDS` (experience, formation, skills, compétences...).

### 5.3 Structuration par IA (appel d'outil forcé / JSON contraint)

`lib/cv/extract-semantic.ts` : `extractCV(text)` :

- Cap `MAX_CV_TEXT_CHARS = 60_000`.
- Outil `extract_cv` avec un schéma JSON complet (identity, summary, experiences avec `skills_used`, educations, skills avec `category` enum `technical/soft/language/tool` et `level` enum `beginner/intermediate/advanced/expert`, languages, certifications).
- `callStructured` (role writer, maxTokens 8000), `assertNotTruncated`, puis validation Zod.

### 5.4 Validation Zod

`lib/cv/types.ts` : `ExtractedCVSchema` (zod) valide la sortie. `extract-semantic.ts` lignes 165-171 : si `safeParse` échoue, on journalise les issues (5 max) et on renvoie un message FR actionnable (jamais le rapport Zod verbeux anglais).

### 5.5 Conversion vers le profil + score de confiance

`lib/cv/validate.ts` : `buildProfileFromExtraction(ex, rawCvText)` :

- Trie les expériences par date desc.
- Déduplique les compétences (case-insensitive), garde le niveau le plus élevé.
- Corrèle les compétences avec leurs expériences via `skills_used` -> `evidence_experience_ids` (indices positionnels, résolus en base après sauvegarde). C'est la clé de l'ancrage utilisé par le scoring et l'anti-hallucination.
- Déduplique langues et formations.
- `computeConfidence(ex)` (lignes 134-156) : identité (max 30 : nom 10, email 10, phone 5, location 5), expériences datées (max 30, 10 chacune), compétences (max 20, 2 chacune), formations (max 10, 5 chacune), puces (max 10). Plafonné 100.

### 5.6 Fusion / enrichissement de profils

`lib/cv/merge.ts` : `planMerge` / `applyMerge` / `mergeProfile` / `dedupProfile` / `fillMissingIdentity` :

- `isSameExperience` : même entreprise (Jaccard tokens >= 0.7) + similarité titre >= 0.45 + chevauchement de dates.
- `isSameEducation` : école Jaccard >= 0.7 + degré/spécialité >= 0.4 + dates.
- `mergeExperience` : titre/description les plus longs, dates les plus larges, fusion des puces (dédup Jaccard >= 0.7) et des skills.
- `fillMissingIdentity` : ne comble l'identité que si vide ou valeur de démonstration (`PLACEHOLDER_FULL_NAME`), jamais d'écrasement.
- Utilitaires dans `lib/cv/similarity.ts` : `normalizeStr`, `tokens`, `jaccard`, `strSim`, `datesOverlap`, `mergeBullets`.

Routes : `app/api/profile/extract/route.ts` (import initial) et `app/api/profile/merge/route.ts` (extraction + plan de fusion, puis confirmation en deux étapes). Refus AVANT lecture du fichier si l'IA n'est pas configurée (pour ne pas attendre une extraction lourde pour un refus prévisible).

---

## 6. Couche IA multi-fournisseurs

### 6.1 Abstraction

- `lib/ai/llm.ts` : **une seule primitive**, `callStructured(req)`, qui renvoie l'objet JSON demandé par un "outil" (nom + schéma), quel que soit le fournisseur. `StructuredRequest { role, system, user, tool, maxTokens }`, `StructuredResult { input, truncated, provider, model }`.
- Deux familles de code seulement : **anthropic** (API Messages native, SDK officiel) et **openai-compatible** (Chat Completions).

### 6.2 Catalogue des fournisseurs

`lib/ai/providers.ts` : `PROVIDERS` (Record `ProviderId` -> `ProviderPreset`) : anthropic, openai, gemini, mistral, deepseek, groq, openrouter, ollama, lmstudio, custom. Chaque preset décrit : `kind`, `baseURL`, `editableBaseURL`, `keyRequired`, `local`, `models { writer, reviewer }`, `structured` ("tools" | "json_schema"), `namedToolChoice`, `extraBody` (paramètres propres, ex. `reasoning_effort: "none"` pour OpenAI, `thinking: { type: "disabled" }` pour DeepSeek), `tokenParam` (`max_tokens` vs `max_completion_tokens`), `tokenHeadroom` (marge pour modèles "de raisonnement"), `timeoutMs`, `keyUrl`, `help`.

### 6.3 Échelle de stratégies de sortie structurée (repli cran par cran)

`callOpenAICompatible` (`lib/ai/llm.ts` lignes 271-395) : `LADDER` descend de `tools` (appel de fonction forcé) -> `json_schema` (sortie contrainte par schéma) -> `json_object` (mode JSON) -> `text` (JSON extrait du texte), en cas de refus (statuts `FALLBACK_ON`). Gestion fine : retrait d'un paramètre propre refusé nommément, puis rejeu du même cran. Retry une fois sur 429/5xx. Les modèles locaux (Ollama, LM Studio) démarrent en `json_schema` (pas de tool_choice).

### 6.4 Extraction JSON tolérante

`lib/ai/json-extract.ts` : `extractJsonObject`, `stripNoise` (retire `<think>`/`<thinking>`, balises ```json), `parseToolArguments`, `coerceToSchema` (re-met en forme les sous-objets renvoyés en chaîne JSON). Testé dans `tests/json-extract.test.ts`.

### 6.5 Modes (byok / unset / pack) et gestion des clés

`lib/ai/client.ts` : `LlmMode = "pack" | "byok" | "unset"`, `getLlmConfig()` relu à chaque appel (jamais mis en cache). Clés stockées dans la table `settings` avec des clés dédiées : `llm:mode`, `llm:license_key`, `llm:byok_key` (historique Anthropic), `llm:provider`, `llm:key:{provider}`, `llm:base_url:{provider}`, `llm:models:{provider}`. Le mode "pack" (proxy JobScout, clé de licence) n'existe que si `JOBSCOUT_PROXY_URL` est fournie. Rétro-compat dev via `ANTHROPIC_API_KEY` uniquement hors production. **Aucune clé n'est jamais renvoyée au navigateur** : `getLlmState()` ne renvoie que des hints masqués (`keyHint`, 4 derniers symboles).

Sécurité notable : `getClaude` neutralise explicitement `authToken: null` et `baseURL` pour ne jamais laisser `ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_BASE_URL` de l'environnement fuir vers un tiers (commentaire lignes 269-280). `validateBaseURL` exige HTTPS sauf localhost.

### 6.6 Séparation rédaction / relecture

`LlmRole = "writer" | "reviewer"`. Chaque fournisseur a un modèle `writer` (rédaction : extraction, CV, lettre, V.I.E) et un `reviewer` (relecture, traduction, réparation). `getLlmConfig().models[role]` sélectionne le bon modèle selon le rôle (Anthropic : Opus en writer, Sonnet en reviewer ; OpenAI : GPT-6 Sol / Luna ; etc.).

### 6.7 Transport HTTP et erreurs

- `lib/ai/http.ts` : `providerFetch` via `undici` avec un `Agent({ headersTimeout: 0, bodyTimeout: 0 })` pour lever le délai de 300 s du fetch Node (problème réel avec Ollama non-streaming), la garde réelle étant l'`AbortController` réglé sur `preset.timeoutMs`. `networkCode` / `isTimeoutError` pour distinguer "trop lent" de "injoignable".
- `lib/ai/errors.ts` : `translateAiError` -> messages FR actionnables, jamais de message technique anglais. Distingue finement : clé refusée (401), crédit épuisé (402), modèle introuvable (404), rate limit (429), serveur local éteint, https vs http, délai dépassé (504), contenu tronqué (`assertNotTruncated`). `genericFailure` pour les erreurs non-IA, avec détail technique uniquement en dev.

---

## 7. Sources et scan

### 7.1 Registre et métadonnées

- `lib/scrapers/registry.ts` : 7 scrapers (`wttj`, `linkedin`, `civiweb`, `apec`, `hellowork`, `francetravail`, `talent`).
- `lib/sources-meta.ts` : métadonnées UI (`scope` world/fr, `requiresEngine`, `unavailable`, `optIn`). Statut actuel : **civiweb** (suspendu, auth Business France), **apec** (suspendu, blocage anti-bot), **linkedin** (nécessite Chromium), **wttj/hellowork/talent** (opt-in selon CGU), **francetravail** (seule source par défaut).
- `lib/scrapers/base.ts` : interface `Scraper { name, scrape() }`, type `ScrapedOffre` (avec `description_status: "ok" | "failed" | "partial"`, `raw_payload`, `scrape_errors`), `ProgressEvent`, `htmlToText`, `getBrowser`/`newContext` (Playwright, headless, UA Chrome).

### 7.2 Méthode de collecte par source

- **France Travail** (`francetravail.ts`) : stratégie 1 = API officielle v2 (si `FT_CLIENT_ID`/`FT_CLIENT_SECRET`), stratégie 2 = scraping HTML de `candidat.francetravail.fr` (SSR), enrichissement détail par JSON-LD JobPosting ou sélecteurs CSS.
- **WTTJ** (`wttj.ts`) : index de recherche public **Algolia** (pas de scraping HTML, bloqué par AWS WAF), clé publique embarquée, 2 pages par secteur, champs `summary`/`key_missions`/`profile`/`benefits`/`contract_type`/`salary`.
- **HelloWork** (`hellowork.ts`) : scraping HTML SSR, cartes repérées par `input[name="offerId"]`, détail par JSON-LD ou sélecteurs.
- **Talent.com** (`talent.ts`) : 9 sous-domaines par pays (fr/be/ch/lu/ca/www/ma/tn/sn), SSR Next.js, cartes `[data-testid^="jobcard-container-"]`, détail par JSON-LD ou sélecteurs (classes hashées matchées par substring).
- **LinkedIn** (`linkedin.ts`) : seul scraper Playwright (headless Chromium), API guest `jobs-guest/jobs/api/seeMoreJobPostings/search` + `jobPosting/{id}`, parsing des cartes + JSON-LD JobPosting, inférence du pays depuis le lieu (`inferCountryFromLocation`). Timeout par offre (45 s) via `Promise.race`, arrêt après 15 échecs consécutifs.
- **APEC** (`apec.ts`) : API `webservices/rechercheOffre` + détail via version SEO servie au User-Agent `facebookexternalhit`.
- **Civiweb** (`civiweb.ts`) : API Azure `civiweb-api-prd.azurewebsites.net/api/Offers/search`, mapping pays, filtre V.I.E (élargit le filtre pays car les missions sont par nature à l'étranger).

### 7.3 Gestion des dates de publication

- Chaque scraper remplit `posted_at` (au format YYYY-MM-DD, `String(...).slice(0, 10)`) depuis la source : `dateCreation`/`dateActualisation` (FT), `published_at` (WTTJ Algolia), `datePosted`/`datePosted` JSON-LD (LinkedIn, HelloWork, Talent), `datePublication` (APEC), `startBroadcastDate`/`creationDate` (Civiweb).
- Le classement "smart" (`SMART_ORDER` dans `lib/db/offres.ts`) combine score + bonus de fraîcheur (<=1j +6, <=3j +4, <=7j +2), recalculé chaque minute via `ORDER_TTL_MS = 60_000`.

### 7.4 Fraîcheur et déduplication

- `upsertOffreFromSource` (`lib/db/offres.ts`) : `ON CONFLICT(source, source_id) DO UPDATE`, donc chaque scan met à jour l'offre existante (contenu, dates, statut) et rafraîchit `scraped_at`.
- `fixMojibake` : filet anti-mojibake (UTF-8 double-décodé) appliqué aux champs texte.
- Table `scan_runs` pour tracer chaque exécution (status, log JSON).

### 7.5 Orchestrateur

`lib/scan/orchestrator.ts` : `runScan` (async generator) itère les scrapers, draine les événements de progression, upsert + score par lots, journalise les erreurs fatales dans `scan_runs.log`, gère les sources suspendues (jamais interrogées, même cochées dans un ancien profil).

---

## 8. Types de contrats

### 8.1 Énumération

`lib/contracts.ts` :

- `ContractCategory = "cdi" | "cdd" | "vie" | "stage" | "alternance" | "autre"`.
- `CONTRACT_LABELS` : CDI, CDD, V.I.E, Stage, Alternance, Autre.
- `CONTRACT_ORDER` : ordre d'affichage.

`lib/cv/types.ts` : `preferred_contracts` est un `z.enum(["cdi", "cdd", "vie", "stage", "alternance"])` avec défaut `["cdi", "cdd"]`. (Pas de "intérim" ni "freelance" dans les préférences utilisateur, mais "autre" couvre le reste en classification ; le label intérim/freelance apparaît dans le mapping de certaines sources, ex. `CONTRACT_MAP` APEC avec "101889": "Intérim", "597139": "Freelance", et `CONTRACT_LABELS` WTTJ avec `freelance`.)

### 8.2 Classification

`classifyContract(input)` (`lib/contracts.ts` lignes 24-73) : ordre de priorité :

1. V.I.E (détection stricte `detectVie`, ré-évaluée, ignore le flag figé `is_vie`).
2. Alternance/apprentissage (`alternance|alternant|apprentissage|apprenti|contrat pro|professionnalisation`).
3. Stage (`stage|stagiaire|internship|intern`).
4. CDD (`cdd|fixed-term|temporary|temporaire|contrat a duree determinee`).
5. CDI (`cdi|permanent|contrat a duree indeterminee`).
6. Repli JSON-LD `employmentType` (intern -> stage, temporary/contractor -> cdd, full_time/part_time -> cdi).
7. Sinon "autre".

### 8.3 Détection V.I.E stricte

`lib/vie.ts` : `detectVie(opts)` évite le faux positif du mot français "vie". Marqueurs : source `civiweb` -> toujours V.I.E ; URL civiweb/businessfrance ; "V.I.E" avec points ; "Volontariat International en Entreprise" ; "International Volunteer Program/Experience" ; "Business France" + contexte ; acronyme "VIE" majuscules isolé avec confirmation contextuelle dans une fenêtre de ~120 caractères.

---

## 9. Modèle de données

### 9.1 Base SQLite

`lib/db/index.ts` : `node:sqlite` (`DatabaseSync`), PRAGMA WAL + foreign_keys ON, schéma lu depuis `lib/db/schema.sql`, migration additive `ALTER TABLE` sous try/catch. Helpers : `getSetting`/`setSetting`, `parseJson`/`asJson`, `plain`/`plainAll` (ré-emballe les lignes à prototype null pour la sérialisation React Server Components), `transaction`.

### 9.2 Tables (`lib/db/schema.sql`)

- **profile** : identité (full_name, email, phone, location, linkedin_url, portfolio_url), summary, raw_cv_text, `sectors`/`target_countries`/`sources_enabled`/`preferred_contracts` (JSON text), extraction_confidence, timestamps.
- **experiences** : profile_id, title, company, location, start_date, end_date, description, `bullet_points` (JSON), `skills_used` (JSON), position_index.
- **educations** : school, degree, field, location, dates, description, position_index.
- **skills** : name, category, level, `evidence_experience_ids` (JSON).
- **languages** : name, level.
- **offres** : source, source_id (UNIQUE(source, source_id)), url, title, company, country, location, contract_type, salary, description_html, description_text, description_status, posted_at, scraped_at, score, score_breakdown (JSON), is_vie (flag figé au scan), raw_payload (JSON), scrape_errors. Index : score, posted_at, country.
- **documents** : type (cv/lm/msg), offre_id, file_path, format, generated_at.
- **candidatures** : offre_id, applied_at, status, notes, contact, deadline, cv_doc_id/lm_doc_id/msg_doc_id, + champs snapshot pour les candidatures importées (ext_company, ext_title, ext_country, ext_url, ext_score).
- **settings** : key/value (clés IA, dossier documents, onboarding...).
- **scan_runs** : started_at, finished_at, status, log (JSON).

Note : les `certifications` sont extraites par l'IA (`ExtractedCVSchema`) mais **ne sont pas persistées** (pas de table, pas dans `ProfileFull`). Les candidatures gèrent un snapshot pour l'import (sans `offre_id`).

### 9.3 Accès aux données

- `lib/db/queries.ts` : `getProfile()` (recompose le `ProfileFull` en parsant les colonnes JSON), `saveProfile()` (DELETE + INSERT transactionnel).
- `lib/db/offres.ts` : `searchOffres` (avec **cache mémoire** invalidé par empreinte `PRAGMA data_version` + `total_changes()`), `upsertOffreFromSource`, `setOffreScore`, `listOffres`, `getOffre`, `suggestedOffres`, `offresCounts`.
- `lib/db/documents.ts` : `saveDocument`, `listDocuments`, `getDocument`, `offreFolderPath`, `buildDocFilename`, `slugify`.
- `lib/db/candidatures.ts`, `lib/db/dashboard.ts` (non détaillés ici, mais présents).

Point fort à transposer : le **cache mémoire de recherche** invalidé par empreinte de base (permet 0 relecture des 4 600+ lignes à chaque clic de filtre), et le stockage du `score_breakdown` JSON pour un affichage détaillé sans recalcul.

---

## 10. Tests

### 10.1 Infrastructure

- `tests/setup.ts` : base SQLite temporaire par fichier (`JOBSCOUT_DATA_DIR`), et **suppression des variables d'environnement de clés** (ANTHROPIC_API_KEY, OPENAI_API_KEY, JOBSCOUT_PROXY_URL...) pour garantir qu'aucun test ne part avec une vraie clé.
- `tests/fixtures.ts` : `profile` et `offre` fictifs, et `cfgFor(provider)` pour construire une `LlmConfig` sans base.

### 10.2 Mock de serveur compatible OpenAI

- `tests/pipeline.test.ts` : le test de génération **bout en bout** le plus important. Il monte un vrai `http.Server` local (`node:http`) qui répond aux appels "Chat Completions", scripte les réponses **par nom d'outil** (`answer(tool)` pour `build_cv`, `build_lm`, `return_corrections`, `return_translations`), et configure le fournisseur "custom" sans clé sur `http://127.0.0.1:{port}/v1`. Il vérifie :
  - CV : `sections` renvoyé en **chaîne JSON** est réparé ; l'**expérience inventée "Entreprise Inventée SA" est supprimée** par la validation anti-invention ; `skills_flat` conservées.
  - Que le modèle rédaction est utilisé pour `build_cv` et le modèle relecture pour `return_corrections`.
  - Que `tool_choice` vaut "required" (pas de choix nommé) et qu'aucune clé n'est envoyée.
  - LM : 4 paragraphes, relue, sans réparation mobilité (même ville), séquence d'appels `["build_lm", "return_corrections"]`.
- `tests/llm-openai.test.ts` : couverture exhaustive de `callStructured` avec `fakeFetch` (rejoue des réponses, mémorise les requêtes) : paramètres par fournisseur (max_completion_tokens, reasoning_effort, thinking disabled, tool_choice nommé vs required), replis (outil -> json_schema -> json_object -> text), retry 429, troncature, erreurs réseau traduites (ECONNREFUSED, ENOTFOUND, UND_ERR_SOCKET, ERR_SSL, timeout), `listModels`.
- `tests/llm-anthropic.test.ts` : mock Anthropic (non détaillé ici mais présent).
- `tests/json-extract.test.ts` : extraction JSON tolérante.
- `tests/offres-search.test.ts` : pagination stable, filtres, cache mémoire, `?vie=1` suivant la catégorie de contrat (pas `is_vie`), tri, mojibake.
- `tests/scan-sources.test.ts` : sources scannées selon le profil, sources suspendues, mock des scrapers.
- `tests/providers.test.ts`, `tests/ai-http.test.ts`, `tests/config.test.ts`, `tests/paths.test.ts`, `tests/utils-cn.test.ts`, `tests/design-contrast.test.ts`.

### 10.3 Limites constatées

- **Pas de fichier de test dédié au scoring** (`lib/scoring/local.ts`) : `grep` de `scoreOffreLocal`/`scoreSector`/`classifyContract`/`detectVie` dans `tests/` ne renvoie rien. Le scoring est testé indirectement (via `offres-search` pour le classement et les facettes), mais pas ses pondérations précises. C'est une opportunité pour Findit : écrire des tests unitaires des pondérations du scoring.
- Pas de test dédié au rendu PDF/DOCX ni à `fitCVToOnePage`/`shrinkCV`.

---

## Synthèse des points intéressants à transposer dans Findit

1. **Scoring déterministe, sans IA, avec breakdown détaillé et justifié** : `lib/scoring/local.ts` (secteur 30 / compétences 50 / pays 20, bonus langue +8, durée V.I.E +5, contrat -6..+10), l'ancrage des compétences (`evidence_experience_ids`, poids 2 vs 1), et l'affichage "Pourquoi ce score ?" (`app/(app)/offres/[id]/page.tsx`). Le tout sans appel réseau ni coût.

2. **Garde-fous anti-hallucination en défense en profondeur** : `validateCVAgainstProfile` qui **supprime** entreprises et compétences non ancrées (comparaison tolérante + tokens + `isToolLike`), l'injection de `profileFacts` comme source unique, et la passe de relecture non bloquante qui neutralise les affirmations non étayées (`lib/ai/validate.ts`, `lib/ai/profile-facts.ts`, `lib/ai/proofread.ts`).

3. **Couche IA multi-fournisseurs à une seule primitive** : `callStructured` (`lib/ai/llm.ts`) avec échelle de repli outil -> schéma JSON -> JSON -> texte, séparation writer/reviewer, gestion des clés sans fuite vers le navigateur, et traduction des erreurs en messages FR actionnables (`lib/ai/errors.ts`). Idéal pour abstraire plusieurs LLM.

4. **Boucle "une page A4" partagée PDF/DOCX** : `fitCVToOnePage` + `shrinkCV` (`lib/pdf/render.ts`) qui réduit progressivement le contenu et **retourne le contenu réduit** pour que le DOCX (`lib/docx/render.ts`) reste identique au PDF. Les deux partagent `LABELS`/`typographyFor` (fr/en), et le tri anti-chronologique robuste `compareRecentFirst` (`lib/ai/cv-shape.ts`).

5. **Parsing CV en cascade robuste** : détection par octets magiques (`lib/cv/detect.ts`), extraction multi-stratégies dont la reconstruction multi-colonnes pdfjs-dist (`lib/cv/text-extract.ts`), structuration par outil forcé + validation Zod (`lib/cv/extract-semantic.ts`, `lib/cv/types.ts`), et fusion/enrichissement avec similarité Jaccard (`lib/cv/merge.ts`, `lib/cv/similarity.ts`) + score de confiance (`computeConfidence`).

Bonus transposables : le message V.I.E à 3 lignes structurées avec garde-fou de non-vacuité, la détection stricte de contrat/V.I.E (`lib/contracts.ts`, `lib/vie.ts`), la normalisation des pays multi-langues (`lib/countries.ts`), le cache mémoire de recherche invalidé par empreinte de base (`lib/db/offres.ts`), et le mock de serveur OpenAI pour tester la génération bout en bout sans réseau (`tests/pipeline.test.ts`).
