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
sert visuellement comme d'un intertitre. Le bloc note seulement que **tout son contenu était en gras**
— un fait que le balisage porte. Ce que ce gras signifie est décidé par l'extraction des sections, en
aval : si cette lecture se trompe, elle abîme des sections, jamais la description.

## Les sections viennent des puces, pas des phrases

`extractSections` range les puces sous la section que leur intertitre annonce : responsabilités,
prérequis, avantages. Un intertitre est un vrai `<h1>`…`<h6>`, ou un paragraphe entièrement en gras
**suivi d'une puce** — 189 sections de Doctolib sont écrites ainsi, dont 149 suivies d'une liste. Le
gras seul ne suffit pas : c'est la liste qui prouve qu'il annonçait quelque chose.

Seules les puces sont retenues. Une section rédigée en prose reste dans la description :
`Job.responsibilities` est une liste, et découper un paragraphe en phrases pour en fabriquer une
inventerait une structure que l'employeur n'a pas écrite. Un intertitre non reconnu ferme la section
en cours sans en ouvrir d'autre — « À propos de Doctolib » ne parle pas du candidat.

Le vocabulaire est français et anglais, tutoiement compris : Doctolib publie « Tes missions » à côté
de « Vos missions ». L'allemand n'est pas reconnu — ces offres sont berlinoises, donc hors zone.

## Le titre normalisé n'est pas le titre

`normalizeTitle` ne sert qu'à rapprocher deux publications de la même offre ; `Job.title` conserve le
titre d'origine. Le nettoyage peut donc être franc : il produit une forme comparable à côté de
l'originale, il ne détruit rien.

En partent les accents, les mentions de genre (`H/F`, `m/w/d`), le contrat — qui est un champ à part —
et les codes de publication (`REF: 4821`, `#5156316004`). Restent les caractères qui portent du sens
dans un nom de technologie : `c++` et `c#` ne sont pas `c`.

Le résultat peut être vide. « Stage H/F » ne contient aucun métier, et rendre une chaîne vide vaut
mieux que fabriquer un titre que personne n'a écrit.

## La localisation vient de la table officielle, pas d'une supposition

`resolveLocation` range un libellé dans le périmètre ou dit pourquoi il n'y entre pas. Le libellé est
la seule information disponible : **aucune des 348 offres relevées ne porte de code postal**.

Le département vient de `ile-de-france-communes.ts`, généré par `generate-communes.mjs` depuis
[geo.api.gouv.fr](https://geo.api.gouv.fr), l'API officielle du découpage administratif français.
1262 communes. La table est générée puis commitée : le découpage communal ne bouge qu'à la marge, et
dépendre du réseau pour classer une offre serait un point de panne pour rien.

La ville rendue est celle que la source a écrite, jamais réécrite. Le département, lui, n'est jamais
deviné :

- **Quatre communes sont ambiguës.** Blandy, Marolles-en-Brie, Mondreville et Saint-Martin-des-Champs
  existent chacune dans deux départements d'Île-de-France. Le libellé ne dit pas laquelle : l'offre
  est refusée en `AMBIGUOUS_COMMUNE` plutôt que rangée au hasard.
- **« France » ne donne aucun département** : `TOO_VAGUE`. Le cas est réel — une offre Doctolib est
  écrite ainsi.
- Un libellé peut porter plusieurs lieux. « Berlin, Berlin, Germany; Paris, Paris, France » existe
  tel quel : il suffit qu'un seul soit en Île-de-France.
- Le mode de travail est pris quand le libellé le porte devant la ville — « Hybrid - Paris » — et
  conservé même quand le lieu est hors zone.

Limite connue : un libellé qui nomme une subdivision étrangère sans son pays, « Paris, Texas »,
passerait au travers. Le cas ne s'est pas présenté sur les 348 offres relevées, et exiger « France »
dans le libellé rejetterait « Paris » seul — que les sources écrivent réellement.

## Vérification

Le paquet a été passé sur 348 offres réellement collectées chez Greenhouse (Vercel, Doctolib) et
Lever (Spotify) : aucune balise ni entité résiduelle, aucune description vidée, aucun titre annulé.

Les sections, mesurées sur ces mêmes offres :

| Board                               | Au moins une section |
| ----------------------------------- | -------------------- |
| Vercel                              | 99 %                 |
| Doctolib, offres en France          | 95 %                 |
| Doctolib, offres hors de France     | 17 %                 |
| Spotify                             | 80 %                 |
| **Alternances et stages en France** | **100 %**            |

Les 17 % de Doctolib hors de France sont attendus : ce sont les offres berlinoises et milanaises, dont
les intertitres sont allemands ou italiens, et qui seront écartées à l'étape de localisation. Les 0 %
d'avantages chez Spotify le sont aussi : Spotify n'écrit que trois intertitres — « Who You Are »,
« What You'll Do », « Where You'll Be » — et ne publie aucune section d'avantages. Il n'y a rien à
trouver, et rien n'est inventé.

La localisation, sur les mêmes 348 offres :

```
296  OUTSIDE_ILE_DE_FRANCE
 51  RETENUE            (toutes en 75, dont les 10 alternances et stages parisiens)
  1  TOO_VAGUE          (« France »)
```

Le compte tombe juste : Doctolib publie 52 offres localisées en France, soit 51 résolues et une seule
trop vague.

## État

Le texte, le titre, les sections et la localisation sont faits. La classification, les écoles, la
déduplication et l'écriture en base suivent.
