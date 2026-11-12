import { timingSafeEqual } from "node:crypto";

export function verifyCronAuthorization(
  header: string | null,
  secret = process.env.CRON_SECRET,
): boolean {
  if (!secret || !header) return false;
  const actual = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
