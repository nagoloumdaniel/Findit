import { Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { CurrentUser, SessionGuard } from "../auth/auth.guard.js";
import type { AuthUser } from "../auth/auth.service.js";
import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { FavoritesService } from "./favorites.service.js";
import type { FavoriteItem } from "./favorites.service.js";

const slugSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(140)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalide"),
});

type Slug = z.infer<typeof slugSchema>;

@Controller("api/favorites")
@UseGuards(SessionGuard)
export class FavoritesController {
  constructor(@Inject(FavoritesService) private readonly favorites: FavoritesService) {}

  /** Ajoute ou retire une offre des favoris de l'utilisateur. */
  @Post(":slug/toggle")
  @HttpCode(200)
  toggle(
    @Param(new ZodValidationPipe(slugSchema)) params: Slug,
    @CurrentUser() user: AuthUser | null,
  ): Promise<{ favorited: boolean }> {
    return this.favorites.toggle(params.slug, user?.id ?? null);
  }

  /** Liste les favoris de l'utilisateur. */
  @Get()
  list(@CurrentUser() user: AuthUser | null): Promise<FavoriteItem[]> {
    return this.favorites.list(user?.id ?? null);
  }
}
