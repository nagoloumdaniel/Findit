/*
 * État vide partagé par toutes les sections du dashboard. Tant que l’API
 * n’est pas branchée, chaque section affiche ce même message plutôt qu’un
 * tableau vide qui laisserait croire que la collecte a tourné sans rien
 * trouver. Le composant reste un composant serveur : aucun état local.
 */
export const EmptyState = () => (
  <div className="state-panel" role="status">
    <h2>Aucune donnée pour l’instant.</h2>
    <p>L’API sera branchée à l’étape d’intégration.</p>
  </div>
);
