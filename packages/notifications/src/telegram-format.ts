/**
 * Ce dont l'affichage d'une offre a besoin dans une alerte. Volontairement
 * étroit : une notification annonce, elle ne détaille pas. Le lien pointe la
 * source officielle, jamais un agrégateur.
 */
export interface NotifiableJob {
  readonly title: string;
  readonly companyName: string;
  readonly city: string;
  readonly roleLabel: string;
  readonly contractLabel: string;
  readonly technologies: readonly string[];
  /** Ancienneté lisible, déjà formatée : « il y a 3 h ». */
  readonly ageLabel: string;
  /** URL de la source officielle. */
  readonly url: string;
  /** URL de la fiche sur le site Findit. */
  readonly detailUrl: string;
}

export interface TelegramMessage {
  readonly text: string;
  readonly replyMarkup: {
    readonly inline_keyboard: ReadonlyArray<
      ReadonlyArray<{ readonly text: string; readonly url: string }>
    >;
  };
}

/**
 * Échappe les caractères que le mode HTML de Telegram interprète. Sans cela, un
 * « & » ou un « < » dans un titre casserait le message. C'est du contenu de
 * source : on ne lui fait pas confiance pour être sûr.
 */
const escapeHtml = (text: string): string =>
  text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

const jobBlock = (job: NotifiableJob): string => {
  const lines = [
    `💼 <b>${escapeHtml(job.title)}</b>`,
    `🏢 ${escapeHtml(job.companyName)}`,
    `📍 ${escapeHtml(job.city)}`,
    `🧩 ${escapeHtml(job.roleLabel)} · ${escapeHtml(job.contractLabel)}`,
    `🕒 ${escapeHtml(job.ageLabel)}`,
  ];

  if (job.technologies.length > 0) {
    lines.push(`🛠 ${escapeHtml(job.technologies.slice(0, 6).join(", "))}`);
  }

  lines.push(`🔗 <a href="${escapeHtml(job.url)}">Voir l'offre</a>`);
  return lines.join("\n");
};

/**
 * Compose le message d'alerte de nouvelles offres.
 *
 * `now` est passé plutôt que lu, pour que le rendu reste reproductible. Le
 * nombre d'offres du message est celui réellement inclus, jamais un total
 * gonflé : le message ne ment pas sur son contenu.
 */
export const formatNewJobsMessage = (
  jobs: readonly NotifiableJob[],
  now: Date,
): TelegramMessage => {
  const count = jobs.length;
  const header = [
    "🚀 <b>Nouvelles alternances détectées</b>",
    "",
    `${String(count)} nouvelle${count > 1 ? "s" : ""} offre${count > 1 ? "s" : ""}`,
    `Mise à jour : ${now.toISOString()}`,
  ].join("\n");

  const body = jobs.map(jobBlock).join("\n\n");

  // Un seul bouton « Analyser sur le site » quand l'alerte porte plusieurs
  // offres : le détail de chacune est déjà dans le message.
  const detailUrl = jobs[0]?.detailUrl ?? "";
  const inline_keyboard =
    detailUrl === "" ? [] : [[{ text: "Analyser sur le site", url: detailUrl }]];

  return { text: `${header}\n\n${body}`, replyMarkup: { inline_keyboard } };
};
