import { PageShell } from "@findit/ui";

import "./skeletons.css";

/*
 * Un seul composant paramétrable pour toutes les routes qui attendent quelque
 * chose. Le POURQUOI : dix `loading.tsx` qui recopient chacun leur mise en page
 * divergent à la première refonte ; ici, la variante dit la forme, et les
 * grilles utilisées sont celles du contenu réel (`.job-grid`, `.stat-grid`,
 * `.dashboard-list`, `.detail-facts`) pour que les hauteurs coïncident.
 */
export type SkeletonVariant = "home" | "detail" | "stats" | "list" | "panel" | "form" | "analytics";

export type SkeletonProps = Readonly<{
  readonly variant: SkeletonVariant;
  /** Nombre de cartes, de lignes ou de sections, selon la variante. */
  readonly count?: number;
}>;

const Block = ({ className }: Readonly<{ className: string }>) => (
  <span aria-hidden="true" className={`skeleton-block ${className}`} />
);

const Rows = ({ count }: Readonly<{ count: number }>) => (
  <ul className="dashboard-list">
    {Array.from({ length: count }, (_, index) => (
      <li className="dashboard-row" key={index}>
        <Block className="skeleton-line skeleton-line-short" />
        <Block className="skeleton-line skeleton-line-tiny" />
      </li>
    ))}
  </ul>
);

const HomeSkeleton = ({ count }: Readonly<{ count: number }>) => (
  <>
    <header className="hero">
      <Block className="skeleton-heading" />
      <Block className="skeleton-line" />
      <Block className="skeleton-line skeleton-line-short" />
    </header>
    <div className="search-filter-row">
      <Block className="skeleton-search" />
    </div>
    <section className="results">
      <ul className="job-grid">
        {Array.from({ length: count }, (_, index) => (
          <li key={index}>
            <article className="job-card">
              <div className="job-card-head">
                <Block className="skeleton-badge" />
                <Block className="skeleton-line skeleton-line-tiny" />
              </div>
              <Block className="skeleton-line skeleton-line-short" />
              <Block className="skeleton-line" />
              <Block className="skeleton-line skeleton-line-tiny" />
            </article>
          </li>
        ))}
      </ul>
    </section>
  </>
);

const DetailSkeleton = () => (
  <>
    <Block className="skeleton-line skeleton-line-tiny" />
    <header className="detail-head">
      <Block className="skeleton-badge" />
      <Block className="skeleton-heading" />
      <Block className="skeleton-line skeleton-line-short" />
      <Block className="skeleton-line skeleton-line-tiny" />
    </header>
    <dl className="detail-facts">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index}>
          <dt>
            <Block className="skeleton-line skeleton-line-tiny" />
          </dt>
          <dd>
            <Block className="skeleton-line skeleton-line-short" />
          </dd>
        </div>
      ))}
    </dl>
    {Array.from({ length: 2 }, (_, index) => (
      <section className="detail-section" key={index}>
        <Block className="skeleton-heading" />
        <Block className="skeleton-line" />
        <Block className="skeleton-line" />
        <Block className="skeleton-line skeleton-line-short" />
      </section>
    ))}
  </>
);

const StatsSkeleton = ({ count }: Readonly<{ count: number }>) => (
  <>
    <Block className="skeleton-heading" />
    <Block className="skeleton-line skeleton-line-short" />
    <div className="stat-grid">
      {Array.from({ length: count }, (_, index) => (
        <div className="stat-card" key={index}>
          <Block className="skeleton-line skeleton-line-tiny" />
          <Block className="skeleton-line skeleton-line-short" />
        </div>
      ))}
    </div>
  </>
);

const ListSkeleton = ({ count }: Readonly<{ count: number }>) => (
  <>
    <Block className="skeleton-heading" />
    <Rows count={count} />
  </>
);

const PanelSkeleton = () => (
  <>
    <Block className="skeleton-heading" />
    <div className="state-panel">
      <Block className="skeleton-line skeleton-line-short" />
      <Block className="skeleton-line" />
    </div>
  </>
);

const FormSkeleton = ({ count }: Readonly<{ count: number }>) => (
  <>
    <Block className="skeleton-heading" />
    <Block className="skeleton-line skeleton-line-short" />
    <div className="matching-form">
      <Block className="skeleton-line skeleton-line-tiny" />
      <Block className="skeleton-textarea" />
      <Block className="skeleton-button" />
    </div>
    <Block className="skeleton-heading" />
    <Rows count={count} />
  </>
);

const AnalyticsSkeleton = ({ count }: Readonly<{ count: number }>) => (
  <>
    <Block className="skeleton-heading" />
    <Block className="skeleton-line" />
    {Array.from({ length: count }, (_, index) => (
      <section key={index}>
        <Block className="skeleton-heading" />
        <Rows count={4} />
      </section>
    ))}
  </>
);

const contentFor = (variant: SkeletonVariant, count: number) => {
  switch (variant) {
    case "home":
      return <HomeSkeleton count={count} />;
    case "detail":
      return <DetailSkeleton />;
    case "stats":
      return <StatsSkeleton count={count} />;
    case "list":
      return <ListSkeleton count={count} />;
    case "panel":
      return <PanelSkeleton />;
    case "form":
      return <FormSkeleton count={count} />;
    case "analytics":
      return <AnalyticsSkeleton count={count} />;
  }
};

export const Skeleton = ({ variant, count = 4 }: SkeletonProps) => {
  const content = (
    <div className="skeleton-shell" role="status" aria-label="Chargement…">
      {contentFor(variant, count)}
    </div>
  );

  // L'accueil et la fiche d'offre vivent sous `PageShell` ; le dashboard a la
  // sienne, fournie par son layout.
  return variant === "home" || variant === "detail" ? <PageShell>{content}</PageShell> : content;
};
