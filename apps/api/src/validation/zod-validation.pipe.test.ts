import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ZodValidationPipe } from "./zod-validation.pipe.js";

const schema = z.object({
  cvText: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(10),
});

describe("ZodValidationPipe", () => {
  it("rend la valeur validée, coercition comprise", () => {
    const pipe = new ZodValidationPipe(schema);

    expect(pipe.transform({ cvText: "un CV", limit: "3" })).toEqual({ cvText: "un CV", limit: 3 });
  });

  it("nomme les champs fautifs plutôt que d'échouer sans détail", () => {
    const pipe = new ZodValidationPipe(schema);

    try {
      pipe.transform({ cvText: "", limit: "99" });
      throw new Error("le pipe aurait dû refuser");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        message: string;
        issues: { path: string; message: string }[];
      };
      expect(response.message).toBe("Paramètres de requête invalides");
      // Le chemin du champ est rendu tel quel : « limit », pas « limit.0 ».
      expect(response.issues.map((issue) => issue.path).sort()).toEqual(["cvText", "limit"]);
      expect(response.issues.every((issue) => issue.message.length > 0)).toBe(true);
    }
  });

  it("rend l'erreur pour un corps qui n'est pas un objet", () => {
    const pipe = new ZodValidationPipe(schema);

    expect(() => pipe.transform("pas un objet")).toThrow(BadRequestException);
  });
});
