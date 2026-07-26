"use client";

import { useEffect, useRef, useState } from "react";

import {
  computeMatch,
  createApplication,
  downloadPdf,
  generateLetter,
  listLetters,
  listMatches,
  listResumes,
  structureResume,
  uploadResume,
  type LetterView,
  type MatchView,
  type ResumeSummary,
} from "../../lib/workspace-api";
import { LetterCard } from "./letter-card";
import { MatchCard } from "./match-card";
import { SkillTriage, type SkillAddition } from "./skill-triage";

/*
 * Sur la page détail d'une offre : matcher SON CV avec CETTE offre, avec
 * toutes les actions - score expliqué, lettre relisible, PDF, suivi. Sans CV
 * importé, le bouton ouvre le sélecteur, importe et structure d'abord.
 */
export const OfferMatch = ({ slug }: { slug: string }) => {
  const [resume, setResume] = useState<ResumeSummary | null>(null);
  const [match, setMatch] = useState<MatchView | null>(null);
  const [letter, setLetter] = useState<LetterView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tracked, setTracked] = useState(false);
  const [triageOpen, setTriageOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void listResumes("proxy").then((result) => {
      if (!result.ok) {
        return;
      }
      const structured = result.data.find((row) => row.structuredAt !== null) ?? null;
      setResume(structured);
      if (structured === null) {
        return;
      }
      // Résultats déjà stockés pour ce couple : affichés sans recalcul.
      void listMatches("proxy", structured.id).then((matches) => {
        if (matches.ok) {
          setMatch(matches.data.find((row) => row.job.slug === slug) ?? null);
        }
      });
      void listLetters("proxy", structured.id).then((letters) => {
        if (letters.ok) {
          setLetter(letters.data.find((row) => row.job.slug === slug) ?? null);
        }
      });
    });
  }, [slug]);

  const withBusy = async (kind: string, action: () => Promise<void>) => {
    setBusy(kind);
    setMessage(null);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  const runLetter = (additions: SkillAddition[]) => {
    if (resume === null) {
      return;
    }
    void withBusy("letter", async () => {
      const result = await generateLetter("proxy", resume.id, slug, additions);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setLetter(result.data);
    });
  };

  const runMatch = (target: ResumeSummary) => {
    void withBusy("match", async () => {
      const result = await computeMatch("proxy", target.id, slug);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setMatch(result.data);
    });
  };

  const onFilePicked = async (file: File) => {
    setMessage(null);
    setBusy("upload");
    const uploaded = await uploadResume("proxy", file);
    if (!uploaded.ok) {
      setMessage(uploaded.message);
      setBusy(null);
      return;
    }
    const startedAt = Date.now();
    const estimatedMs = 45_000 + uploaded.data.textLength * 15;
    setProgress(0);
    const ticker = setInterval(() => {
      setProgress(Math.min(95, Math.round(((Date.now() - startedAt) / estimatedMs) * 100)));
    }, 500);
    const structured = await structureResume("proxy", uploaded.data.id);
    clearInterval(ticker);
    setProgress(null);
    setBusy(null);
    if (!structured.ok) {
      setMessage(structured.message);
      return;
    }
    setResume(structured.data);
    runMatch(structured.data);
  };

  return (
    <section className="application" aria-label="Matcher mon CV avec cette offre">
      <h2 className="application-title">Matcher mon CV avec cette offre</h2>

      <input
        className="workspace-file-input"
        ref={fileInput}
        type="file"
        accept=".pdf,.docx,.txt"
        aria-label="CV à matcher"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file !== undefined) {
            void onFilePicked(file);
          }
        }}
      />

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
            Lecture du CV en cours - ≈ {progress} % (estimation)
          </p>
        </div>
      )}

      {message !== null && (
        <p className="workspace-error" role="alert">
          {message}
        </p>
      )}

      <div className="resume-actions">
        {resume === null ? (
          <button
            type="button"
            className="job-search-submit"
            disabled={busy !== null}
            onClick={() => {
              fileInput.current?.click();
            }}
          >
            {busy !== null ? "Lecture du CV…" : "Importer mon CV et matcher"}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="job-search-submit"
              disabled={busy !== null}
              onClick={() => {
                runMatch(resume);
              }}
            >
              {busy === "match"
                ? "Calcul…"
                : match === null
                  ? "Matcher mon CV"
                  : "Recalculer le score"}
            </button>
            <button
              type="button"
              className="workspace-button"
              disabled={busy !== null}
              onClick={() => {
                /*
                 * Des compétences de l'offre manquent au CV : la popup de tri
                 * décide de leur sort AVANT la génération - jamais d'ajout
                 * silencieux.
                 */
                const missing = [
                  ...(match?.missingSkills ?? []),
                  ...(match?.missingKeywords ?? []),
                ];
                if (missing.length > 0) {
                  setTriageOpen(true);
                  return;
                }
                runLetter([]);
              }}
            >
              {busy === "letter"
                ? "Rédaction (~1 min)…"
                : letter === null
                  ? "Générer la lettre"
                  : "Régénérer la lettre"}
            </button>
            <button
              type="button"
              className="workspace-button"
              disabled={letter === null || busy !== null}
              title={letter === null ? "Générer d'abord la lettre." : undefined}
              onClick={() => {
                void withBusy("pdf", async () => {
                  const result = await downloadPdf(
                    "proxy",
                    `/api/resumes/${resume.id}/letters/${slug}/pdf`,
                    "lettre.pdf",
                  );
                  if (!result.ok) {
                    setMessage(result.message);
                  }
                });
              }}
            >
              Lettre en PDF
            </button>
            <button
              type="button"
              className="workspace-button"
              disabled={tracked || busy !== null}
              onClick={() => {
                void withBusy("track", async () => {
                  const result = await createApplication("proxy", {
                    jobSlug: slug,
                    resumeId: resume.id,
                  });
                  if (!result.ok) {
                    setMessage(result.message);
                    return;
                  }
                  setTracked(true);
                });
              }}
            >
              {tracked ? "Candidature suivie ✓" : "Suivre cette candidature"}
            </button>
            <button
              type="button"
              className="workspace-button"
              disabled={busy !== null}
              onClick={() => {
                fileInput.current?.click();
              }}
            >
              Changer de CV
            </button>
          </>
        )}
      </div>

      {match !== null && <MatchCard match={match} />}
      {letter !== null && <LetterCard letter={letter} />}

      {triageOpen && match !== null && (
        <SkillTriage
          skills={[
            ...match.missingSkills.map((skill) => ({ skill, reason: "exigée par l'offre" })),
            ...match.missingKeywords.map((skill) => ({ skill, reason: "souhaitée par l'offre" })),
          ]}
          onConfirm={(additions) => {
            setTriageOpen(false);
            runLetter(additions);
          }}
          onCancel={() => {
            setTriageOpen(false);
          }}
        />
      )}
    </section>
  );
};
