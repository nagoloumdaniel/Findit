import { PageShell } from "@findit/ui";
import type { Metadata } from "next";
import Link from "next/link";

import { fetchMatchingHistory } from "../../lib/api";
import { contractLabels } from "../../lib/labels";
import { fetchProfile, isProfileConfigured } from "../../lib/profile-api";

import { saveProfileAction } from "./actions";

export const metadata: Metadata = { title: "Mon espace" };

/// Le profil change à chaque enregistrement : rien à mettre en cache ici.
export const dynamic = "force-dynamic";

const dateTime = (value: string): string =>
  new Date(value).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });

export default async function MySpacePage() {
  if (!isProfileConfigured()) {
    return (
      <PageShell>
        <h1>Mon espace</h1>
        <div className="state-panel" role="status">
          <h2>Espace personnel non configuré</h2>
          <p>
            Renseigner <code>INTERNAL_API_KEY</code>, <code>PROFILE_PASSWORD</code> et{" "}
            <code>SESSION_SECRET</code> dans l’environnement du site pour activer cet espace.
          </p>
        </div>
      </PageShell>
    );
  }

  const [profile, history] = await Promise.all([fetchProfile(), fetchMatchingHistory()]);
  const matchings = history.ok ? history.data : [];

  return (
    <PageShell>
      <header className="hero">
        <p className="top-nav">
          <Link href="/">Offres</Link>
          <Link href="/dashboard">Exploitation</Link>
        </p>
        <h1>{profile.fullName === "" ? "Mon espace" : profile.fullName}</h1>
        {profile.headline === null ? null : <p className="intro">{profile.headline}</p>}
        <p className="hero-note">
          {[profile.city, profile.email, profile.phone].filter(Boolean).join(" · ") ||
            "Aucune coordonnée enregistrée."}
          {profile.updatedAt === null
            ? null
            : ` — dernière mise à jour le ${dateTime(profile.updatedAt)}.`}
        </p>
      </header>

      <section aria-label="Compétences">
        <h2>Compétences</h2>
        {profile.skills.length === 0 ? (
          <p className="dashboard-lead">Aucune compétence enregistrée.</p>
        ) : (
          <ul className="skill-list">
            {profile.skills.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Langues">
        <h2>Langues</h2>
        {profile.languages.length === 0 ? (
          <p className="dashboard-lead">Aucune langue enregistrée.</p>
        ) : (
          <ul className="dashboard-list">
            {profile.languages.map((language) => (
              <li className="dashboard-row" key={language.name}>
                <span className="dashboard-row-title">{language.name}</span>
                <span className="dashboard-row-meta">{language.level}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Expériences">
        <h2>Expériences</h2>
        {profile.experiences.length === 0 ? (
          <p className="dashboard-lead">Aucune expérience enregistrée.</p>
        ) : (
          <ul className="dashboard-list">
            {profile.experiences.map((experience) => (
              <li className="dashboard-row" key={`${experience.title}-${experience.company}`}>
                <span className="dashboard-row-title">
                  {experience.title} — {experience.company}
                </span>
                <span className="dashboard-row-meta">
                  {experience.period}
                  {experience.description === "" ? "" : ` · ${experience.description}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Formation">
        <h2>Formation</h2>
        {profile.education.length === 0 ? (
          <p className="dashboard-lead">Aucune formation enregistrée.</p>
        ) : (
          <ul className="dashboard-list">
            {profile.education.map((education) => (
              <li
                className="dashboard-row"
                key={`${education.school}-${education.degree}-${education.field}`}
              >
                <span className="dashboard-row-title">
                  {education.degree === ""
                    ? education.school
                    : `${education.degree} - ${education.school}`}
                </span>
                <span className="dashboard-row-meta">
                  {[education.field, education.startDate, education.endDate]
                    .filter(Boolean)
                    .join(" · ")}
                  {education.description === "" ? "" : ` · ${education.description}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Certifications">
        <h2>Certifications</h2>
        {profile.certifications.length === 0 ? (
          <p className="dashboard-lead">Aucune certification enregistrée.</p>
        ) : (
          <ul className="dashboard-list">
            {profile.certifications.map((certification) => (
              <li className="dashboard-row" key={`${certification.name}-${certification.issuer}`}>
                <span className="dashboard-row-title">{certification.name}</span>
                <span className="dashboard-row-meta">
                  {[certification.issuer, certification.date].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Projets">
        <h2>Projets</h2>
        {profile.projects.length === 0 ? (
          <p className="dashboard-lead">Aucun projet enregistré.</p>
        ) : (
          <ul className="dashboard-list">
            {profile.projects.map((project) => (
              <li className="dashboard-row" key={`${project.name}-${project.url ?? ""}`}>
                <span className="dashboard-row-title">{project.name}</span>
                <span className="dashboard-row-meta">
                  {[project.role, project.description].filter(Boolean).join(" · ")}
                  {project.url === undefined || project.url === "" ? "" : ` · ${project.url}`}
                  {project.skills.length === 0 ? "" : ` · ${project.skills.join(", ")}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Contrats recherchés">
        <h2>Contrats recherchés</h2>
        {profile.preferredContracts.length === 0 ? (
          <p className="dashboard-lead">Aucune préférence de contrat enregistrée.</p>
        ) : (
          <ul className="tag-list">
            {profile.preferredContracts.map((contract) => (
              <li key={contract}>{contractLabels[contract] ?? contract}</li>
            ))}
          </ul>
        )}
      </section>

      {profile.links.length === 0 ? null : (
        <section aria-label="Liens">
          <h2>Liens</h2>
          <ul className="dashboard-list">
            {profile.links.map((link) => (
              <li className="dashboard-row" key={link.url}>
                <span className="dashboard-row-title">{link.label}</span>
                <span className="dashboard-row-meta">
                  <a href={link.url}>{link.url}</a>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="CV">
        <h2>CV</h2>
        {profile.cvText === null ? (
          <p className="dashboard-lead">Aucun CV enregistré.</p>
        ) : (
          <pre className="profile-cv">{profile.cvText}</pre>
        )}
      </section>

      {/* Les matchings viennent de l'API du site : c'est le seul endroit où le CV
          est effectivement mis à l'épreuve des offres publiées. */}
      <section aria-label="Matchings passés">
        <h2>Matchings passés</h2>
        {matchings.length === 0 ? (
          <p className="dashboard-lead">
            Aucun matching enregistré. <Link href="/dashboard/matching">Lancer un matching</Link>.
          </p>
        ) : (
          <ul className="dashboard-list">
            {matchings.map((run) => (
              <li className="dashboard-row" key={run.id}>
                <span className="dashboard-row-title">{dateTime(run.createdAt)}</span>
                <span className="dashboard-row-meta">
                  {run.jobCount} offre(s) · meilleur score {run.bestScore}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Le formulaire est replié : la page sert d'abord à lire son profil, on ne
          l'ouvre que pour le corriger. */}
      <details className="filters-toggle">
        <summary className="filters-toggle-button">Modifier mon profil</summary>
        <form action={saveProfileAction} className="profile-form">
          <label>
            Nom complet
            <input name="fullName" defaultValue={profile.fullName} />
          </label>
          <label>
            Titre
            <input name="headline" defaultValue={profile.headline ?? ""} />
          </label>
          <label>
            Ville
            <input name="city" defaultValue={profile.city ?? ""} />
          </label>
          <label>
            E-mail
            <input name="email" type="email" defaultValue={profile.email ?? ""} />
          </label>
          <label>
            Téléphone
            <input name="phone" defaultValue={profile.phone ?? ""} />
          </label>
          <label>
            Compétences (séparées par des virgules)
            <input name="skills" defaultValue={profile.skills.join(", ")} />
          </label>
          <label>
            Langues (une par ligne : « nom | niveau »)
            <textarea
              name="languages"
              rows={3}
              defaultValue={profile.languages
                .map((language) => `${language.name} | ${language.level}`)
                .join("\n")}
            />
          </label>
          <label>
            Liens (un par ligne : « libellé | url »)
            <textarea
              name="links"
              rows={3}
              defaultValue={profile.links.map((link) => `${link.label} | ${link.url}`).join("\n")}
            />
          </label>
          <label>
            Expériences (une par ligne : « titre | entreprise | période | description »)
            <textarea
              name="experiences"
              rows={6}
              defaultValue={profile.experiences
                .map((experience) =>
                  [experience.title, experience.company, experience.period, experience.description]
                    .join(" | ")
                    .replace(/( \| )+$/u, ""),
                )
                .join("\n")}
            />
          </label>
          <label>
            Formations (une par ligne : « école | diplôme | domaine | début | fin | description »)
            <textarea
              name="education"
              rows={4}
              defaultValue={profile.education
                .map((education) =>
                  [
                    education.school,
                    education.degree,
                    education.field,
                    education.startDate ?? "",
                    education.endDate ?? "",
                    education.description ?? "",
                  ]
                    .join(" | ")
                    .replace(/( \| )+$/u, ""),
                )
                .join("\n")}
            />
          </label>
          <label>
            Certifications (une par ligne : « nom | organisme | date »)
            <textarea
              name="certifications"
              rows={3}
              defaultValue={profile.certifications
                .map((certification) =>
                  [certification.name, certification.issuer ?? "", certification.date ?? ""]
                    .join(" | ")
                    .replace(/( \| )+$/u, ""),
                )
                .join("\n")}
            />
          </label>
          <label>
            Projets (une par ligne : « nom | rôle | description | url | compétences »)
            <textarea
              name="projects"
              rows={4}
              defaultValue={profile.projects
                .map((project) =>
                  [
                    project.name,
                    project.role ?? "",
                    project.description ?? "",
                    project.url ?? "",
                    project.skills.join(", "),
                  ]
                    .join(" | ")
                    .replace(/( \| )+$/u, ""),
                )
                .join("\n")}
            />
          </label>
          <label>
            Contrats recherchés (séparés par des virgules : ALTERNANCE, INTERNSHIP, CDI, CDD,
            INTERIM, STUDENT_JOB)
            <input name="preferredContracts" defaultValue={profile.preferredContracts.join(", ")} />
          </label>
          <label>
            CV (texte collé)
            <textarea name="cvText" rows={10} defaultValue={profile.cvText ?? ""} />
          </label>
          <button type="submit">Enregistrer</button>
        </form>
      </details>
    </PageShell>
  );
}
