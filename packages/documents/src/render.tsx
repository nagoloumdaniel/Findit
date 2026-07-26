import { renderToBuffer } from "@react-pdf/renderer";

import type { CvDocumentData } from "./cv-data.js";
import { CvDocument } from "./cv-document.js";
import type { CoverLetterDocumentData } from "./letter-data.js";
import { CoverLetterDocument } from "./letter-document.js";

/*
 * Rendu déterministe : mêmes données, même document. Seules les métadonnées
 * d'horodatage internes du PDF varient d'un rendu à l'autre ; le contenu et la
 * mise en page, eux, ne dépendent que des données reçues. Aucune IA ici.
 */
export const renderCvPdf = (data: CvDocumentData): Promise<Buffer> =>
  renderToBuffer(<CvDocument data={data} />);

export const renderCoverLetterPdf = (data: CoverLetterDocumentData): Promise<Buffer> =>
  renderToBuffer(<CoverLetterDocument data={data} />);
