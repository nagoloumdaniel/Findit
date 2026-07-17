/**
 * Réduit un texte à un slug d'URL : minuscules, sans accent, mots séparés par un
 * tiret. Le résultat respecte le motif que l'API attend d'un slug
 * (`^[a-z0-9]+(?:-[a-z0-9]+)*$`) et ne dépasse pas `maxLength`.
 *
 * Rend une chaîne vide si le texte ne contenait rien de slugifiable — l'appelant
 * doit alors se rabattre sur une valeur sûre plutôt que d'écrire un slug vide.
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
 * Slug d'une offre : titre normalisé, ville et identifiant de source. L'ajout de
 * l'identifiant garantit l'unicité — deux offres au même titre dans la même
 * ville restent distinctes — et la stabilité : la même offre recollectée retrouve
 * son slug.
 */
export const jobSlug = (normalizedTitle: string, city: string, externalId: string): string => {
  const base = slugify(`${normalizedTitle}-${city}`, 100);
  const suffix = slugify(externalId, 24);
  const parts = [base, suffix].filter((part) => part !== "");

  // Un identifiant purement numérique reste seul recevable comme slug.
  return parts.join("-") || slugify(externalId) || externalId.replace(/[^a-z0-9]+/gu, "");
};
