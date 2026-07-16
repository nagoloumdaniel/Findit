import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import type { Queue } from "bullmq";

import { FINDIT_QUEUE } from "./queue.constants.js";

@Injectable()
export class QueueLifecycleService implements OnApplicationShutdown {
  constructor(@Inject(FINDIT_QUEUE) private readonly queue: Queue) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}
