import { parseApiEnv } from "@findit/config";
import { Module } from "@nestjs/common";

import { WORKSPACE_SECRET, WorkspaceGuard } from "../workspace/workspace.guard.js";
import { ProfileController } from "./profile.controller.js";
import { ProfileService } from "./profile.service.js";

@Module({
  controllers: [ProfileController],
  providers: [
    ProfileService,
    WorkspaceGuard,
    {
      // Le secret de l'espace privé est la clé interne : une seule clé serveur,
      // pas deux à tenir. Lue une fois, au câblage du module.
      provide: WORKSPACE_SECRET,
      useFactory: () => parseApiEnv(process.env).INTERNAL_API_KEY,
    },
  ],
})
export class ProfileModule {}
