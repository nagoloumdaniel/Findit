import { parseApiEnv } from "@findit/config";
import { Module } from "@nestjs/common";

import { PROFILE_INTERNAL_KEY, ProfileController, ProfileKeyGuard } from "./profile.controller.js";
import { ProfileService } from "./profile.service.js";

@Module({
  controllers: [ProfileController],
  providers: [
    ProfileService,
    ProfileKeyGuard,
    {
      /*
       * La clé vient de `parseApiEnv`, seule autorité de l'environnement : elle
       * est lue une fois au démarrage, jamais renvoyée au client, et le module
       * échoue au boot si elle manque plutôt qu'à la première requête.
       */
      provide: PROFILE_INTERNAL_KEY,
      useFactory: (): string => parseApiEnv(process.env).INTERNAL_API_KEY,
    },
  ],
  /*
   * `ProfileService`, `ProfileKeyGuard` et la clé sont réutilisés par les
   * modules `resume` et `documents` : un seul garde et une seule lecture du
   * profil, plutôt que des copies qui divergeraient.
   */
  exports: [ProfileService, ProfileKeyGuard, PROFILE_INTERNAL_KEY],
})
export class ProfileModule {}
