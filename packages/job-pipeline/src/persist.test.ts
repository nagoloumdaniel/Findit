import { describe, expect, it, vi } from "vitest";

import type { IngestionDecision, JobDraft } from "./ingest.js";
import { persistDecision } from "./persist.js";

const NOW = new Date("2026-07-26T12:00:00.000Z");

const NATIVE = 100;
const BOARD = 40;

const draft = (over: Partial<JobDraft> = {}): JobDraft => ({
  title: "Alternance - Développeur Front-end React H/F",
  normalizedTitle: "developpeur front end react",
  roleCategory: "FRONTEND",
  contractType: "ALTERNANCE",
  workMode: "HYBRID",
  description: "Développer des interfaces React et TypeScript au sein de l'équipe produit.",
  responsibilities: [],
  requirements: [],
  benefits: [],
  city: "Paris",
  departmentCode: "75",
  publishedAt: NOW,
  expiresAt: new Date(NOW.getTime() + 72 * 3600 * 1000),
  canonicalUrl: "https://example.invalid/offre",
  applyUrl: null,
  externalId: "ext-1",
  companyName: "Orbit Studio",
  sourceName: "greenhouse",
  confidenceScore: 90,
  dataQualityScore: 90,
  schoolRiskScore: 0,
  schoolRiskReasons: [],
  status: "PUBLISHED",
  ...over,
});

const decision = (jobDraft: JobDraft): IngestionDecision =>
  ({ outcome: "PUBLISHED", stage: "ingestion", reasons: [], draft: jobDraft }) as never;

const context = (sourcePriority = NATIVE) => ({
  sourceUrl: "https://example.invalid/offre",
  checkedAt: NOW,
  correlationId: "test",
  sourcePriority,
});

/*
 * Ligne déjà en base, quasi identique à la candidate : même titre normalisé,
 * même entreprise, même département, deux heures d'écart. Source officielle par
 * défaut.
 */
const existingRow = {
  id: "job-existing",
  status: "PUBLISHED",
  canonicalUrl: "https://boards.greenhouse.io/orbit/jobs/1",
  applyUrl: null as string | null,
  sources: [{ priority: NATIVE }],
  city: "Paris",
  departmentCode: "75",
  publishedAt: new Date(NOW.getTime() - 2 * 3600 * 1000),
  description: "Développer des interfaces React et TypeScript au sein de l'équipe produit.",
  normalizedTitle: "developpeur front end react",
  duplicateGroupId: null as string | null,
  company: { normalizedName: "orbit studio" },
};

/** Même offre, vue d'abord sur un job board : source de rang faible. */
const boardRow = {
  ...existingRow,
  canonicalUrl: "https://www.welcometothejungle.com/fr/companies/orbit/jobs/dev",
  sources: [{ priority: BOARD }],
};

const loserSources = [
  {
    name: "greenhouse",
    url: "https://example.invalid/offre",
    priority: NATIVE,
    checkedAt: NOW,
  },
];

const createPrisma = (candidates: (typeof existingRow)[]) => ({
  company: { upsert: vi.fn().mockResolvedValue({ id: "company-1" }) },
  job: {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({ id: "job-new" }),
    findMany: vi.fn().mockResolvedValue(candidates),
    update: vi.fn().mockResolvedValue({}),
  },
  jobSource: {
    upsert: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue(loserSources),
  },
  processingLog: { create: vi.fn().mockResolvedValue({}) },
  duplicateGroup: {
    create: vi.fn().mockResolvedValue({ id: "group-1" }),
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
  },
  duplicateDecision: { create: vi.fn().mockResolvedValue({}) },
});

type Prisma = ReturnType<typeof createPrisma>;

const jobUpdates = (prisma: Prisma): Record<string, unknown>[] =>
  prisma.job.update.mock.calls.map((call) => call[0] as Record<string, unknown>);

const updateFor = (prisma: Prisma, id: string): Record<string, unknown>[] =>
  jobUpdates(prisma).filter((call) => (call["where"] as { id: string }).id === id);

describe("persistDecision - déduplication", () => {
  it("groups a created job with its near-identical twin and merges it", async () => {
    const prisma = createPrisma([existingRow]);

    const result = await persistDecision(prisma as never, decision(draft()), context());

    // Le groupe naît avec l'offre déjà en base pour canonique.
    expect(prisma.duplicateGroup.create).toHaveBeenCalledWith({
      data: { canonicalJobId: "job-existing" },
      select: { id: true },
    });
    // Les deux offres rejoignent le groupe ; la nouvelle est fusionnée.
    expect(updateFor(prisma, "job-new")[0]).toMatchObject({
      where: { id: "job-new" },
      data: { duplicateGroupId: "group-1", status: "DUPLICATE" },
    });
    const decisionArgs = prisma.duplicateDecision.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(decisionArgs.data["action"]).toBe("MERGED");
    expect(decisionArgs.data["decidedBy"]).toBe("RULE");
    expect(typeof decisionArgs.data["score"]).toBe("number");
    expect(result).toMatchObject({ kind: "created", status: "DUPLICATE" });
  });

  it("leaves a genuinely new job ungrouped", async () => {
    const distinct = {
      ...existingRow,
      company: { normalizedName: "autre entreprise" },
      description: "Poste totalement différent dans une autre équipe.",
    };
    const prisma = createPrisma([distinct]);

    const result = await persistDecision(prisma as never, decision(draft()), context());

    expect(prisma.duplicateGroup.create).not.toHaveBeenCalled();
    expect(prisma.duplicateDecision.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: "created", status: "PUBLISHED" });
  });

  it("does not re-run deduplication on a recollected job", async () => {
    const prisma = createPrisma([existingRow]);
    prisma.job.findUnique.mockResolvedValue({ id: "job-new" });

    const result = await persistDecision(prisma as never, decision(draft()), context());

    expect(prisma.job.findMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: "updated", status: "PUBLISHED" });
  });
});

describe("persistDecision - source canonique", () => {
  it("keeps the incumbent when the new offer has the same rank, and hands it the new source", async () => {
    const prisma = createPrisma([existingRow]);

    await persistDecision(prisma as never, decision(draft()), context(NATIVE));

    expect(prisma.duplicateGroup.update).not.toHaveBeenCalled();
    // Le perdant (l'offre nouvelle) donne ses sources au gagnant (l'ancienne).
    expect(prisma.jobSource.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { jobId: "job-new" } }),
    );
    expect(prisma.jobSource.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobId_url: { jobId: "job-existing", url: "https://example.invalid/offre" } },
      }),
    );
  });

  it("lets an official source take the place of a job-board offer seen first", async () => {
    const prisma = createPrisma([boardRow]);

    const result = await persistDecision(prisma as never, decision(draft()), context(NATIVE));

    // La nouvelle offre, officielle, reste publiée et devient la canonique.
    expect(result).toMatchObject({ kind: "created", status: "PUBLISHED" });
    expect(prisma.duplicateGroup.update).toHaveBeenCalledWith({
      where: { id: "group-1" },
      data: { canonicalJobId: "job-new" },
    });
    // L'offre du job board est masquée, pas supprimée, et la trace le dit.
    expect(updateFor(prisma, "job-existing")).toContainEqual({
      where: { id: "job-existing" },
      data: { status: "DUPLICATE" },
    });
    const logs = prisma.processingLog.create.mock.calls.map(
      (call) => (call[0] as { data: Record<string, unknown> }).data,
    );
    expect(logs).toContainEqual(
      expect.objectContaining({
        jobId: "job-existing",
        stage: "deduplication",
        toStatus: "DUPLICATE",
      }),
    );
    // Les sources du job board passent à l'offre officielle.
    expect(prisma.jobSource.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { jobId: "job-existing" } }),
    );
    const receivers = prisma.jobSource.upsert.mock.calls.map(
      (call) => (call[0] as { where: { jobId_url: { jobId: string } } }).where.jobId_url.jobId,
    );
    expect(receivers).toContain("job-new");
  });

  it("hides a job-board offer that arrives after the official one", async () => {
    const prisma = createPrisma([existingRow]);
    const board = draft({
      canonicalUrl: "https://www.welcometothejungle.com/fr/x",
      sourceName: "welcome-to-the-jungle",
    });

    const result = await persistDecision(prisma as never, decision(board), context(BOARD));

    expect(result).toMatchObject({ kind: "created", status: "DUPLICATE" });
    expect(prisma.duplicateGroup.update).not.toHaveBeenCalled();
  });

  it("never lets a quarantined offer take the place of a published one", async () => {
    const prisma = createPrisma([boardRow]);

    const result = await persistDecision(
      prisma as never,
      decision(draft({ status: "QUARANTINED" })),
      context(NATIVE),
    );

    expect(prisma.duplicateGroup.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "DUPLICATE" });
  });

  it("compares with the canonical of an existing group, not with the matched member", async () => {
    // L'offre appariée est déjà un membre fusionné ; sa canonique est une autre
    // offre de job board. L'élection se joue contre cette canonique.
    const member = {
      ...boardRow,
      id: "job-member",
      status: "DUPLICATE",
      duplicateGroupId: "group-9",
    };
    const prisma = createPrisma([member]);
    prisma.duplicateGroup.findUnique.mockResolvedValue({ canonicalJobId: "job-canonical" });
    prisma.job.findUnique
      .mockResolvedValueOnce(null) // l'offre nouvelle n'existe pas encore
      .mockResolvedValueOnce({
        id: "job-canonical",
        status: "PUBLISHED",
        canonicalUrl: "https://fr.indeed.com/viewjob?jk=1",
        applyUrl: null,
        sources: [{ priority: BOARD }],
      });

    const result = await persistDecision(prisma as never, decision(draft()), context(NATIVE));

    expect(result).toMatchObject({ status: "PUBLISHED" });
    expect(prisma.duplicateGroup.update).toHaveBeenCalledWith({
      where: { id: "group-9" },
      data: { canonicalJobId: "job-new" },
    });
    expect(updateFor(prisma, "job-canonical")).toContainEqual({
      where: { id: "job-canonical" },
      data: { status: "DUPLICATE" },
    });
  });
});

describe("persistDecision - lien de candidature", () => {
  const upsertData = (prisma: Prisma): Record<string, unknown> => {
    const args = prisma.job.upsert.mock.calls[0]?.[0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(args.update["applyUrl"]).toEqual(args.create["applyUrl"]);
    return args.create;
  };

  const BOARD_URL = "https://www.welcometothejungle.com/fr/companies/orbit/jobs/dev";
  const EMPLOYER_URL = "https://jobs.orbit.test/apply/42";

  it("stores the employer link a job board gives, since that is where one applies", async () => {
    const prisma = createPrisma([]);

    await persistDecision(
      prisma as never,
      decision(draft({ canonicalUrl: BOARD_URL, applyUrl: EMPLOYER_URL })),
      context(BOARD),
    );

    expect(upsertData(prisma)["applyUrl"]).toBe(EMPLOYER_URL);
  });

  it("stores nothing extra when the link is the offer page itself", async () => {
    const native = createPrisma([]);
    await persistDecision(native as never, decision(draft()), context(NATIVE));
    expect(upsertData(native)["applyUrl"]).toBeNull();

    const board = createPrisma([]);
    await persistDecision(
      board as never,
      decision(draft({ canonicalUrl: BOARD_URL, applyUrl: null })),
      context(BOARD),
    );
    expect(upsertData(board)["applyUrl"]).toBeNull();
  });

  it("does not let a recollection erase a link chosen earlier", async () => {
    const prisma = createPrisma([]);
    prisma.job.findUnique.mockResolvedValue({ id: "job-new", applyUrl: EMPLOYER_URL });

    await persistDecision(
      prisma as never,
      decision(draft({ canonicalUrl: BOARD_URL, applyUrl: null })),
      context(BOARD),
    );

    expect(upsertData(prisma)["applyUrl"]).toBe(EMPLOYER_URL);
  });

  it("gives the merged publication the employer link a second board brought", async () => {
    // WTTJ d'abord (sans lien), puis Indeed qui connaît la page de l'employeur :
    // la publication, qui reste sur WTTJ à rang égal, hérite du lien employeur.
    const prisma = createPrisma([boardRow]);

    await persistDecision(
      prisma as never,
      decision(
        draft({
          canonicalUrl: "https://fr.indeed.com/viewjob?jk=1",
          applyUrl: EMPLOYER_URL,
          sourceName: "indeed",
        }),
      ),
      context(BOARD),
    );

    expect(updateFor(prisma, "job-existing")).toContainEqual({
      where: { id: "job-existing" },
      data: { applyUrl: EMPLOYER_URL },
    });
  });
});
