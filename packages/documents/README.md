# Documents de candidature

## Responsabilité

Rendre des documents pré-conçus (PDF et DOCX) à partir de faits vérifiés. Le
design vit ici, dans le code du modèle - jamais dans l'IA. Le rendu est
déterministe : mêmes données, même contenu et même mise en page. Seules les
métadonnées d'horodatage internes du format PDF varient d'un rendu à l'autre.

## Contrat public

```ts
export type CvTemplate = "classique" | "moderne" | "compact";

export type CvRenderOptions = {
  template?: CvTemplate; // défaut "classique"
  showPhoto?: boolean; // défaut false
  photoDataUrl?: string | null; // data URL base64 PNG/JPEG
  accentColor?: string; // défaut "#d4af37"
};

export const renderCvPdf(data: CvDocumentData, options?: CvRenderOptions): Promise<Buffer>;
export const renderCvDocx(data: CvDocumentData, options?: CvRenderOptions): Promise<Buffer>;
export const renderCoverLetterPdf(data: CoverLetterDocumentData, options?: { accentColor?: string }): Promise<Buffer>;
export const renderCoverLetterDocx(data: CoverLetterDocumentData, options?: { accentColor?: string }): Promise<Buffer>;
export const isValidHexColor(value: string): boolean;
```

Les types `CvDocumentData`, `CvIdentity`, `CvExperience`, `CvProject`,
`CvEducation`, `CvSkill`, `CvLanguage`, `CvCertification`, `CvLink` et
`CoverLetterDocumentData` sont réexportés.

## Modèles de CV

Trois modèles A4, visuellement distincts et tous lisibles par un ATS : une
seule colonne, du texte sélectionnable (jamais une image du contenu), des
titres de sections explicites et aucune jauge visuelle de compétence.

- `classique` : sobre et conventionnel.
- `moderne` : hiérarchie typographique soignée, accent plus marqué, plus d'air.
- `compact` : marges et police réduites pour un contenu dense.

L'option `showPhoto` + `photoDataUrl` ajoute une photo bornée (64 px), secondaire
par rapport au contenu. La couleur d'accent par défaut est l'or Findit
`#d4af37` ; toute valeur non hexadécimale `#rrggbb` retombe sur ce défaut.

Le PDF est borné à une page A4 : si le contenu déborde, un rétrécissement
progressif réduit d'abord les puces puis les expériences et la formation, et le
DOCX est rendu avec le même contenu final que le PDF.

## Tests

Les tests rendent de vrais PDF puis en relisent le texte (`unpdf`) : les faits
doivent s'y retrouver tels quels, les sections vides ne doivent pas exister, les
trois modèles et le DOCX doivent produire un buffer non vide, et les accents
français doivent être préservés.
