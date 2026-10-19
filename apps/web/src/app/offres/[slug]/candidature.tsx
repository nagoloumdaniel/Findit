"use client";

import { useEffect, useState } from "react";

import {
  generateCvAction,
  generateLetterAction,
  scoreCvAction,
  toggleFavoriteAction,
} from "./actions";
import type { CvTemplate } from "../../../lib/profile-api";
import type { CvScore } from "../../../lib/profile-api";

type DocFormat = "pdf" | "docx";

type CandidatureSectionProps = {
  jobSlug: string;
};

/** Convertit un fichier base64 en URL d'objet, réutilisable pour l'aperçu. */
const toBlobUrl = (file: { contentType: string; contentBase64: string }): string => {
  const bytes = Uint8Array.from(atob(file.contentBase64), (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], { type: file.contentType });
  return URL.createObjectURL(blob);
};

/** Déclenche le téléchargement d'un fichier reçu en base64. */
const download = (file: { fileName: string; contentType: string; contentBase64: string }): void => {
  const url = toBlobUrl(file);
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
  const [score, setScore] = useState<CvScore | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("cv.pdf");
  const [favorited, setFavorited] = useState<boolean | null>(null);
  const [favBusy, setFavBusy] = useState(false);

  const onToggleFavorite = async (): Promise<void> => {
    setFavBusy(true);
    const result = await toggleFavoriteAction(jobSlug);
    if (result.ok) {
      setFavorited(result.favorited);
    }
    setFavBusy(false);
  };

  useEffect(() => {
    let cancelled = false;
    void scoreCvAction(jobSlug)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setScore(result.data);
        } else {
          setScoreError(result.reason);
        }
      })
      .catch(() => {
        if (!cancelled) setScoreError("Le score n’est pas disponible.");
      });
    return () => {
      cancelled = true;
    };
  }, [jobSlug]);

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

  /** Génère le CV en PDF et l'affiche en aperçu, sans le télécharger. */
  const onPreviewCv = async (): Promise<void> => {
    setBusy("cv");
    setError(null);
    const result = await generateCvAction({
      jobSlug,
      template,
      showPhoto,
      photoDataUrl,
      accentColor,
      format: "pdf",
    });
    if (result.ok) {
      if (previewUrl !== null) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(toBlobUrl(result.document));
      setPreviewName(result.document.fileName);
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

  /** Génère la lettre en PDF et l'affiche en aperçu, sans la télécharger. */
  const onPreviewLetter = async (): Promise<void> => {
    setBusy("letter");
    setError(null);
    const result = await generateLetterAction({ jobSlug, accentColor, format: "pdf" });
    if (result.ok) {
      if (previewUrl !== null) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(toBlobUrl(result.document));
      setPreviewName(result.document.fileName);
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

      <button
        type="button"
        className="source-primary"
        style={buttonStyle}
        onClick={() => void onToggleFavorite()}
        disabled={favBusy}
        aria-pressed={favorited ?? false}
      >
        {favorited === null
          ? "Ajouter aux favoris"
          : favorited
            ? "Retirer des favoris"
            : "Ajouter aux favoris"}
      </button>

      {score !== null && score.insufficientDataWarning === null ? (
        <div className="match-score-block">
          <p className="match-score" aria-label={`Correspondance ${score.score} sur 100`}>
            <strong className="match-score-value">{score.score}%</strong>
            <span className="match-score-label">de correspondance avec votre profil</span>
          </p>
          {score.matchedSkills.length > 0 ? (
            <p className="detail-note">Compétences couvertes : {score.matchedSkills.join(", ")}.</p>
          ) : null}
          {score.missingSkills.length > 0 ? (
            <p className="detail-note">
              Exigences non couvertes : {score.missingSkills.join(", ")}.
            </p>
          ) : null}
        </div>
      ) : score !== null ? (
        <p className="detail-note" role="note">
          Correspondance non fiable : votre profil est trop incomplet pour noter cette offre.
        </p>
      ) : scoreError !== null ? (
        <p className="detail-note" role="note">
          {scoreError}
        </p>
      ) : null}

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
        <button
          type="button"
          className="source-primary"
          style={buttonStyle}
          onClick={() => void onPreviewCv()}
          disabled={busy !== null}
        >
          {busy === "cv" ? "Génération…" : "Prévisualiser le CV"}
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
        <button
          type="button"
          className="source-primary"
          style={buttonStyle}
          onClick={() => void onPreviewLetter()}
          disabled={busy !== null}
        >
          {busy === "letter" ? "Génération…" : "Prévisualiser la lettre"}
        </button>
      </div>

      {previewUrl !== null ? (
        <div className="cv-preview" style={{ marginTop: "1rem" }}>
          <iframe
            className="cv-preview-frame"
            src={previewUrl}
            title="Aperçu du document"
            loading="lazy"
          />
          <a className="source-primary" href={previewUrl} download={previewName}>
            Télécharger cet aperçu
          </a>
        </div>
      ) : null}

      {error === null ? null : (
        <p className="detail-note" role="alert" style={{ marginTop: "0.75rem" }}>
          {error}
        </p>
      )}
    </section>
  );
}
