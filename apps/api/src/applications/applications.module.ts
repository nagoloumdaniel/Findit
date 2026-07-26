import { parseApiEnv } from "@findit/config";
import { Module } from "@nestjs/common";

import { WORKSPACE_SECRET, WorkspaceGuard } from "../workspace/workspace.guard.js";
import { ApplicationsController } from "./applications.controller.js";
import { APPLICATIONS_CLOCK, ApplicationsService } from "./applications.service.js";

@Module({
  controllers: [ApplicationsController],
  providers: [
    ApplicationsService,
    WorkspaceGuard,
    { provide: WORKSPACE_SECRET, useFactory: () => parseApiEnv(process.env).INTERNAL_API_KEY },
    { provide: APPLICATIONS_CLOCK, useValue: () => new Date() },
  ],
})
export class ApplicationsModule {}
