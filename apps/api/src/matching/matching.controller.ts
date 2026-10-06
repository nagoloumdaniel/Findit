import { Body, Controller, Inject, Post, UsePipes } from "@nestjs/common";
import { z } from "zod";

import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { MatchingService } from "./matching.service.js";
import type { MatchItem } from "./matching.service.js";

const scoreBodySchema = z.object({ cvText: z.string().min(1) });

type ScoreBody = z.infer<typeof scoreBodySchema>;

@Controller("api/matching")
export class MatchingController {
  /*
   * La dépendance est nommée explicitement (voir `jobs.controller.ts`) : sans
   * `emitDecoratorMetadata` en développement, Nest n'a rien à injecter sinon.
   */
  constructor(@Inject(MatchingService) private readonly matching: MatchingService) {}

  @Post("score")
  @UsePipes(new ZodValidationPipe(scoreBodySchema))
  score(@Body() body: ScoreBody): Promise<MatchItem[]> {
    return this.matching.score(body.cvText);
  }
}
