import { type PrismaClient, JobStatus } from "@findit/database";
import { Inject, Injectable } from "@nestjs/common";

import { PRISMA_CLIENT } from "../prisma/prisma.module.js";

const runSelect = {
  id: true,
  objective: true,
  status: true,
  searches: true,
  pages: true,
  extracted: true,
  validated: true,
  duplicates: true,
  inserted: true,
  errors: true,
  costMicroUsd: true,
  startedAt: true,
  endedAt: true,
} as const;

export type AgentRunSummary = {
  id: string;
  objective: string;
  status: string;
  searches: number;
  pages: number;
  extracted: number;
  validated: number;
  duplicates: number;
  inserted: number;
  errors: number;
  costMicroUsd: number;
  startedAt: Date;
  endedAt: Date | null;
};

export type AgentActionItem = {
  kind: string;
  detail: string | null;
  costMicroUsd: number;
  createdAt: Date;
};

export type AgentErrorItem = {
  kind: string;
  message: string;
  retried: boolean;
  createdAt: Date;
};

export type AgentRunDetail = AgentRunSummary & {
  actions: AgentActionItem[];
  errorLogs: AgentErrorItem[];
};

export type AgentStats = {
  lastRun: AgentRunSummary | null;
  sourceCount: number;
  pageCount: number;
  publishedJobCount: number;
};

export type SourceItem = {
  id: string;
  name: string;
  url: string;
  type: string;
  schedule: string;
  maxDepth: number;
  maxPages: number;
  priority: number;
  enabled: boolean;
  lastCrawlAt: Date | null;
};

@Injectable()
export class AgentService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  listRuns(): Promise<AgentRunSummary[]> {
    return this.prisma.agentRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
      select: runSelect,
    });
  }

  runDetail(id: string): Promise<AgentRunDetail | null> {
    return this.prisma.agentRun.findUnique({
      where: { id },
      select: {
        ...runSelect,
        actions: {
          orderBy: { createdAt: "asc" },
          select: { kind: true, detail: true, costMicroUsd: true, createdAt: true },
        },
        errorLogs: {
          orderBy: { createdAt: "asc" },
          select: { kind: true, message: true, retried: true, createdAt: true },
        },
      },
    });
  }

  listSources(): Promise<SourceItem[]> {
    return this.prisma.source.findMany({
      orderBy: [{ enabled: "desc" }, { priority: "desc" }],
      select: {
        id: true,
        name: true,
        url: true,
        type: true,
        schedule: true,
        maxDepth: true,
        maxPages: true,
        priority: true,
        enabled: true,
        lastCrawlAt: true,
      },
    });
  }

  async stats(): Promise<AgentStats> {
    const [lastRun, sourceCount, pageCount, publishedJobCount] = await Promise.all([
      this.prisma.agentRun.findFirst({ orderBy: { startedAt: "desc" }, select: runSelect }),
      this.prisma.source.count(),
      this.prisma.crawlPage.count(),
      this.prisma.job.count({ where: { status: JobStatus.PUBLISHED } }),
    ]);

    return { lastRun, sourceCount, pageCount, publishedJobCount };
  }
}
