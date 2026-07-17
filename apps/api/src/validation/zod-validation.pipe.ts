import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/*
 * Rejette une entrée invalide avant qu'elle n'atteigne le service, et renvoie
 * le détail des champs fautifs plutôt qu'une erreur opaque.
 */
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown): TOutput {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        message: "Paramètres de requête invalides",
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}
