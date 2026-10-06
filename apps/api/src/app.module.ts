import { Module } from "@nestjs/common";

import { AgentModule } from "./agent/agent.module.js";
import { HealthModule } from "./health/health.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";

@Module({
  imports: [PrismaModule, HealthModule, JobsModule, AgentModule],
})
export class AppModule {}
