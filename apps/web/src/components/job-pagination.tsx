import Link from "next/link";

export type JobPaginationProps = Readonly<{
  current: URLSearchParams;
  page: number;
  pageSize: number;
  total: number;
}>;

const pageLink = (current: URLSearchParams, page: number): string => {
  const next = new URLSearchParams(current);

  if (page <= 1) {
    next.delete("page");
  } else {
    next.set("page", String(page));
  }

  const query = next.toString();
  return query ? `/?${query}` : "/";
};

/*
 * Pagination par liens précédent et suivant. Le total réel est affiché : aucun
 * décompte n'est arrondi ni estimé.
 */
export const JobPagination = ({ current, page, pageSize, total }: JobPaginationProps) => {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  if (lastPage === 1) {
    return null;
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav className="pagination" aria-label="Pagination">
      {page > 1 ? (
        <Link className="pagination-link" href={pageLink(current, page - 1)} rel="prev">
          Précédent
        </Link>
      ) : (
        <span className="pagination-link is-disabled" aria-disabled="true">
          Précédent
        </span>
      )}

      <p className="pagination-status" aria-live="polite">
        Offres {from} à {to} sur {total}
      </p>

      {page < lastPage ? (
        <Link className="pagination-link" href={pageLink(current, page + 1)} rel="next">
          Suivant
        </Link>
      ) : (
        <span className="pagination-link is-disabled" aria-disabled="true">
          Suivant
        </span>
      )}
    </nav>
  );
};
