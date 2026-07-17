import { Module } from "@nestjs/common";

import { HealthModule } from "./health/health.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { ProfileModule } from "./profile/profile.module.js";
import { ResumeModule } from "./resume/resume.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";

@Module({ imports: [PrismaModule, HealthModule, JobsModule, ProfileModule, ResumeModule] })
export class AppModule {}
