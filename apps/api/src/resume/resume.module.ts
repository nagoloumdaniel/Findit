import { Module } from "@nestjs/common";

import { ProfileModule } from "../profile/profile.module.js";
import { ResumeController } from "./resume.controller.js";
import { ResumeService } from "./resume.service.js";

@Module({
  /*
   * Le garde `ProfileKeyGuard` et la clé interne viennent de `ProfileModule` :
   * un seul point de vérité pour la porte d'accès, partagé avec le profil.
   */
  imports: [ProfileModule],
  controllers: [ResumeController],
  providers: [ResumeService],
})
export class ResumeModule {}
