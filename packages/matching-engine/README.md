# Moteur de correspondance

## Responsabilité

Calculer un score déterministe et explicable entre un CV structuré et une
offre, sans IA : chaque point vient d'une correspondance constatée et citée.

## Fonctionnement

- Un **dictionnaire technique** (`TECH_DICTIONARY` dans
  `src/tech-dictionary.ts`) liste les technologies telles qu'elles s'écrivent
  dans les offres. Un alias ambigu en français (« vue » seul, « go » seul) est
  exclu plutôt que risqué.
- `computeMatch(resume, job)` compare quatre critères pondérés :
  compétences exigées (50), compétences souhaitées (20), alignement
  d'intitulé (15), langues (15). Un critère sans signal côté offre est exclu
  et les poids restants sont renormalisés à 100.
- La sortie liste compétences couvertes et manquantes, forces, faiblesses,
  recommandations (mise en valeur de l'existant uniquement), une confiance et
  un avertissement explicite quand la matière manque. Rien n'est inventé.

## Entrées/sorties

Entrée : `ResumeMatchInput` (compétences, intitulés, langues) et
`JobMatchInput` (titre, prérequis, missions, description). Sortie :
`MatchResult` (score /100, `breakdown` par critère, listes de raisons).
