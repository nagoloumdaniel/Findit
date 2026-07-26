import { describe, expect, it, vi } from "vitest";

import type { GeneratedLetter } from "./letters-input.js";
import {
  LetterInventsFactsError,
  LettersService,
  ResumeNotStructuredForLetterError,
  type LettersAiModel,
} from "./letters.service.js";

const now = new Date("2026-07-26T10:00:00.000Z");
const generatedAt = new Date("2026-07-26T10:00:05.000Z");

const structuredFacts = {
  identity: { fullName: "Lucas Bernard", title: "Développeur front-end junior", location: "Paris" },
  education: [{ school: "Lycée Turgot", degree: "BTS SIO" }],
  experiences: [
    {
      title: "Développeur front-end (stage)",
      company: "WebAgence",
      description: "Interfaces React avec TypeScript.",
      achievements: [],
      skills: ["React", "TypeScript"],
    },
  ],
  projects: [],
  skills: [{ name: "JavaScript" }, { name: "TypeScript" }, { name: "React" }],
  languages: [{ name: "Français" }],
  certifications: [],
  links: [],
};

const resumeRow = {
  id: "3f1d3f44-0000-7000-8000-000000000001",
  structuredFacts,
  expiresAt: new Date("2026-07-27T10:00:00.000Z"),
};

const jobRow = {
  id: "job-1",
  slug: "alternance-developpeur-front-end-react-paris",
  title: "Alternance Développeur Front-end React",
  city: "Paris",
  requirements: ["React et TypeScript."],
  responsibilities: ["Développer des interfaces."],
  description: "Stack React.",
  company: { name: "Orbit Studio" },
};

const letterOutput: GeneratedLetter = {
  subject: "Candidature à l'alternance Développeur Front-end React",
  paragraphs: [
    "Actuellement en BTS SIO au Lycée Turgot, je prépare une alternance en développement web et votre offre correspond à mon parcours.",
    "Lors de mon stage chez WebAgence, j'ai développé des interfaces React avec TypeScript, ce qui rejoint directement votre stack.",
  ],
  usedFacts: ["BTS SIO", "stage WebAgence", "React", "TypeScript"],
  warnings: [],
  learningNotes: [],
};

const storedRow = (over: Record<string, unknown> = {}) => ({
  id: "letter-1",
  sourceResumeId: resumeRow.id,
  jobId: jobRow.id,
  subject: letterOutput.subject,
  paragraphs: letterOutput.paragraphs,
  usedFacts: letterOutput.usedFacts,
  warnings: letterOutput.warnings,
  computedBy: "AI",
  createdAt: generatedAt,
  updatedAt: generatedAt,
  ...over,
});

const createPrisma = () => ({
  sourceResume: {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    findFirst: vi.fn().mockResolvedValue(resumeRow),
  },
  job: {
    findFirst: vi.fn().mockResolvedValue(jobRow),
  },
  sourceCoverLetter: {
    upsert: vi.fn().mockResolvedValue(storedRow()),
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
  },
});

const modelWith = (output: GeneratedLetter): LettersAiModel => ({
  generateStructured: vi.fn().mockResolvedValue(output),
});

describe("LettersService.generate", () => {
  it("stores the letter once verified, computed by AI, one per resume/job pair", async () => {
    const prisma = createPrisma();
    const model = modelWith(letterOutput);
    const service = new LettersService(prisma as never, model, () => now);

    const view = await service.generate(resumeRow.id, jobRow.slug);

    const request = vi.mocked(model.generateStructured).mock.calls[0]?.[0];
    expect(request).toBeDefined();
    if (request === undefined) {
      throw new Error("generateStructured was not called.");
    }
    // Le prompt ne contient que des faits : CV structuré et offre.
    expect(request.prompt).toContain("WebAgence");
    expect(request.prompt).toContain("Orbit Studio");
    expect(request.system).toContain("N'invente");

    const args = prisma.sourceCoverLetter.upsert.mock.calls[0]?.[0] as
      { create: Record<string, unknown> } | undefined;
    expect(args?.create["computedBy"]).toBe("AI");
    expect(view).toMatchObject({
      job: { slug: jobRow.slug, companyName: "Orbit Studio" },
      subject: letterOutput.subject,
      generatedAt,
    });
  });

  it("refuses a letter citing a skill absent from the resume, and stores nothing", async () => {
    const prisma = createPrisma();
    const inventive = {
      ...letterOutput,
      paragraphs: [
        letterOutput.paragraphs[0] ?? "",
        "Je maîtrise également Docker et Kubernetes au quotidien, ce qui accélérera vos déploiements.",
      ],
    };
    const service = new LettersService(prisma as never, modelWith(inventive), () => now);

    await expect(service.generate(resumeRow.id, jobRow.slug)).rejects.toBeInstanceOf(
      LetterInventsFactsError,
    );
    await expect(service.generate(resumeRow.id, jobRow.slug)).rejects.toThrow(/Docker/);
    expect(prisma.sourceCoverLetter.upsert).not.toHaveBeenCalled();
  });

  it("refuses to write from an unstructured resume", async () => {
    const prisma = createPrisma();
    prisma.sourceResume.findFirst.mockResolvedValue({ ...resumeRow, structuredFacts: null });
    const service = new LettersService(prisma as never, modelWith(letterOutput), () => now);

    await expect(service.generate(resumeRow.id, jobRow.slug)).rejects.toBeInstanceOf(
      ResumeNotStructuredForLetterError,
    );
  });

  it("fails explicitly when local AI is disabled", async () => {
    const prisma = createPrisma();
    const service = new LettersService(prisma as never, null, () => now);

    await expect(service.generate(resumeRow.id, jobRow.slug)).rejects.toMatchObject({
      name: "AiDisabledError",
    });
  });

  it("returns typed failures for a dead resume or an unpublished job", async () => {
    const prisma = createPrisma();
    prisma.sourceResume.findFirst.mockResolvedValue(null);
    const service = new LettersService(prisma as never, modelWith(letterOutput), () => now);
    await expect(service.generate(resumeRow.id, jobRow.slug)).resolves.toBe("resume_not_found");

    const second = createPrisma();
    second.job.findFirst.mockResolvedValue(null);
    const other = new LettersService(second as never, modelWith(letterOutput), () => now);
    await expect(other.generate(resumeRow.id, "offre-disparue")).resolves.toBe("job_not_found");
  });
});

describe("LettersService.renderPdf", () => {
  it("renders the stored letter as a real PDF named after the job", async () => {
    const prisma = createPrisma();
    prisma.sourceCoverLetter.findFirst.mockResolvedValue(
      storedRow({
        job: { slug: jobRow.slug, title: jobRow.title, company: { name: "Orbit Studio" } },
      }),
    );
    const service = new LettersService(prisma as never, null, () => now);

    const result = await service.renderPdf(resumeRow.id, jobRow.slug);

    expect(result).not.toBeNull();
    if (result === null) {
      throw new Error("renderPdf returned null.");
    }
    expect(result.pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(result.fileName).toBe(`lettre-${jobRow.slug}.pdf`);
  });

  it("returns null when no letter exists for the pair", async () => {
    const prisma = createPrisma();
    const service = new LettersService(prisma as never, null, () => now);

    await expect(service.renderPdf(resumeRow.id, jobRow.slug)).resolves.toBeNull();
  });
});
