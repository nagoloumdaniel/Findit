import { parseApiEnv } from "@findit/config";
import { Module } from "@nestjs/common";

import { PROFILE_INTERNAL_KEY, ProfileKeyGuard } from "../profile/profile.controller.js";
import { MatchingController } from "./matching.controller.js";
import { MatchingService } from "./matching.service.js";

@Module({
  controllers: [MatchingController],
  providers: [
    MatchingService,
    // Le garde et sa clé sont réutilisés ici pour protéger `GET /rank`, qui
    // lit le profil : le score dépend de données personnelles.
    ProfileKeyGuard,
    {
      provide: PROFILE_INTERNAL_KEY,
      useFactory: (): string => parseApiEnv(process.env).INTERNAL_API_KEY,
    },
  ],
})
export class MatchingModule {}
