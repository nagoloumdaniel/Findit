import { Module } from "@nestjs/common";

import { ProfileModule } from "../profile/profile.module.js";
import { DocumentsController } from "./documents.controller.js";
import { DocumentsService } from "./documents.service.js";

@Module({
  /*
   * Le service lit le profil (`ProfileService`) et le garde vient de
   * `ProfileModule` : un seul point de vérité, partagé avec le profil.
   */
  imports: [ProfileModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
