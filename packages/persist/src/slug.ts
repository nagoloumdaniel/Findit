/**
 * Réduction d'un texte en slug d'URL : minuscules, sans accent, mots séparés
 * par un tiret simple. Le résultat respecte le motif attendu par l'API
 * (`^[a-z0-9]+(?:-[a-z0-9]+)*$`) et ne dépasse pas `maxLength`.
 *
 * L'implémentation est volontairement identique à celle de `@findit/job-pipeline` :
 * les deux briques produisent les mêmes slugs pour la même entrée, afin qu'une
 * offre écrite par l'une soit reconnue par l'autre. Elle est copiée plutôt
 * qu'importée pour ne pas faire dépendre `@findit/persist` du pipeline entier
 * alors qu'il n'en consomme que ce détail.
 *
 * Rend une chaîne vide quand le texte ne contenait rien de slugifiable.
 */
export const slugify = (text: string, maxLength = 120): string => {
  const slug = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  if (slug.length <= maxLength) {
    return slug;
  }

  // Couper au tiret pour ne pas laisser un mot tronqué en fin de slug.
  const cut = slug.slice(0, maxLength);
  const lastHyphen = cut.lastIndexOf("-");
  return lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut;
};

/**
 * Slug d'une offre. Il réunit titre normalisé, entreprise normalisée, ville et
 * jour de publication : deux offres différentes restent distinctes, et la même
 * offre recollectée retrouve la même forme avant d'être écartée par la
 * déduplication. La date est au jour : deux collectes du même jour se
 * rapprochent, deux publications différentes se distinguent.
 */
export const jobSlug = (
  normalizedTitle: string,
  normalizedCompany: string,
  city: string,
  publishedAt: Date,
): string => {
  const day = publishedAt.toISOString().slice(0, 10).replace(/-/gu, "");
  const base = slugify(`${normalizedTitle} ${normalizedCompany} ${city} ${day}`, 120);
  return base || "offre";
};
