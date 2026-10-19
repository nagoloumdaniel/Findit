import { Module } from "@nestjs/common";

import { AgentModule } from "./agent/agent.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { DocumentsModule } from "./documents/documents.module.js";
import { FavoritesModule } from "./favorites/favorites.module.js";
import { HealthModule } from "./health/health.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { MatchingModule } from "./matching/matching.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { ProfileModule } from "./profile/profile.module.js";
import { ResumeModule } from "./resume/resume.module.js";

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    JobsModule,
    AgentModule,
    MatchingModule,
    ProfileModule,
    ResumeModule,
    DocumentsModule,
    FavoritesModule,
    AuthModule,
  ],
})
export class AppModule {}
