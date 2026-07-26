"use client";

import { useEffect, useRef, useState } from "react";

import {
  computeAllMatches,
  computeMatch,
  createApplication,
  downloadPdf,
  fetchPublishedOffers,
  generateLetter,
  listLetters,
  listMatches,
  type LetterView,
  type MatchView,
  type OfferSummary,
  type ResumeSummary,
} from "../../lib/workspace-api";
import { LetterCard } from "./letter-card";
import { MatchCard } from "./match-card";
import { SkillTriage, type SkillAddition } from "./skill-triage";

export type ApplicationPanelProps = Readonly<{
  workspaceKey: string;
  /** Le CV structuré qui sert de base aux scores et aux lettres. */
  resume: ResumeSummary;
  /** Appelé quand un dossier de suivi vient d'être créé. */
  onTracked: () => void;
  /** Lance le matching de toutes les offres dès l'affichage (recherche par CV). */
  autoMatch?: boolean;
}>;

/*
 * La candidature part des offres publiées : pour chacune, un score expliqué
 * (immédiat, sans IA) et une lettre factuelle (modèle local, longue). Les
 * résultats stockés sont rechargés à l'ouverture : recalculer remplace.
 */
export const ApplicationPanel = ({
  workspaceKey,
  resume,
  onTracked,
  autoMatch = false,
}: ApplicationPanelProps) => {
  const [offers, setOffers] = useState<OfferSummary[] | null>(null);
  const [matches, setMatches] = useState<Record<string, MatchView>>({});
  const [letters, setLetters] = useState<Record<string, LetterView>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [letterProgress, setLetterProgress] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [triageSlug, setTriageSlug] = useState<string | null>(null);

  useEffect(() => {
    void fetchPublishedOffers().then((result) => {
      if (result.ok) {
        setOffers(result.data);
      } else {
        setMessage(result.message);
      }
    });
    void listMatches(workspaceKey, resume.id).then((result) => {
      if (result.ok) {
        setMatches(Object.fromEntries(result.data.map((match) => [match.job.slug, match])));
      }
    });
    void listLetters(workspaceKey, resume.id).then((result) => {
      if (result.ok) {
        setLetters(Object.fromEntries(result.data.map((letter) => [letter.job.slug, letter])));
      }
    });
  }, [workspaceKey, resume.id]);

  const withBusy = async (slug: string, kind: string, action: () => Promise<void>) => {
    setBusy((current) => ({ ...current, [slug]: kind }));
    setMessage(null);
    try {
      await action();
    } finally {
      setBusy((current) => {
        const next = { ...current };
        delete next[slug];
        return next;
      });
    }
  };

  const runLetter = (slug: string, additions: SkillAddition[]) => {
    const startedAt = Date.now();
    const estimatedMs = 50_000;
    setLetterProgress((current) => ({ ...current, [slug]: 0 }));
    const ticker = setInterval(() => {
      const ratio = (Date.now() - startedAt) / estimatedMs;
      setLetterProgress((current) => ({
        ...current,
        [slug]: Math.min(95, Math.round(ratio * 100)),
      }));
    }, 500);
    void withBusy(slug, "letter", async () => {
      try {
        const result = await generateLetter(workspaceKey, resume.id, slug, additions);
        if (!result.ok) {
          setMessage(result.message);
          return;
        }
        setLetterProgress((current) => ({ ...current, [slug]: 100 }));
        setLetters((current) => ({ ...current, [slug]: result.data }));
        setOpen((current) => ({ ...current, [slug]: true }));
      } finally {
        clearInterval(ticker);
        setTimeout(() => {
          setLetterProgress((current) => {
            const next = { ...current };
            delete next[slug];
            return next;
          });
        }, 800);
      }
    });
  };

  const runMatchAll = () => {
    void withBusy("__all__", "match-all", async () => {
      const result = await computeAllMatches(workspaceKey, resume.id);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setMatches(Object.fromEntries(result.data.map((match) => [match.job.slug, match])));
    });
  };

  // La recherche par CV lance le matching d'elle-même, une seule fois.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoMatch && !autoRan.current) {
      autoRan.current = true;
      runMatchAll();
    }
  });

  return (
    <section className="application" aria-label="Candidature">
      <h2 className="application-title">Candidature</h2>
      <p className="application-note">
        CV utilisé : <strong>{resume.originalFileName}</strong>. Le score se calcule sans IA et
        s&apos;explique ; la lettre est générée par le modèle local puis se relit avant usage.
      </p>

      {/* Le bouton phare : scorer d'un coup toutes les offres publiées, puis
          trier la liste par compatibilité. Chaque carte porte son score. */}
      <div className="resume-actions">
        <button
          type="button"
          className="job-search-submit"
          disabled={busy["__all__"] !== undefined}
          onClick={runMatchAll}
        >
          {busy["__all__"] !== undefined
            ? "Matching en cours…"
            : "Faire matcher mon CV avec toutes les offres"}
        </button>
      </div>

      {message !== null && (
        <p className="workspace-error" role="alert">
          {message}
        </p>
      )}

      {offers === null ? (
        <p className="application-note">Chargement des offres…</p>
      ) : offers.length === 0 ? (
        <div className="state-panel" role="status">
          <h2>Aucune offre publiée récemment.</h2>
          <p>La liste publique ne contient aucune offre des 3 derniers jours.</p>
        </div>
      ) : (
        <div className="workspace-list">
          {[...offers]
            .sort((a, b) => (matches[b.slug]?.score ?? -1) - (matches[a.slug]?.score ?? -1))
            .map((offer) => {
              const match = matches[offer.slug];
              const letter = letters[offer.slug];
              const offerBusy = busy[offer.slug] ?? null;
              const progress = letterProgress[offer.slug];
              return (
                <article key={offer.slug} className="resume-card">
                  <header className="resume-card-header">
                    <h3>{offer.title}</h3>
                    {match !== undefined && (
                      <span className="resume-badge resume-badge-ok">Score {match.score}/100</span>
                    )}
                  </header>
                  <p className="resume-meta">
                    {offer.companyName} · {offer.city}
                    {offer.isDemo ? " · offre de démonstration" : ""}
                  </p>

                  {progress !== undefined && (
                    <div className="workspace-progress-block">
                      <div
                        className="workspace-progress"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progress}
                      >
                        <div
                          className="workspace-progress-fill"
                          style={{ width: `${String(progress)}%` }}
                        />
                      </div>
                      <p className="workspace-progress-label">
                        {progress >= 100
                          ? "Lettre générée."
                          : `Rédaction en cours - ≈ ${String(progress)} % (estimation)`}
                      </p>
                    </div>
                  )}

                  <div className="resume-actions">
                    <button
                      type="button"
                      className="workspace-button"
                      disabled={offerBusy !== null}
                      onClick={() => {
                        void withBusy(offer.slug, "match", async () => {
                          const result = await computeMatch(workspaceKey, resume.id, offer.slug);
                          if (!result.ok) {
                            setMessage(result.message);
                            return;
                          }
                          setMatches((current) => ({ ...current, [offer.slug]: result.data }));
                          setOpen((current) => ({ ...current, [offer.slug]: true }));
                        });
                      }}
                    >
                      {offerBusy === "match"
                        ? "Calcul…"
                        : match === undefined
                          ? "Calculer le score"
                          : "Recalculer le score"}
                    </button>
                    <button
                      type="button"
                      className="workspace-button"
                      disabled={offerBusy !== null}
                      onClick={() => {
                        // Compétences manquantes : la popup de tri décide de
                        // leur sort AVANT la génération, jamais en silence.
                        const missing = [
                          ...(match?.missingSkills ?? []),
                          ...(match?.missingKeywords ?? []),
                        ];
                        if (missing.length > 0) {
                          setTriageSlug(offer.slug);
                          return;
                        }
                        runLetter(offer.slug, []);
                      }}
                    >
                      {offerBusy === "letter"
                        ? "Rédaction…"
                        : letter === undefined
                          ? "Générer la lettre"
                          : "Régénérer la lettre"}
                    </button>
                    <button
                      type="button"
                      className="workspace-button"
                      disabled={letter === undefined || offerBusy !== null}
                      title={letter === undefined ? "Générer d'abord la lettre." : undefined}
                      onClick={() => {
                        void withBusy(offer.slug, "pdf", async () => {
                          const result = await downloadPdf(
                            workspaceKey,
                            `/api/resumes/${resume.id}/letters/${offer.slug}/pdf`,
                            "lettre.pdf",
                          );
                          if (!result.ok) {
                            setMessage(result.message);
                          }
                        });
                      }}
                    >
                      {offerBusy === "pdf" ? "Génération…" : "Lettre en PDF"}
                    </button>
                    <button
                      type="button"
                      className="workspace-button"
                      disabled={offerBusy !== null}
                      onClick={() => {
                        void withBusy(offer.slug, "track", async () => {
                          const result = await createApplication(workspaceKey, {
                            jobSlug: offer.slug,
                            resumeId: resume.id,
                          });
                          if (!result.ok) {
                            setMessage(result.message);
                            return;
                          }
                          onTracked();
                        });
                      }}
                    >
                      {offerBusy === "track" ? "Création…" : "Suivre cette candidature"}
                    </button>
                    {(match !== undefined || letter !== undefined) && (
                      <button
                        type="button"
                        className="workspace-button"
                        onClick={() => {
                          setOpen((current) => ({
                            ...current,
                            [offer.slug]: !current[offer.slug],
                          }));
                        }}
                      >
                        {open[offer.slug] ? "Masquer les détails" : "Voir les détails"}
                      </button>
                    )}
                  </div>

                  {open[offer.slug] && match !== undefined && <MatchCard match={match} />}
                  {open[offer.slug] && letter !== undefined && <LetterCard letter={letter} />}
                </article>
              );
            })}
        </div>
      )}
      {triageSlug !== null && matches[triageSlug] !== undefined && (
        <SkillTriage
          skills={[
            ...(matches[triageSlug]?.missingSkills ?? []).map((skill) => ({
              skill,
              reason: "exigée par l'offre",
            })),
            ...(matches[triageSlug]?.missingKeywords ?? []).map((skill) => ({
              skill,
              reason: "souhaitée par l'offre",
            })),
          ]}
          onConfirm={(additions) => {
            const slug = triageSlug;
            setTriageSlug(null);
            runLetter(slug, additions);
          }}
          onCancel={() => {
            setTriageSlug(null);
          }}
        />
      )}
    </section>
  );
};
