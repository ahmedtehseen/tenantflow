import "server-only";
import { Redis } from "@upstash/redis";

const offlineQueue = new Map<string, number>();

export function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

export async function scheduleWebhookRetry(id: string, at: number) {
  const redis = getRedis();
  if (redis) await redis.zadd("webhooks:retry_zset", { score: at, member: id });
  else offlineQueue.set(id, at);
}

export async function getReadyWebhookRetries(now: number): Promise<string[]> {
  const redis = getRedis();
  if (redis)
    return redis.zrange<string[]>("webhooks:retry_zset", 0, now, {
      byScore: true,
      offset: 0,
      count: 100,
    });
  return [...offlineQueue]
    .filter(([, at]) => at <= now)
    .slice(0, 100)
    .map(([id]) => id);
}

export async function removeWebhookRetry(id: string) {
  const redis = getRedis();
  if (redis) await redis.zrem("webhooks:retry_zset", id);
  else offlineQueue.delete(id);
}
