import { createHmac } from "node:crypto";

export function signWebhookPayload(payload: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

export function calculateRetryBackoffMs(attempt: number): number {
  if (!Number.isInteger(attempt) || attempt < 1)
    throw new Error("Attempt must be a positive integer.");
  const intervals = [60000, 300000, 900000, 3600000, 21600000];
  return intervals[Math.min(attempt, intervals.length) - 1];
}
