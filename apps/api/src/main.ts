import helmet from "@fastify/helmet";
import { parseApiEnv } from "@findit/config";
import { NestFactory } from "@nestjs/core";
import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import "reflect-metadata";

import { AppModule } from "./app.module.js";
import { createFastifyAdapter } from "./fastify-adapter.js";

const bootstrap = async (): Promise<void> => {
  const env = parseApiEnv(process.env);
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter());

  await app.register(helmet);
  app.enableCors({ origin: env.CORS_ORIGIN });
  app.enableShutdownHooks();

  await app.listen(env.API_PORT, "0.0.0.0");
};

void bootstrap();
