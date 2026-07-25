import { parseApiEnv } from "@findit/config";
import { Module } from "@nestjs/common";

import { WORKSPACE_SECRET, WorkspaceGuard } from "../workspace/workspace.guard.js";
import { MatchingController } from "./matching.controller.js";
import { MATCHING_CLOCK, MatchingService } from "./matching.service.js";

@Module({
  controllers: [MatchingController],
  providers: [
    MatchingService,
    WorkspaceGuard,
    { provide: WORKSPACE_SECRET, useFactory: () => parseApiEnv(process.env).INTERNAL_API_KEY },
    { provide: MATCHING_CLOCK, useValue: () => new Date() },
  ],
})
export class MatchingModule {}
