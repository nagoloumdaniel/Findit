import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  Put,
  UseGuards,
  UsePipes,
} from "@nestjs/common";

import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { WorkspaceGuard } from "../workspace/workspace.guard.js";
import { profileInputSchema, profilePatchSchema } from "./profile-input.js";
import type { ProfileInput, ProfilePatch } from "./profile-input.js";
import { ProfileService } from "./profile.service.js";
import type { CandidateProfileView } from "./profile.service.js";

/**
 * Le profil du propriétaire. Toutes les routes sont derrière la clé de l'espace
 * privé : sans elle, `WorkspaceGuard` refuse avant d'atteindre le contrôleur.
 */
@Controller("api/profile")
@UseGuards(WorkspaceGuard)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  async get(): Promise<CandidateProfileView> {
    const profile = await this.profile.get();
    if (profile === null) {
      throw new NotFoundException("Aucun profil n'a encore été créé.");
    }
    return profile;
  }

  @Put()
  @UsePipes(new ZodValidationPipe(profileInputSchema))
  put(@Body() input: ProfileInput): Promise<CandidateProfileView> {
    return this.profile.put(input);
  }

  @Patch()
  @UsePipes(new ZodValidationPipe(profilePatchSchema))
  async patch(@Body() patch: ProfilePatch): Promise<CandidateProfileView> {
    const updated = await this.profile.patch(patch);
    if (updated === null) {
      throw new NotFoundException("Aucun profil à mettre à jour : créez-le d'abord.");
    }
    return updated;
  }
}
