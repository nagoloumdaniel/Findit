import { Controller, Get, Query, UsePipes } from "@nestjs/common";

import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { jobQuerySchema, type JobQuery } from "./job-query.js";
import { JobsService, type JobList } from "./jobs.service.js";

@Controller("api/jobs")
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @UsePipes(new ZodValidationPipe(jobQuerySchema))
  list(@Query() query: JobQuery): Promise<JobList> {
    return this.jobs.list(query);
  }
}
