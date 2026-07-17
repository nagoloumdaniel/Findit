/*
 * La marque : le « f » du logo et « indit » se lisent ensemble « Findit ».
 *
 * Le glyphe est rendu via `background-image` en CSS plutôt qu'avec deux balises
 * `img`. Deux `img` obligeaient le navigateur à télécharger les deux variantes
 * — React précharge celle qui est masquée — alors qu'une seule est affichée.
 * Une règle CSS sous media query ne charge que la variante retenue. Le fichier
 * noir sert le thème clair, le fichier blanc le thème sombre.
 *
 * L'ensemble reste décoratif : le titre du document porte déjà le nom, et un
 * lecteur d'écran qui annoncerait « indit » dirait moins que rien.
 */
export const Logo = () => (
  <span className="brand" aria-hidden="true">
    <span className="logo" />
    <span className="brand-name">indit</span>
  </span>
);
