# Documents de candidature

## Responsabilité

Rendre des documents PDF pré-conçus à partir de faits vérifiés. Le design vit
ici, dans le code du modèle — jamais dans l'IA.

## Modèle de CV

`renderCvPdf(data)` prend des faits structurellement compatibles avec le CV
structuré (`CvDocumentData`) et rend un A4 sobre en Helvetica intégrée, sans
ressource externe. Chaque champ affiché vient des données reçues : un champ
absent reste absent, aucune valeur de remplissage.

Déterminisme : mêmes données, même contenu et même mise en page. Seules les
métadonnées d'horodatage internes du format PDF varient d'un rendu à l'autre.

## Tests

Les tests rendent un vrai PDF puis en relisent le texte (`unpdf`) : les faits
doivent s'y retrouver tels quels, les sections vides ne doivent pas exister,
et deux rendus des mêmes données doivent donner le même texte.
