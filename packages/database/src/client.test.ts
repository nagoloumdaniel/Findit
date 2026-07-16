import { describe, expect, it } from "vitest";

import { createPrismaClient } from "./client.js";

describe("createPrismaClient", () => {
  it("creates a client backed by the PostgreSQL adapter", async () => {
    const client = createPrismaClient("postgresql://findit:findit@localhost:5432/findit");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.$connect).toBeTypeOf("function");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.$disconnect).toBeTypeOf("function");
    await client.$disconnect();
  });
});
