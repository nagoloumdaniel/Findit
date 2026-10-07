import { timingSafeEqual } from "node:crypto";

import {
  type CanActivate,
  type ExecutionContext,
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Put,
  UnauthorizedException,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { z } from "zod";

import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { ProfileService } from "./profile.service.js";
import type { ProfileView } from "./profile.service.js";

/**
 * Jeton Nest de la clé interne attendue.
 *
 * Elle est fournie par le module (lue une fois via `parseApiEnv`) plutôt que
 * relue à chaque requête : le contrôleur reste ainsi testable sans `.env`, et la
 * clé n'apparaît jamais dans une signature HTTP ni dans le navigateur.
 */
export const PROFILE_INTERNAL_KEY = Symbol("PROFILE_INTERNAL_KEY");

/** En-tête porteur de la clé. Le web la détient, le navigateur ne la voit pas. */
const INTERNAL_KEY_HEADER = "x-internal-key";

/*
 * Comparaison à temps constant : `===` s'arrête au premier caractère différent,
 * et le temps de réponse laisserait deviner la clé caractère par caractère. La
 * longueur est comparée d'abord parce que `timingSafeEqual` l'exige ; elle n'est
 * pas un secret exploitable.
 */
const sameKey = (provided: string, expected: string): boolean => {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
};

/** Vue minimale de la requête : seul l'en-tête nous intéresse. */
interface InternalRequest {
  readonly headers: Record<string, string | string[] | undefined>;
}

/**
 * Porte d'accès des endpoints de profil : accès serveur à serveur uniquement.
 *
 * Un garde plutôt qu'un test dans chaque méthode : Nest l'exécute **avant** les
 * pipes, donc une clé absente rend 401 même si le corps est invalide. Un test
 * placé dans la méthode laisserait la validation répondre 400 d'abord, et le
 * code d'erreur dépendrait alors de l'ordre des contrôles.
 */
@Injectable()
export class ProfileKeyGuard implements CanActivate {
  constructor(@Inject(PROFILE_INTERNAL_KEY) private readonly internalKey: string) {}

  canActivate(context: ExecutionContext): boolean {
    const provided = context.switchToHttp().getRequest<InternalRequest>().headers[
      INTERNAL_KEY_HEADER
    ];

    if (typeof provided !== "string" || !sameKey(provided, this.internalKey)) {
      throw new UnauthorizedException({
        message: "Accès interne requis.",
        reason: "L'en-tête x-internal-key est absent ou ne correspond pas à INTERNAL_API_KEY.",
      });
    }

    return true;
  }
}

/*
 * Forme validée des liens, langues et expériences. Ces champs sont du JSON libre
 * en base : sans ce schéma, n'importe quelle structure y entrerait, et le web
 * casserait à la relecture. `url` et `email` restent des chaînes : le web peut
 * enregistrer un lien relatif, et une chaîne vide est une saisie en cours, pas
 * une erreur.
 */
const profileLinkSchema = z.object({ label: z.string(), url: z.string() });
const profileLanguageSchema = z.object({ name: z.string(), level: z.string() });
const profileExperienceSchema = z.object({
  title: z.string(),
  company: z.string(),
  period: z.string(),
  description: z.string(),
});

export const profileInputSchema = z.object({
  fullName: z.string().optional(),
  headline: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  links: z.array(profileLinkSchema).optional(),
  skills: z.array(z.string()).optional(),
  languages: z.array(profileLanguageSchema).optional(),
  experiences: z.array(profileExperienceSchema).optional(),
  cvText: z.string().nullable().optional(),
});

type ProfileInputBody = z.infer<typeof profileInputSchema>;

@Controller("api/profile")
@UseGuards(ProfileKeyGuard)
export class ProfileController {
  /*
   * Dépendance nommée explicitement : le serveur de développement compile avec
   * esbuild, qui n'émet pas `emitDecoratorMetadata` — sans ce nom, Nest n'a rien
   * à injecter (même piège que `jobs.controller.ts`).
   */
  constructor(@Inject(ProfileService) private readonly profile: ProfileService) {}

  /** Le profil stocké, ou sa forme vide : jamais 404. */
  @Get()
  get(): Promise<ProfileView> {
    return this.profile.get();
  }

  /** Écrit le singleton et rend ce qui a été enregistré. */
  @Put()
  @UsePipes(new ZodValidationPipe(profileInputSchema))
  save(@Body() body: ProfileInputBody): Promise<ProfileView> {
    return this.profile.save(body);
  }
}
