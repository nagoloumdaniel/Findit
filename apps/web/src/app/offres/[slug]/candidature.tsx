"use client";

import { useState } from "react";

import { generateCvAction, generateLetterAction } from "./actions";
import type { CvTemplate } from "../../../lib/profile-api";

type DocFormat = "pdf" | "docx";

type CandidatureSectionProps = {
  jobSlug: string;
};

/** Déclenche le téléchargement d'un fichier reçu en base64. */
const download = (file: { fileName: string; contentType: string; contentBase64: string }): void => {
  const bytes = Uint8Array.from(atob(file.contentBase64), (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], { type: file.contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

/** Style commun des boutons : réutilise `.source-primary` sans bordure native. */
const buttonStyle = { border: "none", cursor: "pointer" } as const;

/**
 * Section « Candidature » d'une offre : génère et télécharge le CV (choix du
 * modèle, photo, couleur) et la lettre. Les fichiers sont produits côté serveur
 * (la clé interne n'atteint jamais le navigateur), puis téléchargés ici.
 */
export function CandidatureSection({ jobSlug }: CandidatureSectionProps) {
  const [template, setTemplate] = useState<CvTemplate>("classique");
  const [showPhoto, setShowPhoto] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [accentColor, setAccentColor] = useState("#d4af37");
  const [format, setFormat] = useState<DocFormat>("pdf");
  const [letterFormat, setLetterFormat] = useState<DocFormat>("pdf");
  const [busy, setBusy] = useState<"cv" | "letter" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onGenerateCv = async (): Promise<void> => {
    setBusy("cv");
    setError(null);
    const result = await generateCvAction({
      jobSlug,
      template,
      showPhoto,
      photoDataUrl,
      accentColor,
      format,
    });
    if (result.ok) {
      download(result.document);
    } else {
      setError(result.reason);
    }
    setBusy(null);
  };

  const onGenerateLetter = async (): Promise<void> => {
    setBusy("letter");
    setError(null);
    const result = await generateLetterAction({ jobSlug, accentColor, format: letterFormat });
    if (result.ok) {
      download(result.document);
    } else {
      setError(result.reason);
    }
    setBusy(null);
  };

  const onPhotoChange = (file: File | undefined): void => {
    if (file === undefined) {
      setPhotoDataUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  return (
    <section className="detail-section" aria-labelledby="candidature-title">
      <h2 id="candidature-title">Candidature</h2>
      <p className="detail-note">
        Les documents sont générés à partir des seuls faits de votre profil, jamais complétés
        d’office.
      </p>

      <div className="profile-form" style={{ marginTop: "1rem" }}>
        <label>
          Modèle de CV
          <select
            value={template}
            onChange={(event) => setTemplate(event.target.value as CvTemplate)}
          >
            <option value="classique">Classique</option>
            <option value="moderne">Moderne</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <label>
          Format
          <select value={format} onChange={(event) => setFormat(event.target.value as DocFormat)}>
            <option value="pdf">PDF</option>
            <option value="docx">DOCX</option>
          </select>
        </label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            checked={showPhoto}
            onChange={(event) => setShowPhoto(event.target.checked)}
          />
          Afficher la photo
        </label>
        <label>
          Photo (PNG ou JPEG)
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(event) => onPhotoChange(event.target.files?.[0])}
          />
        </label>
        <label>
          Couleur d’accent
          <input
            type="color"
            value={accentColor}
            onChange={(event) => setAccentColor(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="source-primary"
          style={buttonStyle}
          onClick={() => void onGenerateCv()}
          disabled={busy !== null}
        >
          {busy === "cv" ? "Génération…" : "Générer le CV"}
        </button>

        <label>
          Format de la lettre
          <select
            value={letterFormat}
            onChange={(event) => setLetterFormat(event.target.value as DocFormat)}
          >
            <option value="pdf">PDF</option>
            <option value="docx">DOCX</option>
          </select>
        </label>
        <button
          type="button"
          className="source-primary"
          style={buttonStyle}
          onClick={() => void onGenerateLetter()}
          disabled={busy !== null}
        >
          {busy === "letter" ? "Génération…" : "Générer la lettre"}
        </button>
      </div>

      {error === null ? null : (
        <p className="detail-note" role="alert" style={{ marginTop: "0.75rem" }}>
          {error}
        </p>
      )}
    </section>
  );
}
