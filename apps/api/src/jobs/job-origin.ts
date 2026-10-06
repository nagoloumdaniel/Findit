import { AtsKind, type PrismaClient } from "@findit/database";

/// Longueur maximale de l'extrait public d'une offre de job board.
export const JOB_BOARD_EXCERPT_CHARS = 320;

export type JobOrigin = "OFFICIAL" | "JOB_BOARD";

/*
 * Republier en entier le contenu d'un job board n'est pas couvert par ses
 * conditions d'utilisation : le public n'en voit qu'un extrait et un lien vers
 * l'origine, la description complète reste en base et sert le matching privé.
 *
 * Le registre tranche, jamais une liste écrite ici : toute source dont le type
 * est JOB_BOARD est concernée, y compris celle qu'on ajoutera demain. La
 * requête porte sur une table de quelques lignes, donc elle se paie une fois par
 * lecture publique sans qu'une mise en cache soit nécessaire.
 */
export const loadJobBoardSourceNames = async (
  prisma: PrismaClient,
): Promise<ReadonlySet<string>> => {
  const rows = await prisma.connector.findMany({
    where: { atsKind: AtsKind.JOB_BOARD },
    select: { name: true },
  });

  return new Set(rows.map((row) => row.name));
};

/// Une offre sans source connue n'est jamais traitée comme un job board : le
/// doute ne doit pas dépouiller une offre officielle de sa description.
export const originOf = (
  sourceName: string | null,
  jobBoardNames: ReadonlySet<string>,
): JobOrigin => (sourceName !== null && jobBoardNames.has(sourceName) ? "JOB_BOARD" : "OFFICIAL");

/*
 * L'extrait coupe sur un mot entier : une phrase rompue au milieu d'un mot se
 * lit comme un texte cassé, et le lecteur y voit une erreur de Findit plutôt
 * qu'une limite volontaire.
 */
export const excerptOf = (text: string, maxChars: number = JOB_BOARD_EXCERPT_CHARS): string => {
  const trimmed = text.trim();

  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  const cut = trimmed.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");

  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
};
