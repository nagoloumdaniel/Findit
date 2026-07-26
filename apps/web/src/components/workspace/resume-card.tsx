import type { ResumeDetail, ResumeSummary } from "../../lib/workspace-api";
import { exactDateTime } from "../../lib/labels";

export type ResumeCardProps = Readonly<{
  resume: ResumeSummary;
  /** Faits chargés à la demande ; null tant qu'on ne les a pas demandés. */
  detail: ResumeDetail | null;
  busy: string | null;
  /** Avancement estimé de la structuration (0-100), null hors structuration. */
  progress: number | null;
  onStructure: () => void;
  onShowFacts: () => void;
  onDownloadCv: () => void;
  onDelete: () => void;
}>;

const formatOctets = (bytes: number): string => {
  if (bytes < 1024) {
    return `${String(bytes)} o`;
  }
  const kilo = bytes / 1024;
  return kilo < 1024 ? `${kilo.toFixed(0)} Ko` : `${(kilo / 1024).toFixed(1)} Mo`;
};

/*
 * Une carte dit ce que le système sait du CV, rien de plus : un CV non
 * structuré n'affiche ni faits ni confiance, et les actions impossibles sont
 * désactivées avec la raison plutôt que cachées.
 */
export const ResumeCard = ({
  resume,
  detail,
  busy,
  progress,
  onStructure,
  onShowFacts,
  onDownloadCv,
  onDelete,
}: ResumeCardProps) => {
  const structured = resume.structuredAt !== null;
  const facts = detail?.structured ?? null;

  return (
    <article className="resume-card">
      <header className="resume-card-header">
        <h3>{resume.originalFileName}</h3>
        <span className={structured ? "resume-badge resume-badge-ok" : "resume-badge"}>
          {structured
            ? `Structuré - confiance ${String(resume.structuredConfidence ?? 0)}/100`
            : "Pas encore structuré"}
        </span>
      </header>

      <p className="resume-meta">
        {resume.fileType} · {formatOctets(resume.fileSize)} · {String(resume.textLength)} caractères
        extraits · importé le {exactDateTime(resume.createdAt)} · expire le{" "}
        {exactDateTime(resume.expiresAt)}
      </p>

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
              ? "Structuration terminée."
              : `Structuration en cours - ≈ ${String(progress)} % (estimation)`}
          </p>
        </div>
      )}

      {facts !== null && (
        <div className="resume-facts">
          {facts.facts.identity.fullName !== undefined && (
            <p>
              <strong>{facts.facts.identity.fullName}</strong>
              {facts.facts.identity.title !== undefined ? ` - ${facts.facts.identity.title}` : null}
            </p>
          )}
          {facts.facts.skills.length > 0 && (
            <p>Compétences : {facts.facts.skills.map((skill) => skill.name).join(", ")}</p>
          )}
          {facts.facts.languages.length > 0 && (
            <p>
              Langues :{" "}
              {facts.facts.languages
                .map((language) =>
                  language.level === undefined
                    ? language.name
                    : `${language.name} (${language.level})`,
                )
                .join(", ")}
            </p>
          )}
          {facts.warnings.length > 0 && (
            <p className="resume-warnings">À vérifier : {facts.warnings.join(" ")}</p>
          )}
        </div>
      )}

      <div className="resume-actions">
        <button
          type="button"
          className="workspace-button"
          onClick={onStructure}
          disabled={busy !== null}
        >
          {busy === "structure" ? "Structuration…" : structured ? "Restructurer" : "Structurer"}
        </button>
        <button
          type="button"
          className="workspace-button"
          onClick={onShowFacts}
          disabled={!structured || busy !== null}
          title={structured ? undefined : "Structurer d'abord le CV."}
        >
          {detail === null ? "Voir les faits" : "Masquer les faits"}
        </button>
        <button
          type="button"
          className="workspace-button"
          onClick={onDownloadCv}
          disabled={!structured || busy !== null}
          title={structured ? undefined : "Structurer d'abord le CV."}
        >
          {busy === "pdf" ? "Génération…" : "CV en PDF"}
        </button>
        <button
          type="button"
          className="workspace-button workspace-button-danger"
          onClick={onDelete}
          disabled={busy !== null}
        >
          {busy === "delete" ? "Suppression…" : "Supprimer"}
        </button>
      </div>
    </article>
  );
};
