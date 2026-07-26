"use client";

import { useState } from "react";

export type SkillAddition = { skill: string; status: "possessed" | "learning" };

export type SkillTriageProps = Readonly<{
  /** Compétences de l'offre absentes du CV, avec leur raison. */
  skills: { skill: string; reason: string }[];
  onConfirm: (additions: SkillAddition[]) => void;
  onCancel: () => void;
}>;

/*
 * Popup de tri, décidée avec le propriétaire : une compétence absente du CV
 * n'entre dans la lettre que par son choix explicite. « Je la possède » la
 * cite comme acquise - il est la source de vérité sur lui-même. « En cours
 * d'acquisition » ne la présente jamais comme acquise et produit les notions
 * à apprendre. Rien n'est jamais ajouté en silence.
 */
export const SkillTriage = ({ skills, onConfirm, onCancel }: SkillTriageProps) => {
  const [choices, setChoices] = useState<Record<string, "possessed" | "learning" | "skip">>(
    Object.fromEntries(skills.map(({ skill }) => [skill, "skip"])),
  );

  return (
    <div
      className="triage-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Compétences à trier"
    >
      <div className="triage-card">
        <h3 className="triage-title">Compétences demandées par l&apos;offre, absentes du CV</h3>
        <p className="application-note">
          Choisis pour chacune : elle ne sera jamais ajoutée sans ta décision, et « en cours
          d&apos;acquisition » ne sera jamais présentée comme acquise.
        </p>

        <ul className="triage-list">
          {skills.map(({ skill, reason }) => (
            <li key={skill} className="triage-row">
              <div>
                <span className="triage-skill">{skill}</span>
                <span className="triage-reason"> - {reason}</span>
              </div>
              <div className="triage-choices">
                {(
                  [
                    ["possessed", "Je la possède"],
                    ["learning", "En cours d'acquisition"],
                    ["skip", "Ne pas ajouter"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="triage-choice">
                    <input
                      type="radio"
                      name={`triage-${skill}`}
                      checked={choices[skill] === value}
                      onChange={() => {
                        setChoices((current) => ({ ...current, [skill]: value }));
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>

        <div className="resume-actions">
          <button
            type="button"
            className="job-search-submit"
            onClick={() => {
              onConfirm(
                skills
                  .filter(({ skill }) => choices[skill] !== "skip")
                  .map(({ skill }) => ({
                    skill,
                    status: choices[skill] as "possessed" | "learning",
                  })),
              );
            }}
          >
            Générer la lettre
          </button>
          <button type="button" className="workspace-button" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
};
