import { Module } from "@nestjs/common";

import { DocumentsModule } from "./documents/documents.module.js";
import { HealthModule } from "./health/health.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { LettersModule } from "./letters/letters.module.js";
import { MatchingModule } from "./matching/matching.module.js";
import { ProfileModule } from "./profile/profile.module.js";
import { ResumeModule } from "./resume/resume.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    JobsModule,
    ProfileModule,
    ResumeModule,
    MatchingModule,
    DocumentsModule,
    LettersModule,
  ],
})
export class AppModule {}
