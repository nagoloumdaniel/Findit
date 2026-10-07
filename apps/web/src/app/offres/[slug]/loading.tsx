import { Skeleton } from "../../../components/skeleton";

/// La fiche d'offre attend l'API : le squelette garde l'en-tête, les faits et
/// les sections à leur place.
export default function Loading() {
  return <Skeleton variant="detail" />;
}
