import { Skeleton } from "../../../components/skeleton";

/// Liste des runs de l'agent.
export default function Loading() {
  return <Skeleton variant="list" count={5} />;
}
