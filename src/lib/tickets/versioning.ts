/**
 * Ticket version tokens for optimistic concurrency.
 *
 * `tickets.updated_at` is bumped by the `tickets_set_updated_at` trigger on every
 * write, so it works as a version. The same instant can reach the browser in
 * different spellings (PostgREST returns `+00:00` with microseconds, other paths
 * may use `Z`, fewer fractional digits, or no offset), so compare normalized
 * microsecond values rather than raw strings.
 */
const TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/**
 * Returns the timestamp as whole microseconds since the epoch, or null when
 * unparseable. Current dates are ~1.8e15 µs, well inside Number.MAX_SAFE_INTEGER.
 */
export function ticketVersionMicros(value: string): number | null {
  const match = TIMESTAMP_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, date, time, fraction = "", rawOffset] = match;
  let offset = rawOffset ? rawOffset.toUpperCase() : "Z";
  if (/^[+-]\d{2}$/.test(offset)) offset = `${offset}:00`;
  else if (/^[+-]\d{4}$/.test(offset)) offset = `${offset.slice(0, 3)}:${offset.slice(3)}`;
  const seconds = Date.parse(`${date}T${time}${offset}`);
  if (Number.isNaN(seconds)) return null;
  const micros = Number(fraction.padEnd(6, "0").slice(0, 6));
  return seconds * 1000 + micros;
}

/** True when both values name the same ticket version. Unparseable values never match. */
export function isSameTicketVersion(expected: string, current: string): boolean {
  const a = ticketVersionMicros(expected);
  const b = ticketVersionMicros(current);
  return a !== null && b !== null && a === b;
}

export const TICKET_VERSION_CONFLICT_MESSAGE =
  "Someone else changed this ticket after you opened it. Your edits are still here: check the latest values and save again.";
