import type { ConnectionOptions } from "bullmq";

export const createRedisConnectionOptions = (redisUrl: string): ConnectionOptions => {
  const parsed = new URL(redisUrl);
  const databasePath = parsed.pathname.replace("/", "");

  return {
    host: parsed.hostname,
    port: Number(parsed.port || "6379"),
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    db: databasePath ? Number(databasePath) : 0,
    maxRetriesPerRequest: null,
  };
};
