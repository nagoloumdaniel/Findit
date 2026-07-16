/*
 * La marque est décorative : le titre de la page porte déjà le nom « Findit ».
 * Elle est donc rendue via `background-image` en CSS plutôt qu'avec deux
 * balises `img`. Deux `img` obligeaient le navigateur à télécharger les deux
 * variantes — React précharge celle qui est masquée — alors qu'une seule est
 * affichée. Une règle CSS sous media query ne charge que la variante retenue.
 *
 * Le fichier noir sert le thème clair, le fichier blanc le thème sombre.
 */
export const Logo = () => <span className="logo" aria-hidden="true" />;
