import type { ApplicationView } from "../../lib/workspace-api";
import { exactDateTime } from "../../lib/labels";

/** Libellés des statuts, dans l'ordre du parcours. */
export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  TO_APPLY: "À postuler",
  APPLIED: "Envoyée",
  INTERVIEW: "Entretien",
  OFFER_RECEIVED: "Offre reçue",
  REJECTED: "Refusée",
  WITHDRAWN: "Abandonnée",
};

export type ApplicationCardProps = Readonly<{
  application: ApplicationView;
  busy: boolean;
  onChangeStatus: (status: string, note: string) => void;
  onSaveNotes: (notes: string) => void;
  onDelete: () => void;
}>;

/*
 * Le dossier montre ses instantanés - offre, CV, score, lettre - et son
 * historique daté. L'offre disparue du flux est signalée, pas cachée : le
 * dossier est justement fait pour lui survivre.
 */
export const ApplicationCard = ({
  application,
  busy,
  onChangeStatus,
  onSaveNotes,
  onDelete,
}: ApplicationCardProps) => (
  <article className="resume-card">
    <header className="resume-card-header">
      <h3>{application.jobTitle}</h3>
      <span className="resume-badge resume-badge-ok">
        {APPLICATION_STATUS_LABELS[application.status] ?? application.status}
      </span>
    </header>

    <p className="resume-meta">
      {application.companyName}
      {application.jobStillExists ? "" : " · offre retirée du flux (dossier conservé)"} · créé le{" "}
      {exactDateTime(application.createdAt)}
      {application.appliedAt !== null
        ? ` · envoyée le ${exactDateTime(application.appliedAt)}`
        : ""}
    </p>

    {(application.resumeFileName !== null || application.matchScore !== null) && (
      <p className="resume-meta">
        {application.resumeFileName !== null ? `CV : ${application.resumeFileName}` : ""}
        {application.matchScore !== null
          ? ` · score au moment de candidater : ${String(application.matchScore)}/100`
          : ""}
        {application.letterSubject !== null ? " · lettre jointe au dossier" : ""}
      </p>
    )}

    <form
      className="application-status-form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const status = data.get("status");
        const note = data.get("note");
        if (typeof status === "string" && status !== application.status) {
          onChangeStatus(status, typeof note === "string" ? note.trim() : "");
        }
      }}
    >
      <select
        className="application-select"
        name="status"
        defaultValue={application.status}
        aria-label="Nouveau statut"
      >
        {Object.entries(APPLICATION_STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input
        className="application-note-input"
        name="note"
        placeholder="Note d'historique (optionnelle)"
        maxLength={500}
      />
      <button type="submit" className="workspace-button" disabled={busy}>
        Changer le statut
      </button>
    </form>

    <form
      className="application-notes-form"
      onSubmit={(event) => {
        event.preventDefault();
        const notes = new FormData(event.currentTarget).get("notes");
        onSaveNotes(typeof notes === "string" ? notes.trim() : "");
      }}
    >
      <textarea
        className="application-notes"
        name="notes"
        rows={2}
        placeholder="Notes libres du dossier"
        maxLength={2000}
        defaultValue={application.notes ?? ""}
      />
      <div className="resume-actions">
        <button type="submit" className="workspace-button" disabled={busy}>
          Enregistrer les notes
        </button>
        <button
          type="button"
          className="workspace-button workspace-button-danger"
          disabled={busy}
          onClick={onDelete}
        >
          Supprimer le dossier
        </button>
      </div>
    </form>

    <ul className="application-history">
      {application.events.map((event) => (
        <li key={`${event.status}-${event.occurredAt}`}>
          {exactDateTime(event.occurredAt)} -{" "}
          {APPLICATION_STATUS_LABELS[event.status] ?? event.status}
          {event.note !== null ? ` (${event.note})` : ""}
        </li>
      ))}
    </ul>
  </article>
);
