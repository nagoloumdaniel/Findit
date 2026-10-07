import { Module } from "@nestjs/common";

import { AgentModule } from "./agent/agent.module.js";
import { HealthModule } from "./health/health.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { MatchingModule } from "./matching/matching.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { ProfileModule } from "./profile/profile.module.js";

@Module({
  imports: [PrismaModule, HealthModule, JobsModule, AgentModule, MatchingModule, ProfileModule],
})
export class AppModule {}
