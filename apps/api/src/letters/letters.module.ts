import { createOllamaModel } from "@findit/ai";
import { parseApiEnv } from "@findit/config";
import { Module } from "@nestjs/common";

import { WORKSPACE_SECRET, WorkspaceGuard } from "../workspace/workspace.guard.js";
import { LettersController } from "./letters.controller.js";
import { LETTERS_AI_MODEL, LETTERS_CLOCK, LettersService } from "./letters.service.js";

@Module({
  controllers: [LettersController],
  providers: [
    LettersService,
    WorkspaceGuard,
    { provide: WORKSPACE_SECRET, useFactory: () => parseApiEnv(process.env).INTERNAL_API_KEY },
    {
      provide: LETTERS_AI_MODEL,
      useFactory: () => {
        const env = parseApiEnv(process.env);
        if (env.AI_PROVIDER === "disabled") {
          return null;
        }
        // Le modèle de raisonnement, pas celui d'extraction : une lettre est
        // une rédaction courte, pas une extraction de champs.
        return createOllamaModel({ baseUrl: env.OLLAMA_BASE_URL, model: env.AI_MODEL_REASONING });
      },
    },
    { provide: LETTERS_CLOCK, useValue: () => new Date() },
  ],
})
export class LettersModule {}
