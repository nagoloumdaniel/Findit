import type { JobContract, JobRoleCategory } from "@findit/shared";

import { mentionsOutOfScopeContract, readContract } from "./contract.js";
import { readRole } from "./role.js";

export type ClassificationOutcome = "ACCEPTED" | "REJECTED" | "QUARANTINED";

export interface ClassificationInput {
  readonly title: string;
  /**
   * Libellé de contrat que la source donne à côté du titre. Lever le porte dans
   * `categories.commitment` : sur les dix alternances réelles relevées, les dix
   * y valent « Apprenticeship » ou « FR Apprentice ». C'est une seconde voix,
   * indépendante du titre.
   */
  readonly commitmentLabel?: string | null;
}

export interface JobClassification {
  readonly outcome: ClassificationOutcome;
  readonly contractType: JobContract | null;
  readonly roleCategory: JobRoleCategory | null;
  /** Confiance sur 100, comme `JobClassificationDecision.confidence`. */
  readonly confidence: number;
  /** Ce qui a été lu et ce qui en a été conclu. Jamais vide. */
  readonly reasons: readonly string[];
}

/*
 * Deux voix concordantes valent mieux qu'une. Le titre décide ; le libellé de
 * contrat de la source confirme, contredit, ou se tait.
 */
const BOTH_AGREE = 95;
const TITLE_ALONE = 80;
const LABEL_ALONE = 70;
const CONFLICT = 40;

/** Un métier nommé précisément inspire plus confiance qu'un « développeur » seul. */
const ROLE_NAMED = 90;
const ROLE_GENERIC = 70;

export const classifyJob = (input: ClassificationInput): JobClassification => {
  const reasons: string[] = [];

  const fromTitle = readContract(input.title);
  const label = input.commitmentLabel ?? "";
  const fromLabel = label.trim() === "" ? { contract: null, reason: null } : readContract(label);

  let contractType: JobContract | null = null;
  let contractConfidence = 0;
  let conflicted = false;

  if (fromTitle.contract !== null && fromLabel.contract === fromTitle.contract) {
    contractType = fromTitle.contract;
    contractConfidence = BOTH_AGREE;
    reasons.push(
      `Le titre dit « ${fromTitle.reason} » et la source annonce « ${label.trim()} » : les deux disent ${contractType}.`,
    );
  } else if (fromTitle.contract !== null && fromLabel.contract !== null) {
    // Deux contrats compatibles mais différents : « stage ou alternance ».
    conflicted = true;
    contractType = fromTitle.contract;
    contractConfidence = CONFLICT;
    reasons.push(
      `Le titre dit « ${fromTitle.reason} » mais la source annonce « ${label.trim()} » : les deux ne disent pas le même contrat.`,
    );
  } else if (fromTitle.contract !== null) {
    const contradiction = label.trim() === "" ? null : mentionsOutOfScopeContract(label);

    contractType = fromTitle.contract;
    if (contradiction !== null) {
      conflicted = true;
      contractConfidence = CONFLICT;
      reasons.push(
        `Le titre dit « ${fromTitle.reason} » mais la source annonce « ${label.trim()} », qui est hors périmètre.`,
      );
    } else {
      contractConfidence = TITLE_ALONE;
      reasons.push(`Le titre dit « ${fromTitle.reason} ».`);
    }
  } else if (fromLabel.contract !== null) {
    contractType = fromLabel.contract;
    contractConfidence = LABEL_ALONE;
    reasons.push(`Le titre ne dit pas le contrat ; la source annonce « ${label.trim()} ».`);
  }

  if (contractType === null) {
    const named = fromTitle.reason ?? fromLabel.reason;
    reasons.push(
      named === null
        ? "Aucun contrat du périmètre n'est nommé : ni alternance, ni stage."
        : `Le contrat lu est « ${named} », qui est hors périmètre.`,
    );

    return { outcome: "REJECTED", contractType: null, roleCategory: null, confidence: 0, reasons };
  }

  const role = readRole(input.title);
  if (role.role === null) {
    reasons.push(`Le titre « ${input.title.trim()} » ne nomme aucun métier du périmètre.`);
    return { outcome: "REJECTED", contractType, roleCategory: null, confidence: 0, reasons };
  }

  const roleConfidence = role.role === "OTHER_DEVELOPER" ? ROLE_GENERIC : ROLE_NAMED;
  reasons.push(
    role.role === "OTHER_DEVELOPER"
      ? `Le titre dit « ${role.reason} » sans dire quelle spécialité.`
      : `Le titre dit « ${role.reason} » : ${role.role}.`,
  );

  /*
   * La confiance de l'offre est celle de son maillon le plus faible. Une
   * certitude sur le métier ne rachète pas un doute sur le contrat.
   */
  const confidence = Math.min(contractConfidence, roleConfidence);

  if (conflicted) {
    // Le métier et le contrat sont connus : l'offre est stockable, donc la
    // quarantaine a un sens. C'est le doute qu'on met de côté, pas l'illisible.
    reasons.push("Mise en quarantaine : les signaux de contrat se contredisent.");
    return { outcome: "QUARANTINED", contractType, roleCategory: role.role, confidence, reasons };
  }

  return { outcome: "ACCEPTED", contractType, roleCategory: role.role, confidence, reasons };
};
