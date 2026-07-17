import type { WorkerEnv } from "@findit/config";
import { createPrismaClient, type PrismaClient } from "@findit/database";
import { type DynamicModule, Inject, Injectable, Module } from "@nestjs/common";
import type { OnApplicationShutdown } from "@nestjs/common";
import { Queue } from "bullmq";

import { CollectionSchedulerService } from "./collection/collection-scheduler.service.js";
import {
  FINDIT_QUEUE,
  JOB_PIPELINE_QUEUE,
  WORKER_ENV,
  WORKER_PRISMA,
  WORKER_REDIS_CONNECTION,
} from "./queue/queue.constants.js";
import { QueueLifecycleService } from "./queue/queue-lifecycle.service.js";
import { createRedisConnectionOptions } from "./queue/redis-options.js";

/** Ferme le pool de connexions PostgreSQL quand le worker s'arrête. */
@Injectable()
class PrismaLifecycleService implements OnApplicationShutdown {
  constructor(@Inject(WORKER_PRISMA) private readonly prisma: PrismaClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

@Module({})
export class WorkerModule {
  static register(env: WorkerEnv): DynamicModule {
    const connection = createRedisConnectionOptions(env.REDIS_URL);

    return {
      module: WorkerModule,
      providers: [
        { provide: WORKER_ENV, useValue: env },
        { provide: WORKER_REDIS_CONNECTION, useValue: connection },
        { provide: WORKER_PRISMA, useFactory: () => createPrismaClient(env.DATABASE_URL) },
        {
          provide: FINDIT_QUEUE,
          useFactory: () => new Queue(JOB_PIPELINE_QUEUE, { connection }),
        },
        QueueLifecycleService,
        PrismaLifecycleService,
        CollectionSchedulerService,
      ],
    };
  }
}
