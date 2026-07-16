import { describe, expect, it } from "vitest";

import { createRedisConnectionOptions } from "./redis-options.js";

describe("createRedisConnectionOptions", () => {
  it("maps a Redis URL to BullMQ connection options", () => {
    expect(createRedisConnectionOptions("redis://user:secret@localhost:6380/2")).toEqual({
      host: "localhost",
      port: 6380,
      username: "user",
      password: "secret",
      db: 2,
      maxRetriesPerRequest: null,
    });
  });
});
