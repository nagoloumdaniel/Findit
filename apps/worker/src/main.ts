import { parseWorkerEnv } from "@findit/config";
import { NestFactory } from "@nestjs/core";
import "reflect-metadata";

import { WorkerModule } from "./worker.module.js";

const bootstrap = async (): Promise<void> => {
  const env = parseWorkerEnv(process.env);
  const app = await NestFactory.createApplicationContext(WorkerModule.register(env));
  app.enableShutdownHooks();
};

void bootstrap();
