import type { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";

import { QueueLifecycleService } from "./queue-lifecycle.service.js";

describe("QueueLifecycleService", () => {
  it("closes the BullMQ queue during application shutdown", async () => {
    const close = vi.fn(() => Promise.resolve());
    const queue = { close } as unknown as Queue;
    const service = new QueueLifecycleService(queue);

    await service.onApplicationShutdown();

    expect(close).toHaveBeenCalledOnce();
  });
});
