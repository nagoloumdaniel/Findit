/**
 * Erreurs de la couche IA. Toutes dérivent d'`AiError`, pour qu'un appelant
 * puisse attraper l'ensemble d'un coup, ou distinguer la cause s'il le veut.
 *
 * Le fil conducteur : une IA qui n'a pas répondu ce qu'on attend ne doit jamais
 * passer pour un succès. Mieux vaut une erreur explicite qu'un texte fabriqué.
 */
export class AiError extends Error {
  override readonly name: string = "AiError";
}

/** Le fournisseur IA est éteint (`AI_PROVIDER=disabled`) : rien n'a été tenté. */
export class AiDisabledError extends AiError {
  override readonly name = "AiDisabledError";
}

/** Le serveur du modèle est injoignable ou a répondu par une erreur. */
export class AiUnavailableError extends AiError {
  override readonly name = "AiUnavailableError";
}

/** Le modèle a répondu, mais sa sortie n'est ni du JSON valide ni au schéma. */
export class AiOutputError extends AiError {
  override readonly name = "AiOutputError";
}
