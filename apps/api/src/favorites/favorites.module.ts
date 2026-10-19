import { parseApiEnv } from "@findit/config";
import { Module } from "@nestjs/common";

import { PROFILE_INTERNAL_KEY, ProfileKeyGuard } from "../profile/profile.controller.js";
import { FavoritesController } from "./favorites.controller.js";
import { FavoritesService } from "./favorites.service.js";

@Module({
  controllers: [FavoritesController],
  providers: [
    FavoritesService,
    ProfileKeyGuard,
    {
      provide: PROFILE_INTERNAL_KEY,
      useFactory: (): string => parseApiEnv(process.env).INTERNAL_API_KEY,
    },
  ],
})
export class FavoritesModule {}
