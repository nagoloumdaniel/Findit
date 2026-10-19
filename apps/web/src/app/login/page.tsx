"use client";

import { useActionState } from "react";

import { loginAction } from "./actions";

/** Écran de connexion : email + mot de passe, puis retour au profil. */
export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, {});

  return (
    <section className="login-panel" aria-labelledby="login-title">
      <h1 id="login-title">Connexion</h1>
      <p className="login-lead">
        Accédez à votre espace personnel : profil, CV, compétences et favoris.
      </p>

      <form className="login-form" action={formAction}>
        <label>
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="vous@exemple.fr"
            maxLength={200}
          />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            maxLength={200}
          />
        </label>

        {state.error !== undefined ? (
          <p className="login-error" role="alert">
            {state.error}
          </p>
        ) : null}

        <button className="login-submit" type="submit" disabled={pending}>
          {pending ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </section>
  );
}
