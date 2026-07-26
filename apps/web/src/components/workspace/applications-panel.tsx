"use client";

import { useEffect, useState } from "react";

import {
  deleteApplication,
  listApplications,
  updateApplication,
  type ApplicationView,
} from "../../lib/workspace-api";
import { ApplicationCard } from "./application-card";

export type ApplicationsPanelProps = Readonly<{
  workspaceKey: string;
  /** Change quand un dossier vient d'être créé ailleurs : force le rechargement. */
  refreshToken: number;
}>;

/*
 * Les dossiers de candidature, du plus récemment bougé au plus ancien. Les
 * changements passent par l'API et la liste se recharge depuis la vérité de
 * la base - pas d'état local qui divergerait.
 */
export const ApplicationsPanel = ({ workspaceKey, refreshToken }: ApplicationsPanelProps) => {
  const [applications, setApplications] = useState<ApplicationView[] | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);

  const reload = async () => {
    const result = await listApplications(workspaceKey);
    if (result.ok) {
      setApplications(result.data);
    } else {
      setMessage(result.message);
    }
  };

  // Rechargement volontaire quand la clé change ou qu'un dossier vient
  // d'être créé ailleurs dans la page.
  useEffect(() => {
    void reload();
  }, [workspaceKey, refreshToken]);

  const withBusy = async (id: string, action: () => Promise<void>) => {
    setBusy((current) => ({ ...current, [id]: true }));
    setMessage(null);
    try {
      await action();
    } finally {
      setBusy((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  };

  if (applications === null || applications.length === 0) {
    return applications === null ? null : (
      <section className="application" aria-label="Suivi des candidatures">
        <h2 className="application-title">Suivi des candidatures</h2>
        <p className="application-note">
          Aucun dossier. « Suivre cette candidature » sur une offre crée le dossier avec ses
          instantanés : offre, CV, score et lettre du moment.
        </p>
      </section>
    );
  }

  return (
    <section className="application" aria-label="Suivi des candidatures">
      <h2 className="application-title">Suivi des candidatures</h2>
      {message !== null && (
        <p className="workspace-error" role="alert">
          {message}
        </p>
      )}
      <div className="workspace-list">
        {applications.map((application) => (
          <ApplicationCard
            key={application.id}
            application={application}
            busy={busy[application.id] ?? false}
            onChangeStatus={(status, note) => {
              void withBusy(application.id, async () => {
                const result = await updateApplication(workspaceKey, application.id, {
                  status,
                  ...(note !== "" ? { note } : {}),
                });
                if (!result.ok) {
                  setMessage(result.message);
                  return;
                }
                await reload();
              });
            }}
            onSaveNotes={(notes) => {
              void withBusy(application.id, async () => {
                const result = await updateApplication(workspaceKey, application.id, { notes });
                if (!result.ok) {
                  setMessage(result.message);
                  return;
                }
                await reload();
              });
            }}
            onDelete={() => {
              if (!window.confirm(`Supprimer le dossier « ${application.jobTitle} » ?`)) {
                return;
              }
              void withBusy(application.id, async () => {
                const result = await deleteApplication(workspaceKey, application.id);
                if (!result.ok) {
                  setMessage(result.message);
                  return;
                }
                await reload();
              });
            }}
          />
        ))}
      </div>
    </section>
  );
};
