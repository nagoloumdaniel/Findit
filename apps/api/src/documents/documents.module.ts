import { parseApiEnv } from "@findit/config";
import { Module } from "@nestjs/common";

import { WORKSPACE_SECRET, WorkspaceGuard } from "../workspace/workspace.guard.js";
import { DocumentsController } from "./documents.controller.js";
import { DOCUMENTS_CLOCK, DocumentsService } from "./documents.service.js";

@Module({
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    WorkspaceGuard,
    { provide: WORKSPACE_SECRET, useFactory: () => parseApiEnv(process.env).INTERNAL_API_KEY },
    { provide: DOCUMENTS_CLOCK, useValue: () => new Date() },
  ],
})
export class DocumentsModule {}
