import { Skeleton } from "../../../components/skeleton";

/// Sources : la liste des sources enregistrées.
export default function Loading() {
  return <Skeleton variant="list" count={6} />;
}
