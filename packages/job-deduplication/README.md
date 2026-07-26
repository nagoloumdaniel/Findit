# Déduplication des offres

## Responsabilité

Identifier les publications correspondant à une même offre et conserver toutes les sources.

## Un score par critère, une décision réversible

`scoreSimilarity` mesure à quel point deux offres sont la même publication, **critère par critère** :
entreprise et titre (les plus lourds), puis lieu, texte et date. Chaque critère vaut entre 0 et 1, et
le détail accompagne le score - c'est le `scoreBreakdown` que `DuplicateDecision` conserve pour que
toute fusion reste justifiable et annulable.

Le recouvrement de texte est un indice de Jaccard : la part de mots communs. Deux descriptions
identiques valent 1, deux sans mot commun valent 0. La date rapproche large - une même offre porte des
dates un peu différentes selon la source.

## Deux garde-fous durs, et une zone de doute

`decideDuplicate` rend `MERGE`, `DISTINCT` ou `REVIEW`. Avant tout calcul de seuil, deux choses ne sont
**jamais** la même publication, quel que soit le reste :

- **Deux départements différents.** Le périmètre est l'Île-de-France : une même publication n'y a
  qu'un lieu.
- **Deux entreprises différentes.** En deçà d'un net recouvrement de nom, ce sont deux entreprises -
  les variantes d'un même nom, « Acme » et « Acme France », restent au-dessus du seuil.

Entre les deux seuils, une zone de doute penche vers `REVIEW`, jamais vers une décision silencieuse :
fusionner à tort mêle deux offres réelles, séparer à tort en montre une deux fois. Le doute se tranche
à part.

## Vérification

Sur les 71 offres réelles de Vercel - 2485 paires d'offres d'une même entreprise mais bien
distinctes - le dédoublonneur est resté prudent : **2 fusions, 130 revues, 2353 distinctes**. Les deux
fusions sont deux « Solutions Architect » de même titre, et un artefact du contrôle : les offres hors
zone y avaient toutes le même département fictif, ce qui désarme le garde-fou de département. En
opération réelle, des postes de villes différentes portent des départements différents et restent
séparés. Aucune fusion entre offres de titres différents.

## État

Le score de similarité et la décision sont faits, purs et vérifiés. Leur écriture en `DuplicateGroup`
prendra son sens quand plusieurs sources se recouvriront - aujourd'hui, chaque entreprise n'a qu'un
board sur un ATS, donc aucune offre n'arrive en double. La logique est prête pour ce jour.
