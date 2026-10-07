import { Skeleton } from "../../../components/skeleton";

/// Plusieurs listes empilées : par jour, par source, par entreprise, par issue.
export default function Loading() {
  return <Skeleton variant="analytics" count={5} />;
}
