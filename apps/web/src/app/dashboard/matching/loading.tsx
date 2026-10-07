import { Skeleton } from "../../../components/skeleton";

/// Matching : le formulaire CV puis l'historique.
export default function Loading() {
  return <Skeleton variant="form" count={4} />;
}
