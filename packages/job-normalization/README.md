# Normalisation des offres

## Responsabilité

Transformer une offre brute en données homogènes sans inventer de valeur manquante.

## Le HTML est analysé, pas deviné

Le HTML d'une offre est écrit à la main par un employeur : balises non fermées, `<div>` empilés,
imbrications invalides. Il est donc analysé par `parse5`, un vrai parseur. Une expression régulière
rendrait du texte faux sur les cas tordus, et sans jamais le signaler.

`htmlToBlocks` rend le texte découpé en blocs, chacun portant la nature que le balisage lui donnait :
`heading` vient d'un `<h1>`…`<h6>`, `listItem` d'un `<li>`, le reste est un paragraphe. Cette nature
servira à retrouver les sections d'une offre sans reparcourir le HTML.

Rien n'est promu. Un `<p><strong>Missions</strong></p>` reste un paragraphe, même si l'employeur s'en
sert visuellement comme d'un intertitre — le cas est fréquent chez Greenhouse. Deviner qu'il s'agit
d'un titre reviendrait à inventer une structure que le balisage ne porte pas.

## Le titre normalisé n'est pas le titre

`normalizeTitle` ne sert qu'à rapprocher deux publications de la même offre ; `Job.title` conserve le
titre d'origine. Le nettoyage peut donc être franc : il produit une forme comparable à côté de
l'originale, il ne détruit rien.

En partent les accents, les mentions de genre (`H/F`, `m/w/d`), le contrat — qui est un champ à part —
et les codes de publication (`REF: 4821`, `#5156316004`). Restent les caractères qui portent du sens
dans un nom de technologie : `c++` et `c#` ne sont pas `c`.

Le résultat peut être vide. « Stage H/F » ne contient aucun métier, et rendre une chaîne vide vaut
mieux que fabriquer un titre que personne n'a écrit.

## Vérification

Le paquet a été passé sur les 181 offres réellement collectées chez Greenhouse et Lever : aucune
balise ni entité résiduelle, aucune description vidée, aucun titre annulé, 715 titres et 3199 puces
reconnus.

## État

Le texte et le titre sont faits. Les sections, la localisation et le reste de la phase 4 suivent.
