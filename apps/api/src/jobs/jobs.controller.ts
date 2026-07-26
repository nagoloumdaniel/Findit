import { Controller, Get, Inject, NotFoundException, Param, Query, UsePipes } from "@nestjs/common";

import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { freshnessQuerySchema, jobQuerySchema, jobSlugSchema } from "./job-query.js";
import type { FreshnessQuery, JobQuery, JobSlug } from "./job-query.js";
import { JobsService } from "./jobs.service.js";
import type { JobDetail, JobFilters, JobList, JobStats } from "./jobs.service.js";

@Controller("api/jobs")
export class JobsController {
  /*
   * La dépendance est nommée explicitement plutôt que déduite du type. Le
   * serveur de développement exécute le TypeScript avec esbuild, qui n'émet pas
   * `emitDecoratorMetadata` : sans ce nom, Nest n'a rien à injecter et le
   * contrôleur reçoit `undefined`. La compilation, elle, émet la métadonnée -
   * l'oubli ne se voyait donc qu'en développement, à l'exécution.
   */
  constructor(@Inject(JobsService) private readonly jobs: JobsService) {}

  @Get()
  @UsePipes(new ZodValidationPipe(jobQuerySchema))
  list(@Query() query: JobQuery): Promise<JobList> {
    return this.jobs.list(query);
  }

  /*
   * Déclaré avant la route à paramètre : sans cela, « stats » et « filters »
   * seraient interprétés comme des slugs d'offre.
   */
  @Get("stats")
  stats(): Promise<JobStats> {
    return this.jobs.stats();
  }

  @Get("filters")
  filters(
    @Query(new ZodValidationPipe(freshnessQuerySchema)) query: FreshnessQuery,
  ): Promise<JobFilters> {
    return this.jobs.filters(query.freshness);
  }

  @Get(":slug")
  async detail(
    @Param(new ZodValidationPipe(jobSlugSchema)) params: JobSlug,
    @Query(new ZodValidationPipe(freshnessQuerySchema)) query: FreshnessQuery,
  ): Promise<JobDetail> {
    const job = await this.jobs.findBySlug(params.slug, query.freshness);

    if (!job) {
      throw new NotFoundException({
        message: "Cette offre n'est pas disponible.",
        reason: "Elle a expiré, elle est hors de la fenêtre demandée, ou elle n'existe pas.",
      });
    }

    return job;
  }
}
