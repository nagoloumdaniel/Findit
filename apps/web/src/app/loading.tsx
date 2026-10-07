import { Skeleton } from "../components/skeleton";

/// Pendant la recherche et le scoring, l'accueil montre déjà sa grille de cartes.
export default function Loading() {
  return <Skeleton variant="home" count={6} />;
}
