"use client";

import { PageShell } from "@findit/ui";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

/*
 * Connexion à l'espace personnel. Le POURQUOI : un mot de passe unique, pas de
 * compte. La page ne fait que poster sur `/api/session` ; c'est le serveur qui
 * vérifie et pose le cookie, que le JavaScript de la page ne peut pas lire.
 */
export default function ConnexionPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (response.status === 204) {
        router.replace("/moi");
        return;
      }
      if (response.status === 401) {
        setMessage("Mot de passe incorrect.");
        return;
      }
      if (response.status === 503) {
        setMessage("Espace personnel non configuré.");
        return;
      }
      setMessage("La connexion a échoué. Réessaie.");
    } catch {
      setMessage("Le serveur est injoignable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell>
      <h1>Espace personnel</h1>
      <p className="intro">
        Un mot de passe unique protège tes informations personnelles. Il reste côté serveur : le
        navigateur ne reçoit qu’un cookie de session signé.
      </p>

      <form
        className="matching-form"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <label className="matching-label" htmlFor="password">
          Mot de passe
        </label>
        <input
          id="password"
          className="job-search-input"
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          autoComplete="current-password"
          autoFocus
        />
        <button className="matching-button" type="submit" disabled={loading || password === ""}>
          {loading ? "Connexion…" : "Se connecter"}
        </button>
      </form>

      {message !== null ? (
        <p className="dashboard-lead" role="alert">
          {message}
        </p>
      ) : null}
    </PageShell>
  );
}
