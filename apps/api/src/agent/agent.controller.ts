import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";

import { AgentService } from "./agent.service.js";
import type {
  AgentAnalytics,
  AgentRunDetail,
  AgentRunSummary,
  AgentStats,
  SourceItem,
} from "./agent.service.js";

@Controller("api/agent")
export class AgentController {
  /*
   * La dépendance est nommée explicitement (voir `jobs.controller.ts`) : sans
   * `emitDecoratorMetadata` en développement, Nest n'a rien à injecter sinon.
   */
  constructor(@Inject(AgentService) private readonly agent: AgentService) {}

  @Get("runs")
  runs(): Promise<AgentRunSummary[]> {
    return this.agent.listRuns();
  }

  @Get("stats")
  stats(): Promise<AgentStats> {
    return this.agent.stats();
  }

  @Get("analytics")
  analytics(): Promise<AgentAnalytics> {
    return this.agent.analytics();
  }

  @Get("sources")
  sources(): Promise<SourceItem[]> {
    return this.agent.listSources();
  }

  @Get("runs/:id")
  async run(@Param("id") id: string): Promise<AgentRunDetail> {
    const detail = await this.agent.runDetail(id);

    if (detail === null) {
      throw new NotFoundException("Ce run n'existe pas.");
    }

    return detail;
  }
}
