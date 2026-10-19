import { computeCostMicroUsd, createDeepSeekModel } from "@findit/ai";
import { parseApiEnv } from "@findit/config";
import { type PrismaClient, JobStatus } from "@findit/database";
import {
  renderCoverLetterDocx,
  renderCoverLetterPdf,
  renderCvDocx,
  renderCvPdf,
} from "@findit/documents";
import type {
  CoverLetterDocumentData,
  CvDocumentData,
  CvRenderOptions,
  CvTemplate,
} from "@findit/documents";
import { canonicalizeSkill, detectSkillsInText } from "@findit/matching-engine";
import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { z } from "zod";

import { PRISMA_CLIENT } from "../prisma/prisma.module.js";
import { ProfileService } from "../profile/profile.service.js";
import type { ProfileView } from "../profile/profile.service.js";
import { scoreCvDocument } from "./document-scoring.js";
import type { ScoredJob } from "./document-scoring.js";

/** Ce que les appels de modèle de chaque document écrivent dans `ModelCall`. */
const CV_PURPOSE = "document-cv";
const LETTER_PURPOSE = "document-letter";

/** Corps attendu de `POST /api/documents/cv`. */
export type CvRequest = {
  jobSlug: string;
  template?: CvTemplate | undefined;
  showPhoto?: boolean | undefined;
  photoDataUrl?: string | null | undefined;
  accentColor?: string | undefined;
  format?: "pdf" | "docx" | undefined;
};

/** Corps attendu de `POST /api/documents/letter`. */
export type LetterRequest = {
  jobSlug: string;
  accentColor?: string | undefined;
  format?: "pdf" | "docx" | undefined;
};

/** Fichier rendu, prêt à être renvoyé en pièce jointe. */
export type DocumentFile = {
  buffer: Buffer;
  contentType: string;
  fileName: string;
};

/** La lettre cite des compétences que le profil ne contient pas. */
export class LetterInventsFactsError extends Error {
  override readonly name = "LetterInventsFactsError";

  constructor(readonly inventedSkills: string[]) {
    super(
      `La lettre générée cite des compétences absentes du profil : ${inventedSkills.join(
        ", ",
      )}. Sortie refusée.`,
    );
  }
}

/*
 * Sortie attendue du modèle pour la lettre. Les paragraphes forment le corps,
 * `warnings` signale les points fragiles : le garde-fou anti-invention opère
 * ensuite sur le texte lui-même, pas sur une déclaration du modèle.
 */
const generatedLetterSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  paragraphs: z.array(z.string().trim().min(1).max(4000)).min(1).max(6),
  warnings: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
});

type GeneratedLetter = z.infer<typeof generatedLetterSchema>;

/*
 * Consigne de la lettre : uniquement des faits du profil et de l'offre. Aucune
 * compétence, entreprise, date, diplôme ou niveau n'est inventé ; une
 * compétence ne se cite comme acquise que si elle figure dans le profil.
 */
const LETTER_SYSTEM = [
  "Tu rédiges une lettre de motivation en français, à la première personne, sobre et factuelle.",
  "Tu n'utilises que les faits présents dans le profil et dans l'offre fournis.",
  "N'invente aucune compétence, expérience, entreprise, date, diplôme ou niveau.",
  "Ne cite une compétence comme acquise que si elle figure dans les compétences du profil.",
  "N'écris ni formule d'adresse, ni formule de politesse, ni signature : le modèle de document les ajoute.",
  "Si un point est fragile ou manque, signale-le dans warnings au lieu de broder.",
].join(" ");

/** Vue minimale d'une offre, pour la construction et le scoring des documents. */
interface JobView {
  slug: string;
  title: string;
  normalizedTitle: string;
  roleCategory: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  city: string;
  companyName: string;
}

/** Forme une date du jour lisible en français, pour l'en-tête de la lettre. */
const frenchDate = (): string =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(),
  );

@Injectable()
export class DocumentsService {
  readonly #logger = new Logger(DocumentsService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(ProfileService) private readonly profile: ProfileService,
  ) {}

  /**
   * Rend un CV pour une offre, à partir des seuls faits réels du profil.
   *
   * Rien n'est inventé : une compétence absente reste absente, une expérience
   * sans dates n'en reçoit pas. Le résumé vient du titre du profil ; à défaut,
   * une génération IA courte et honnête, journalisée dans `ModelCall`.
   */
  async generateCv(request: CvRequest): Promise<DocumentFile> {
    const env = parseApiEnv(process.env);
    const profile = await this.profile.get();
    const job = await this.#findJob(request.jobSlug);

    const summary = await this.#buildSummary(profile, job, env);
    const data = this.#toCvData(profile, summary, this.#orderSkills(profile.skills, job));

    const options: CvRenderOptions = {
      ...(request.template !== undefined ? { template: request.template } : {}),
      ...(request.showPhoto !== undefined ? { showPhoto: request.showPhoto } : {}),
      ...(request.photoDataUrl !== undefined ? { photoDataUrl: request.photoDataUrl } : {}),
      ...(request.accentColor !== undefined ? { accentColor: request.accentColor } : {}),
    };
    const format = request.format ?? "pdf";
    const buffer =
      format === "docx" ? await renderCvDocx(data, options) : await renderCvPdf(data, options);

    return {
      buffer,
      contentType:
        format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf",
      fileName: `cv-${job.slug}.${format}`,
    };
  }

  /**
   * Score le CV du profil contre une offre, déterministe et explicable.
   *
   * Le POURQUOI : le score de document mesure la couverture des exigences de
   * l'offre par le CV généré, distinct du score du profil. Il ne fait aucun
   * appel IA : il évalue les faits réellement présents dans le CV (compétences,
   * expériences, projets, langues) contre l'offre, et rend le détail de chaque
   * point.
   */
  async scoreCv(jobSlug: string): Promise<ReturnType<typeof scoreCvDocument>> {
    const profile = await this.profile.get();
    const job = await this.#findJob(jobSlug);
    // Le résumé n'entre pas dans le score : seuls les faits structurés comptent.
    // L'ordre des compétences n'influe pas sur le score non plus.
    const data = this.#toCvData(profile, undefined, profile.skills);
    return scoreCvDocument(data, this.#toScoredJob(job));
  }

  /** Projette la vue d'offre vers la forme attendue par le moteur de scoring. */
  #toScoredJob(job: JobView): ScoredJob {
    return {
      title: job.title,
      normalizedTitle: job.normalizedTitle,
      roleCategory: job.roleCategory,
      requirements: job.requirements,
      responsibilities: job.responsibilities,
      description: job.description,
    };
  }

  /**
   * Génère et rend une lettre factuelle pour une offre, anti-invention : toute
   * compétence citée comme acquise doit exister dans le profil, sinon la sortie
   * est refusée. Le coût du modèle est journalisé dans `ModelCall`.
   */
  async generateLetter(request: LetterRequest): Promise<DocumentFile> {
    const env = parseApiEnv(process.env);
    const profile = await this.profile.get();
    const job = await this.#findJob(request.jobSlug);

    const model = createDeepSeekModel({ apiKey: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_MODEL });
    const usageBefore = model.usage();

    try {
      let letter = await model.generateStructured<GeneratedLetter>({
        schema: generatedLetterSchema,
        system: LETTER_SYSTEM,
        prompt: this.#letterPrompt(profile, job),
        temperature: 0.3,
      });

      /*
       * Relance ciblée : si le garde-fou écarte une compétence inventée, on
       * redemande une lettre en interdisant explicitement ces compétences, au
       * lieu de rendre un échec. Borné à une relance : le modèle ne tourne pas
       * en boucle, et le second refus rend l'erreur.
       */
      try {
        this.#rejectInventedSkills(letter, profile);
      } catch (error) {
        if (!(error instanceof LetterInventsFactsError)) {
          throw error;
        }
        letter = await model.generateStructured<GeneratedLetter>({
          schema: generatedLetterSchema,
          system: `${LETTER_SYSTEM} Ne cite en aucun cas ces compétences : ${error.inventedSkills.join(", ")}.`,
          prompt: this.#letterPrompt(profile, job),
          temperature: 0.3,
        });
        this.#rejectInventedSkills(letter, profile);
      }

      const format = request.format ?? "pdf";
      const data = this.#toLetterData(profile, job, letter);
      const accent =
        request.accentColor === undefined ? undefined : { accentColor: request.accentColor };
      const buffer =
        format === "docx"
          ? await renderCoverLetterDocx(data, accent)
          : await renderCoverLetterPdf(data, accent);

      return {
        buffer,
        contentType:
          format === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/pdf",
        fileName: `lettre-${job.slug}.${format}`,
      };
    } finally {
      await this.#recordModelCall(model, usageBefore, env, LETTER_PURPOSE);
    }
  }

  /** Lit une offre publiée par son slug, ou lève 404. */
  async #findJob(slug: string): Promise<JobView> {
    const job = await this.prisma.job.findFirst({
      where: { slug, status: JobStatus.PUBLISHED },
      select: {
        slug: true,
        title: true,
        normalizedTitle: true,
        roleCategory: true,
        description: true,
        requirements: true,
        responsibilities: true,
        city: true,
        company: { select: { name: true } },
      },
    });

    if (job === null) {
      throw new NotFoundException("Cette offre n'existe pas ou n'est plus publiée.");
    }

    return {
      slug: job.slug,
      title: job.title,
      normalizedTitle: job.normalizedTitle,
      roleCategory: job.roleCategory,
      description: job.description,
      requirements: job.requirements,
      responsibilities: job.responsibilities,
      city: job.city,
      companyName: job.company.name,
    };
  }

  /**
   * Résumé du CV : le titre du profil s'il existe, sinon une génération IA
   * courte et honnête. Un appel IA qui échoue retombe sur l'absence de résumé
   * plutôt que sur une invention.
   */
  async #buildSummary(
    profile: ProfileView,
    job: JobView,
    env: ReturnType<typeof parseApiEnv>,
  ): Promise<string | undefined> {
    if (profile.headline !== null && profile.headline.trim() !== "") {
      return profile.headline;
    }

    try {
      const model = createDeepSeekModel({
        apiKey: env.DEEPSEEK_API_KEY,
        model: env.DEEPSEEK_MODEL,
      });
      const usageBefore = model.usage();
      try {
        const text = await model.generateText({
          system:
            "Rédige un résumé de CV de deux ou trois phrases, en français. " +
            "N'affirme que des faits présents dans le profil fourni : aucune compétence, " +
            "entreprise, école ou date ne doit être ajoutée.",
          prompt: this.#summaryPrompt(profile, job),
          temperature: 0.3,
        });
        const cleaned = text.trim();
        return cleaned === "" ? undefined : cleaned;
      } finally {
        await this.#recordModelCall(model, usageBefore, env, CV_PURPOSE);
      }
    } catch (error) {
      this.#logger.warn(
        `Résumé du CV non généré : ${error instanceof Error ? error.message : "inconnu"}.`,
      );
      return undefined;
    }
  }

  /** Compacte les faits du profil utiles au résumé : rien d'autre n'est cité. */
  #summaryPrompt(profile: ProfileView, job: JobView): string {
    const facts = {
      titre: profile.headline,
      competences: profile.skills,
      experiences: profile.experiences.map((e) => ({ titre: e.title, entreprise: e.company })),
      formation: profile.education.map((e) => ({ ecole: e.school, diplome: e.degree })),
    };
    return [
      "Résume ce profil pour cette offre.",
      "Profil (seule source de faits sur le candidat) :",
      JSON.stringify(facts),
      "Offre visée :",
      JSON.stringify({ titre: job.title, entreprise: job.companyName, ville: job.city }),
    ].join("\n");
  }

  /** Compacte les faits du profil et l'offre pour la rédaction de la lettre. */
  #letterPrompt(profile: ProfileView, job: JobView): string {
    const facts = {
      identite: {
        nom: profile.fullName,
        titre: profile.headline,
        ville: profile.city,
      },
      competences: profile.skills,
      experiences: profile.experiences.map((e) => ({
        titre: e.title,
        entreprise: e.company,
        description: e.description,
      })),
      projets: profile.projects.map((p) => ({
        nom: p.name,
        description: p.description,
        competences: p.skills,
      })),
      formation: profile.education.map((e) => ({
        ecole: e.school,
        diplome: e.degree,
        domaine: e.field,
      })),
      langues: profile.languages,
    };
    return [
      "Rédige la lettre pour cette candidature.",
      "Profil (seule source de faits sur le candidat) :",
      JSON.stringify(facts),
      "Offre visée :",
      JSON.stringify({
        titre: job.title,
        entreprise: job.companyName,
        ville: job.city,
        exigences: job.requirements,
        missions: job.responsibilities,
        description: job.description.slice(0, 3000),
      }),
    ].join("\n");
  }

  /**
   * Garde-fou anti-invention : toute technologie du dictionnaire citée dans la
   * lettre doit exister dans les compétences du profil ou d'un de ses projets.
   * Le même dictionnaire sert au score de correspondance, la règle est donc
   * identique partout et explicable. Une seule compétence inconnue refuse toute
   * la sortie.
   */
  #rejectInventedSkills(letter: GeneratedLetter, profile: ProfileView): void {
    const knownIds = new Set(
      [...profile.skills, ...profile.projects.flatMap((project) => project.skills)]
        .map((name) => canonicalizeSkill(name))
        .filter((entry) => entry !== null)
        .map((entry) => entry.id),
    );
    const invented = detectSkillsInText([letter.subject, ...letter.paragraphs].join("\n"))
      .filter((entry) => !knownIds.has(entry.id))
      .map((entry) => entry.label);
    if (invented.length > 0) {
      throw new LetterInventsFactsError(invented);
    }
  }

  /**
   * Réordonne les compétences du profil pour mettre en tête celles que l'offre
   * nomme réellement, sans rien ajouter ni retirer.
   *
   * Le POURQUOI : un CV adapté présente d'abord ce qui correspond à l'offre.
   * Le réordonnancement est déterministe (même dictionnaire que le score) : il
   * ne coûte rien, ne peut pas inventer, et garde l'ordre d'origine pour les
   * compétences non concernées.
   */
  #orderSkills(skills: string[], job: JobView): string[] {
    if (skills.length === 0) {
      return [];
    }
    const offerText = [
      job.title,
      ...job.requirements,
      ...job.responsibilities,
      job.description,
    ].join("\n");
    const offerIds = new Set(detectSkillsInText(offerText).map((entry) => entry.id));
    const relevant = (skill: string): boolean => {
      const entry = canonicalizeSkill(skill);
      return entry !== null && offerIds.has(entry.id);
    };
    return [...skills.filter(relevant), ...skills.filter((skill) => !relevant(skill))];
  }

  /**
   * Construit les données du CV depuis les faits réels du profil. Les périodes
   * libres des expériences sont recopiées telles quelles, jamais découpées en
   * dates qui n'ont pas été saisies.
   */
  #toCvData(
    profile: ProfileView,
    summary: string | undefined,
    orderedSkills: string[],
  ): CvDocumentData {
    return {
      identity: {
        fullName: profile.fullName === "" ? undefined : profile.fullName,
        email: profile.email ?? undefined,
        phone: profile.phone ?? undefined,
        location: profile.city ?? undefined,
        title: profile.headline ?? undefined,
      },
      summary,
      experiences: profile.experiences.map((experience) => ({
        title: experience.title,
        company: experience.company,
        startDate: experience.period === "" ? undefined : experience.period,
        description: experience.description === "" ? undefined : experience.description,
        achievements: [],
        skills: [],
      })),
      projects: profile.projects.map((project) => ({
        name: project.name,
        description:
          [project.role, project.description]
            .filter((value) => value !== undefined && value.trim() !== "")
            .join(" - ") || undefined,
        url: project.url,
        skills: [...project.skills],
      })),
      education: profile.education.map((education) => ({
        school: education.school,
        degree: education.degree,
        field: education.field,
        startDate: education.startDate,
        endDate: education.endDate,
        description: education.description,
      })),
      skills: orderedSkills.map((skill) => ({ name: skill })),
      languages: profile.languages.map((language) => ({
        name: language.name,
        level: language.level,
      })),
      certifications: profile.certifications.map((certification) => ({
        name: certification.name,
        issuer: certification.issuer,
        date: certification.date,
      })),
      links: profile.links.map((link) => ({ label: link.label, url: link.url })),
    };
  }

  /** Construit les données de la lettre : les formules d'usage sont au modèle. */
  #toLetterData(
    profile: ProfileView,
    job: JobView,
    letter: GeneratedLetter,
  ): CoverLetterDocumentData {
    const city = profile.city === null || profile.city === "" ? undefined : profile.city;
    return {
      senderName: profile.fullName === "" ? undefined : profile.fullName,
      senderContact: [profile.email, profile.phone, profile.city].filter(
        (value): value is string => value !== null && value !== "",
      ),
      companyName: job.companyName,
      jobTitle: job.title,
      cityAndDate: city === undefined ? `Le ${frenchDate()}` : `${city}, le ${frenchDate()}`,
      subject: letter.subject,
      paragraphs: letter.paragraphs,
    };
  }

  /**
   * Écrit une ligne `ModelCall` pour ce que la requête a consommé. Un échec
   * d'écriture est journalisé mais ne fait pas échouer la requête.
   */
  async #recordModelCall(
    model: ReturnType<typeof createDeepSeekModel>,
    before: ReturnType<ReturnType<typeof createDeepSeekModel>["usage"]>,
    env: ReturnType<typeof parseApiEnv>,
    purpose: string,
  ): Promise<void> {
    const usage = model.usage();
    const inputTokens = Math.max(0, usage.inputTokens - before.inputTokens);
    const outputTokens = Math.max(0, usage.outputTokens - before.outputTokens);

    try {
      await this.prisma.modelCall.create({
        data: {
          purpose,
          model: env.DEEPSEEK_MODEL,
          inputTokens,
          outputTokens,
          costMicroUsd: computeCostMicroUsd(
            { inputTokens, outputTokens, calls: Math.max(0, usage.calls - before.calls) },
            {
              inputUsdPerMillionTokens: env.DEEPSEEK_INPUT_USD_PER_MTOK ?? 0,
              outputUsdPerMillionTokens: env.DEEPSEEK_OUTPUT_USD_PER_MTOK ?? 0,
            },
          ),
        },
      });
    } catch (error) {
      this.#logger.error(
        `Coût du document non journalisé : ${error instanceof Error ? error.message : "inconnu"}`,
      );
    }
  }
}
