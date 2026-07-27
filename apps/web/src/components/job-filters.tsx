import Link from "next/link";

import type { JobFilterOptions } from "../lib/api";
import { contractLabels, departmentLabels, roleLabels, workModeLabels } from "../lib/labels";

export type JobFiltersProps = Readonly<{
  options: JobFilterOptions;
  current: URLSearchParams;
}>;

/*
 * Les filtres sont des liens et non un formulaire : chaque état est une adresse
 * partageable, la page reste utilisable sans JavaScript, et le rendu serveur
 * garde son sens.
 */
const linkFor = (current: URLSearchParams, key: string, value: string | null): string => {
  const next = new URLSearchParams(current);

  if (value === null) {
    next.delete(key);
  } else {
    next.set(key, value);
  }

  // Changer un filtre ramène à la première page : la page 3 d'un autre filtre n'a pas de sens.
  next.delete("page");

  const query = next.toString();
  return query ? `/?${query}` : "/";
};

type GroupProps = Readonly<{
  title: string;
  paramKey: string;
  current: URLSearchParams;
  allLabel: string;
  options: { value: string; count: number }[];
  labels: Record<string, string>;
}>;

const FilterGroup = ({ title, paramKey, current, allLabel, options, labels }: GroupProps) => {
  const active = current.get(paramKey);

  return (
    <div className="filter-group">
      <p className="filter-title">{title}</p>
      <ul className="filter-options">
        <li>
          <Link
            href={linkFor(current, paramKey, null)}
            aria-current={active === null ? "true" : undefined}
            className="filter-chip"
          >
            {allLabel}
          </Link>
        </li>
        {options.map((option) => (
          <li key={option.value}>
            <Link
              href={linkFor(current, paramKey, option.value)}
              aria-current={active === option.value ? "true" : undefined}
              className="filter-chip"
            >
              {labels[option.value] ?? option.value}
              <span className="filter-count">{option.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const JobFilters = ({ options, current }: JobFiltersProps) => {
  // 3 jours est le défaut (choix du propriétaire) ; 24 heures resserre.
  const freshness = current.get("freshness") ?? "LAST_72H";

  return (
    <section className="filters" aria-label="Filtres">
      <div className="filter-group">
        <p className="filter-title">Publiées</p>
        <ul className="filter-options">
          <li>
            <Link
              href={linkFor(current, "freshness", null)}
              aria-current={freshness === "LAST_72H" ? "true" : undefined}
              className="filter-chip"
            >
              3 derniers jours
            </Link>
          </li>
          <li>
            <Link
              href={linkFor(current, "freshness", "LAST_24H")}
              aria-current={freshness === "LAST_24H" ? "true" : undefined}
              className="filter-chip"
            >
              Dernières 24 heures
            </Link>
          </li>
        </ul>
      </div>

      {options.roles.length > 0 ? (
        <FilterGroup
          title="Métier"
          paramKey="role"
          current={current}
          allLabel="Tous"
          options={options.roles}
          labels={roleLabels}
        />
      ) : null}

      {options.contracts.length > 0 ? (
        <FilterGroup
          title="Contrat"
          paramKey="contract"
          current={current}
          allLabel="Tous"
          options={options.contracts}
          labels={contractLabels}
        />
      ) : null}

      {options.departments.length > 0 ? (
        <FilterGroup
          title="Département"
          paramKey="department"
          current={current}
          allLabel="Toute l’Île-de-France"
          options={options.departments}
          labels={departmentLabels}
        />
      ) : null}

      {options.workModes.length > 0 ? (
        <FilterGroup
          title="Présence"
          paramKey="workMode"
          current={current}
          allLabel="Toutes"
          options={options.workModes}
          labels={workModeLabels}
        />
      ) : null}
    </section>
  );
};
