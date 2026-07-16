import { FastifyAdapter } from "@nestjs/platform-fastify";

export const createFastifyAdapter = (): FastifyAdapter =>
  new FastifyAdapter({ exposeHeadRoutes: false });
