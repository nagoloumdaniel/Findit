import { createOllamaModel } from "@findit/ai";
import { parseApiEnv } from "@findit/config";
import { Module } from "@nestjs/common";

import { WORKSPACE_SECRET, WorkspaceGuard } from "../workspace/workspace.guard.js";
import { ResumeController } from "./resume.controller.js";
import {
  RESUME_AI_MODEL,
  RESUME_CLOCK,
  RESUME_RETENTION_HOURS,
  ResumeService,
} from "./resume.service.js";

@Module({
  controllers: [ResumeController],
  providers: [
    ResumeService,
    WorkspaceGuard,
    { provide: WORKSPACE_SECRET, useFactory: () => parseApiEnv(process.env).INTERNAL_API_KEY },
    {
      provide: RESUME_AI_MODEL,
      useFactory: () => {
        const env = parseApiEnv(process.env);
        if (env.AI_PROVIDER === "disabled") {
          return null;
        }
        return createOllamaModel({ baseUrl: env.OLLAMA_BASE_URL, model: env.AI_MODEL_EXTRACTION });
      },
    },
    { provide: RESUME_CLOCK, useValue: () => new Date() },
    {
      provide: RESUME_RETENTION_HOURS,
      useFactory: () => parseApiEnv(process.env).RESUME_RETENTION_HOURS,
    },
  ],
})
export class ResumeModule {}
