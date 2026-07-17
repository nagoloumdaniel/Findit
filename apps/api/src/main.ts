import multipart from "@fastify/multipart";
import helmet from "@fastify/helmet";
import { loadRootEnv, parseApiEnv } from "@findit/config";
import { NestFactory } from "@nestjs/core";
import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import "reflect-metadata";

import { AppModule } from "./app.module.js";
import { createFastifyAdapter } from "./fastify-adapter.js";
import { RESUME_MAX_BYTES } from "./resume/resume.constants.js";

const bootstrap = async (): Promise<void> => {
  // Avant toute lecture de `process.env`, et avant que Nest ne construise le
  // moindre module : `PrismaModule` lit DATABASE_URL dès sa fabrique.
  loadRootEnv();

  const env = parseApiEnv(process.env);
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter());

  await app.register(helmet);
  // Un seul fichier par requête, plafonné : un CV n'est pas un gros fichier, et
  // la borne protège la mémoire du serveur.
  await app.register(multipart, { limits: { files: 1, fileSize: RESUME_MAX_BYTES } });
  app.enableCors({ origin: env.CORS_ORIGIN });
  app.enableShutdownHooks();

  await app.listen(env.API_PORT, "0.0.0.0");
};

void bootstrap();
