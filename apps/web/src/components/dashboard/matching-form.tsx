"use client";

import { useState } from "react";

type MatchItem = {
  jobSlug: string;
  jobTitle: string;
  companyName: string;
  score: number;
  relevance: string;
  matchedSkills: string[];
  missingSkills: string[];
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
};

/*
 * L'URL de l'API est une variable publique (`NEXT_PUBLIC_API_URL`) : Next.js
 * l'inline au build, donc elle est lisible ici côté navigateur.
 */
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function MatchingForm() {
  const [cvText, setCvText] = useState("");
  const [results, setResults] = useState<MatchItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const score = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(new URL("/api/matching/score", apiUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cvText }),
      });

      if (!response.ok) {
        setError("Le scoring a échoué. Réessaie.");
        return;
      }

      setResults((await response.json()) as MatchItem[]);
    } catch {
      setError("L’API est injoignable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="matching-form">
      <label className="matching-label" htmlFor="cv-text">
        Colle ton CV (texte)
      </label>
      <textarea
        id="cv-text"
        className="matching-textarea"
        value={cvText}
        onChange={(event) => setCvText(event.target.value)}
        placeholder="Nom, expériences, projets, compétences, langues, certifications..."
        rows={12}
      />
      <button
        className="matching-button"
        type="button"
        onClick={() => {
          void score();
        }}
        disabled={loading || cvText.trim() === ""}
      >
        {loading ? "Scoring…" : "Scorer mon CV"}
      </button>

      {error !== null ? <p className="dashboard-lead">{error}</p> : null}

      {results !== null && results.length === 0 ? (
        <p className="dashboard-lead">Aucune offre à scorer pour l’instant.</p>
      ) : null}

      {results !== null && results.length > 0 ? (
        <ul className="dashboard-list">
          {results.map((item) => (
            <li className="dashboard-row" key={item.jobSlug}>
              <span className="dashboard-row-title">
                {item.jobTitle} · {item.companyName}
              </span>
              <span className="dashboard-row-meta">
                Score {item.score}/100 · {item.relevance}
              </span>
              <span className="dashboard-row-meta">Atouts : {item.matchedSkills.join(", ")}</span>
              <span className="dashboard-row-meta">Manques : {item.missingSkills.join(", ")}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
