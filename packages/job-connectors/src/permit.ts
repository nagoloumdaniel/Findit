import type { SourceAccessStatus } from "@findit/database";

/**
 * Preuve qu'une collecte a franchi le contrôle d'accès.
 *
 * Le garde-fou est structurel, et non déclaratif : `collect` exige un permis,
 * et un permis ne s'obtient qu'en passant le contrôle. Deux choses le
 * garantissent. Le champ privé rend le type nominal, donc un objet de même
 * forme n'est pas un permis. Et l'index du paquet n'exporte que le type, jamais
 * la classe : hors du paquet, `new CollectionPermit(…)` n'existe pas.
 */
export class CollectionPermit {
  readonly #granted = true;

  constructor(
    readonly connectorName: string,
    readonly accessStatus: SourceAccessStatus,
    readonly grantedAt: Date,
  ) {}

  /** Toujours vrai. Un permis refusé n'est jamais construit. */
  get granted(): boolean {
    return this.#granted;
  }
}
