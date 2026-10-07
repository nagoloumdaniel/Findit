import { Skeleton } from "../../components/skeleton";

/// Vue d'ensemble : les quatre compteurs arrivent après l'API.
export default function Loading() {
  return <Skeleton variant="stats" count={4} />;
}
