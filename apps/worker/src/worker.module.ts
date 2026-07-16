import { type DynamicModule, Module } from "@nestjs/common";
import { Queue } from "bullmq";

import type { WorkerEnv } from "@findit/config";
import { FINDIT_QUEUE, JOB_PIPELINE_QUEUE } from "./queue/queue.constants.js";
import { QueueLifecycleService } from "./queue/queue-lifecycle.service.js";
import { createRedisConnectionOptions } from "./queue/redis-options.js";

@Module({})
export class WorkerModule {
  static register(env: WorkerEnv): DynamicModule {
    return {
      module: WorkerModule,
      providers: [
        {
          provide: FINDIT_QUEUE,
          useFactory: () =>
            new Queue(JOB_PIPELINE_QUEUE, {
              connection: createRedisConnectionOptions(env.REDIS_URL),
            }),
        },
        QueueLifecycleService,
      ],
    };
  }
}
