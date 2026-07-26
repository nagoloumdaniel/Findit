"use client";

import { useEffect, useRef, useState } from "react";

import {
  listResumes,
  structureResume,
  uploadResume,
  type ResumeSummary,
} from "../../lib/workspace-api";
import { ApplicationPanel } from "./application-panel";

/*
 * Deuxième mode de recherche : par CV. Le bouton vit à côté de la barre de
 * recherche ; s'il n'y a pas encore de CV structuré, il ouvre le sélecteur de
 * fichier, importe, structure (progression estimée), puis lance le matching
 * de toutes les offres publiées. Les résultats scorés et leurs actions ne
 * s'affichent que dans ce mode - la recherche texte reste inchangée.
 */
export const CvSearch = () => {
  const [resume, setResume] = useState<ResumeSummary | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "structuring">("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Reprend le CV structuré le plus récent : pas besoin de réimporter.
  useEffect(() => {
    void listResumes("proxy").then((result) => {
      if (result.ok) {
        setResume(result.data.find((row) => row.structuredAt !== null) ?? null);
      }
    });
  }, []);

  const structureWithProgress = async (id: string, textLength: number) => {
    setPhase("structuring");
    const startedAt = Date.now();
    const estimatedMs = 45_000 + textLength * 15;
    setProgress(0);
    const ticker = setInterval(() => {
      setProgress(Math.min(95, Math.round(((Date.now() - startedAt) / estimatedMs) * 100)));
    }, 500);
    try {
      const result = await structureResume("proxy", id);
      if (!result.ok) {
        setMessage(result.message);
        return null;
      }
      setProgress(100);
      return result.data;
    } finally {
      clearInterval(ticker);
      setTimeout(() => {
        setProgress(null);
      }, 800);
    }
  };

  const onFilePicked = async (file: File) => {
    setMessage(null);
    setPhase("uploading");
    const uploaded = await uploadResume("proxy", file);
    if (!uploaded.ok) {
      setMessage(uploaded.message);
      setPhase("idle");
      return;
    }
    const structured =
      uploaded.data.structuredAt !== null
        ? uploaded.data
        : await structureWithProgress(uploaded.data.id, uploaded.data.textLength);
    setPhase("idle");
    if (structured !== null) {
      setResume(structured);
      setActive(true);
    }
  };

  const busy = phase !== "idle";

  return (
    <div className="cv-search">
      <input
        className="workspace-file-input"
        ref={fileInput}
        type="file"
        accept=".pdf,.docx,.txt"
        aria-label="CV pour la recherche"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file !== undefined) {
            void onFilePicked(file);
          }
        }}
      />
      <button
        type="button"
        className="filters-toggle-button"
        disabled={busy}
        onClick={() => {
          if (resume === null) {
            fileInput.current?.click();
          } else {
            setActive((current) => !current);
          }
        }}
        title={
          resume === null
            ? "Importer un CV (PDF, DOCX ou TXT) puis chercher les offres compatibles"
            : `CV : ${resume.originalFileName}`
        }
      >
        {phase === "uploading"
          ? "Import…"
          : phase === "structuring"
            ? "Lecture du CV…"
            : active
              ? "Masquer la recherche par CV"
              : "Rechercher avec mon CV"}
      </button>

      <div className="cv-search-results">
        {progress !== null && (
          <div className="workspace-progress-block">
            <div
              className="workspace-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div className="workspace-progress-fill" style={{ width: `${String(progress)}%` }} />
            </div>
            <p className="workspace-progress-label">
              {progress >= 100
                ? "CV lu."
                : `Lecture du CV en cours - ≈ ${String(progress)} % (estimation)`}
            </p>
          </div>
        )}
        {message !== null && (
          <p className="workspace-error" role="alert">
            {message}
          </p>
        )}
        {active && resume !== null && (
          <>
            <button
              type="button"
              className="workspace-button cv-search-change"
              disabled={busy}
              onClick={() => {
                fileInput.current?.click();
              }}
            >
              Changer de CV ({resume.originalFileName})
            </button>
            <ApplicationPanel
              workspaceKey="proxy"
              resume={resume}
              autoMatch
              onTracked={() => undefined}
            />
          </>
        )}
      </div>
    </div>
  );
};
