"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  checkWorkspaceKey,
  downloadPdf,
  fetchResumeDetail,
  listResumes,
  removeResume,
  structureResume,
  uploadResume,
  type ResumeDetail,
  type ResumeSummary,
} from "../../lib/workspace-api";
import { ApplicationPanel } from "./application-panel";
import { ApplicationsPanel } from "./applications-panel";
import { ResumeCard } from "./resume-card";

/*
 * La clé est mémorisée par le navigateur (demande du propriétaire : pas de
 * saisie à chaque visite). Elle n'apparaît ni dans une adresse ni dans le
 * code de la page ; « Verrouiller » l'oublie. Machine partagée = verrouiller.
 */
const KEY_STORAGE = "findit-workspace-key";

export const WorkspacePanel = () => {
  const [key, setKey] = useState<string | null>(null);
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [details, setDetails] = useState<Record<string, ResumeDetail>>({});
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [trackRefresh, setTrackRefresh] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (activeKey: string) => {
    const result = await listResumes(activeKey);
    if (result.ok) {
      setResumes(result.data);
    } else {
      setMessage(result.message);
    }
  }, []);

  // Reprend la clé de la session si elle y est déjà, et la revérifie :
  // une clé périmée ne doit pas laisser croire que l'espace est ouvert.
  useEffect(() => {
    const stored = localStorage.getItem(KEY_STORAGE);
    if (stored === null) {
      return;
    }
    void checkWorkspaceKey(stored).then((result) => {
      if (result.ok) {
        setKey(stored);
        setResumes(result.data);
      } else {
        localStorage.removeItem(KEY_STORAGE);
      }
    });
  }, []);

  const unlock = async (candidate: string) => {
    setGateError(null);
    const result = await checkWorkspaceKey(candidate);
    if (!result.ok) {
      setGateError(result.status === 401 ? "Clé refusée." : result.message);
      return;
    }
    localStorage.setItem(KEY_STORAGE, candidate);
    setKey(candidate);
    setResumes(result.data);
  };

  const lock = () => {
    localStorage.removeItem(KEY_STORAGE);
    setKey(null);
    setResumes([]);
    setDetails({});
    setMessage(null);
  };

  const withBusy = async (id: string, kind: string, action: () => Promise<void>) => {
    setBusy((current) => ({ ...current, [id]: kind }));
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

  if (key === null) {
    return (
      <form
        className="workspace-gate"
        onSubmit={(event) => {
          event.preventDefault();
          const input = new FormData(event.currentTarget).get("key");
          if (typeof input === "string" && input.trim() !== "") {
            void unlock(input.trim());
          }
        }}
      >
        <label className="job-search-label" htmlFor="workspace-key">
          Clé de l&apos;espace privé
        </label>
        <div className="job-search-row">
          <input
            id="workspace-key"
            className="job-search-input"
            type="password"
            name="key"
            autoComplete="off"
            placeholder="Coller la clé"
          />
          <button className="job-search-submit" type="submit">
            Ouvrir
          </button>
        </div>
        {gateError !== null && (
          <p className="workspace-error" role="alert">
            {gateError}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="workspace">
      <div className="workspace-toolbar">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const file = fileInput.current?.files?.[0];
            if (file === undefined) {
              setMessage("Choisir d'abord un fichier PDF, DOCX ou TXT.");
              return;
            }
            setUploading(true);
            setMessage(null);
            void uploadResume(key, file)
              .then(async (result) => {
                if (!result.ok) {
                  setMessage(result.message);
                  return;
                }
                if (fileInput.current !== null) {
                  fileInput.current.value = "";
                }
                setPickedName(null);
                await refresh(key);
              })
              .finally(() => {
                setUploading(false);
              });
          }}
        >
          <div className="workspace-upload-row">
            {/* L'input natif est masqué : l'étiquette stylée le pilote et
                affiche le nom du fichier choisi au lieu du contrôle brut. */}
            <input
              id="cv-file"
              className="workspace-file-input"
              ref={fileInput}
              type="file"
              accept=".pdf,.docx,.txt"
              aria-label="Fichier de CV"
              onChange={(event) => {
                setPickedName(event.currentTarget.files?.[0]?.name ?? null);
              }}
            />
            <label
              htmlFor="cv-file"
              className={
                pickedName === null
                  ? "workspace-file-label"
                  : "workspace-file-label workspace-file-label-picked"
              }
            >
              <span className="workspace-file-icon" aria-hidden="true">
                +
              </span>
              {pickedName ?? "Choisir un CV (PDF, DOCX ou TXT)"}
            </label>
            <button
              className="job-search-submit"
              type="submit"
              disabled={uploading || pickedName === null}
            >
              {uploading ? "Import…" : "Importer"}
            </button>
          </div>
        </form>
        <button type="button" className="workspace-button" onClick={lock}>
          Verrouiller
        </button>
      </div>

      {message !== null && (
        <p className="workspace-error" role="alert">
          {message}
        </p>
      )}

      {resumes.length === 0 ? (
        <div className="state-panel" role="status">
          <h2>Aucun CV importé.</h2>
          <p>
            Importer un CV (PDF, DOCX ou TXT), puis le structurer pour obtenir score, CV remis en
            page et lettre. Chaque CV importé expire de lui-même après la durée de rétention.
          </p>
        </div>
      ) : (
        <div className="workspace-list">
          {resumes.map((resume) => (
            <ResumeCard
              key={resume.id}
              resume={resume}
              detail={details[resume.id] ?? null}
              busy={busy[resume.id] ?? null}
              progress={progress[resume.id] ?? null}
              onStructure={() => {
                /*
                 * Le serveur ne sait pas dire où en est le modèle : la barre
                 * est une estimation calée sur la taille du texte extrait,
                 * plafonnée à 95 % tant que la réponse n'est pas arrivée. Elle
                 * donne un ordre de grandeur, pas une mesure.
                 */
                const estimatedMs = 45_000 + resume.textLength * 15;
                const startedAt = Date.now();
                setProgress((current) => ({ ...current, [resume.id]: 0 }));
                const ticker = setInterval(() => {
                  const ratio = (Date.now() - startedAt) / estimatedMs;
                  setProgress((current) => ({
                    ...current,
                    [resume.id]: Math.min(95, Math.round(ratio * 100)),
                  }));
                }, 500);

                void withBusy(resume.id, "structure", async () => {
                  try {
                    const result = await structureResume(key, resume.id);
                    if (!result.ok) {
                      setMessage(result.message);
                      return;
                    }
                    setProgress((current) => ({ ...current, [resume.id]: 100 }));
                    setDetails((current) => ({ ...current, [resume.id]: result.data }));
                    await refresh(key);
                  } finally {
                    clearInterval(ticker);
                    setTimeout(() => {
                      setProgress((current) => {
                        const next = { ...current };
                        delete next[resume.id];
                        return next;
                      });
                    }, 800);
                  }
                });
              }}
              onShowFacts={() => {
                if (details[resume.id] !== undefined) {
                  setDetails((current) => {
                    const next = { ...current };
                    delete next[resume.id];
                    return next;
                  });
                  return;
                }
                void withBusy(resume.id, "facts", async () => {
                  const result = await fetchResumeDetail(key, resume.id);
                  if (result.ok) {
                    setDetails((current) => ({ ...current, [resume.id]: result.data }));
                  } else {
                    setMessage(result.message);
                  }
                });
              }}
              onDownloadCv={() => {
                void withBusy(resume.id, "pdf", async () => {
                  const result = await downloadPdf(
                    key,
                    `/api/resumes/${resume.id}/documents/cv.pdf`,
                    "cv.pdf",
                  );
                  if (!result.ok) {
                    setMessage(result.message);
                  }
                });
              }}
              onDelete={() => {
                if (!window.confirm(`Supprimer « ${resume.originalFileName} » ?`)) {
                  return;
                }
                void withBusy(resume.id, "delete", async () => {
                  const result = await removeResume(key, resume.id);
                  if (!result.ok) {
                    setMessage(result.message);
                    return;
                  }
                  setDetails((current) => {
                    const next = { ...current };
                    delete next[resume.id];
                    return next;
                  });
                  await refresh(key);
                });
              }}
            />
          ))}
        </div>
      )}

      {/* La candidature s'appuie sur le CV structuré le plus récent : les
          scores se calculent et les lettres se relisent depuis la même page. */}
      {(() => {
        const structured = resumes.find((resume) => resume.structuredAt !== null);
        return structured === undefined ? null : (
          <ApplicationPanel
            workspaceKey={key}
            resume={structured}
            onTracked={() => {
              setTrackRefresh((current) => current + 1);
            }}
          />
        );
      })()}

      <ApplicationsPanel workspaceKey={key} refreshToken={trackRefresh} />
    </div>
  );
};
