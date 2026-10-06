import { describe, expect, it, vi } from "vitest";

import { createJobHandler, UnknownJobError } from "./job-handler.js";

describe("createJobHandler", () => {
  const cycles = () => ({
    native: vi.fn().mockResolvedValue("native"),
    scraped: vi.fn().mockResolvedValue("scraped"),
  });

  it("runs the 4-hour cycle for the collection job only", async () => {
    const c = cycles();

    await expect(createJobHandler(c)({ name: "collection-cycle" })).resolves.toBe("native");

    expect(c.native).toHaveBeenCalledOnce();
    expect(c.scraped).not.toHaveBeenCalled();
  });

  it("runs the daily scraped cycle for its own job only", async () => {
    const c = cycles();

    await expect(createJobHandler(c)({ name: "scraped-collection" })).resolves.toBe("scraped");

    expect(c.scraped).toHaveBeenCalledOnce();
    expect(c.native).not.toHaveBeenCalled();
  });

  it("fails loudly on an unknown job instead of running the wrong cycle", async () => {
    const c = cycles();

    await expect(createJobHandler(c)({ name: "autre" })).rejects.toBeInstanceOf(UnknownJobError);

    expect(c.native).not.toHaveBeenCalled();
    expect(c.scraped).not.toHaveBeenCalled();
  });
});
