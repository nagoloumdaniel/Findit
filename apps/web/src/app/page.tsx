import {
  DEFAULT_MAX_AGE_HOURS,
  EXTENDED_MAX_AGE_HOURS,
  JOB_CONTRACTS,
  JOB_ROLE_CATEGORIES,
} from "@findit/shared";
import { PageShell } from "@findit/ui";

const contractLabels = {
  ALTERNANCE: "Alternance",
  INTERNSHIP: "Stage",
} as const;

const roleLabels = {
  FRONTEND: "Front-end",
  BACKEND: "Back-end",
  FULLSTACK: "Full-stack",
  MOBILE: "Développement mobile",
  DATA_ANALYST: "Data Analyst",
  DATA_ENGINEER: "Data Engineer",
} as const;

export default function HomePage() {
  return (
    <PageShell>
      <header className="hero">
        <p className="eyebrow">Initialisation technique</p>
        <h1>Findit</h1>
        <p className="intro">
          Alternances et stages récents en Île-de-France, dans les métiers du développement et de la
          data.
        </p>
        <p className="hero-note">
          Le socle est en construction. Cette page présente uniquement le périmètre validé, sans
          résultat simulé.
        </p>
      </header>

      <section className="scope" aria-labelledby="scope-title">
        <div className="section-heading">
          <p className="section-label">Périmètre validé</p>
          <h2 id="scope-title">Une recherche cadrée avant la collecte.</h2>
        </div>

        <div className="scope-grid">
          <article className="scope-card">
            <p className="card-index" aria-hidden="true">
              01
            </p>
            <h3>Contrats</h3>
            <ul className="tag-list" aria-label="Types de contrats ciblés">
              {JOB_CONTRACTS.map((contract) => (
                <li key={contract}>{contractLabels[contract]}</li>
              ))}
            </ul>
          </article>

          <article className="scope-card scope-card-wide">
            <p className="card-index" aria-hidden="true">
              02
            </p>
            <h3>Développement logiciel, mobile et data</h3>
            <ul className="tag-list" aria-label="Métiers ciblés">
              {JOB_ROLE_CATEGORIES.map((role) => (
                <li key={role}>{roleLabels[role]}</li>
              ))}
            </ul>
          </article>

          <article className="scope-card">
            <p className="card-index" aria-hidden="true">
              03
            </p>
            <h3>Fraîcheur prévue</h3>
            <p className="freshness-copy">
              Fenêtre principale de <strong>{DEFAULT_MAX_AGE_HOURS} heures</strong>, extensible
              jusqu’à <strong>{EXTENDED_MAX_AGE_HOURS} heures</strong> lorsque le périmètre l’exige.
            </p>
          </article>
        </div>
      </section>

      <section className="status-panel" aria-labelledby="status-title">
        <div className="status-mark" aria-hidden="true" />
        <div>
          <p className="section-label">État actuel</p>
          <h2 id="status-title">Aucune offre n’est affichée.</h2>
          <p>La collecte réelle doit être opérationnelle et vérifiée avant toute publication.</p>
        </div>
      </section>
    </PageShell>
  );
}
