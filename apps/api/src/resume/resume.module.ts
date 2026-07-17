import { parseApiEnv } from "@findit/config";
import { Module } from "@nestjs/common";

import { WORKSPACE_SECRET, WorkspaceGuard } from "../workspace/workspace.guard.js";
import { ResumeController } from "./resume.controller.js";
import { ResumeService } from "./resume.service.js";

@Module({
  controllers: [ResumeController],
  providers: [
    ResumeService,
    WorkspaceGuard,
    { provide: WORKSPACE_SECRET, useFactory: () => parseApiEnv(process.env).INTERNAL_API_KEY },
  ],
})
export class ResumeModule {}
