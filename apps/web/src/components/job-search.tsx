export type JobSearchProps = Readonly<{ current: URLSearchParams }>;

/*
 * Formulaire GET : la recherche produit une adresse partageable, exactement
 * comme les filtres, et fonctionne sans JavaScript.
 *
 * Les filtres actifs sont réémis en champs cachés pour qu'une recherche ne les
 * efface pas silencieusement. `page` est volontairement omis : une nouvelle
 * recherche repart de la première page.
 */
export const JobSearch = ({ current }: JobSearchProps) => {
  const kept = ["freshness", "role", "contract", "department", "workMode", "sort"] as const;

  return (
    <form className="job-search" action="/" method="get" role="search">
      <label className="job-search-label" htmlFor="q">
        Rechercher
      </label>

      <div className="job-search-row">
        <input
          id="q"
          className="job-search-input"
          type="search"
          name="q"
          defaultValue={current.get("q") ?? ""}
          placeholder="Titre, entreprise, technologie…"
          maxLength={120}
          autoComplete="off"
        />
        <button className="job-search-submit" type="submit">
          Rechercher
        </button>
      </div>

      {kept.map((key) => {
        const value = current.get(key);
        return value ? <input key={key} type="hidden" name={key} value={value} /> : null;
      })}
    </form>
  );
};
