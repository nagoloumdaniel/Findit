import helmet from "@fastify/helmet";
import { loadRootEnv, parseApiEnv } from "@findit/config";
import { NestFactory } from "@nestjs/core";
import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import "reflect-metadata";

import { AppModule } from "./app.module.js";
import { createFastifyAdapter } from "./fastify-adapter.js";

const bootstrap = async (): Promise<void> => {
  // Avant toute lecture de `process.env`, et avant que Nest ne construise le
  // moindre module : `PrismaModule` lit DATABASE_URL dès sa fabrique.
  loadRootEnv();

  const env = parseApiEnv(process.env);
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter());

  await app.register(helmet);
  app.enableCors({ origin: env.CORS_ORIGIN });
  app.enableShutdownHooks();

  await app.listen(env.API_PORT, "0.0.0.0");
};

void bootstrap();
