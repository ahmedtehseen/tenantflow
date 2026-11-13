import type { SLAPolicyConfig, SLAStatus } from "@/types/database";

export type { SLAPolicyConfig, SLAStatus };

const WEEKDAY_MAP: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export interface TimeParts {
  hour: number;
  minute: number;
  second: number;
  totalSeconds: number;
}

export interface ZonedParts extends TimeParts {
  year: number;
  month: number;
  day: number;
  weekday: number; // 1 (Mon) - 7 (Sun)
}

/**
 * Parses "HH:mm:ss" or "HH:mm" time string into hours, minutes, seconds, and total seconds from midnight.
 */
export function parseTimeString(timeStr: string): TimeParts {
  const parts = timeStr.split(":").map(Number);
  const hour = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minute = Number.isFinite(parts[1]) ? parts[1] : 0;
  const second = Number.isFinite(parts[2]) ? parts[2] : 0;
  return {
    hour,
    minute,
    second,
    totalSeconds: hour * 3600 + minute * 60 + second,
  };
}

/**
 * Extracts year, month, day, weekday (1=Mon..7=Sun), hour, minute, second in the specified IANA timezone.
 */
export function getZonedParts(date: Date | string, timeZone: string): ZonedParts {
  const d = new Date(date);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    dtf.formatToParts(d).map((p) => [p.type, p.value])
  );

  const hour = parseInt(parts.hour, 10);
  const minute = parseInt(parts.minute, 10);
  const second = parseInt(parts.second, 10);

  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    weekday: WEEKDAY_MAP[parts.weekday] ?? 1,
    hour,
    minute,
    second,
    totalSeconds: hour * 3600 + minute * 60 + second,
  };
}

/**
 * Converts a target timezone's local date/time components into the exact UTC Date.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const parts = Object.fromEntries(
    dtf.formatToParts(guess).map((p) => [p.type, p.value])
  );

  const localAsUtc = Date.UTC(
    parseInt(parts.year, 10),
    parseInt(parts.month, 10) - 1,
    parseInt(parts.day, 10),
    parseInt(parts.hour, 10),
    parseInt(parts.minute, 10),
    parseInt(parts.second, 10)
  );

  const offset = localAsUtc - guess.getTime();
  const adjusted = new Date(guess.getTime() - offset);

  // Secondary check for DST transition boundary correction
  const checkParts = Object.fromEntries(
    dtf.formatToParts(adjusted).map((p) => [p.type, p.value])
  );
  const checkLocalAsUtc = Date.UTC(
    parseInt(checkParts.year, 10),
    parseInt(checkParts.month, 10) - 1,
    parseInt(checkParts.day, 10),
    parseInt(checkParts.hour, 10),
    parseInt(checkParts.minute, 10),
    parseInt(checkParts.second, 10)
  );
  const secondOffset = checkLocalAsUtc - adjusted.getTime();

  return secondOffset !== offset
    ? new Date(guess.getTime() - secondOffset)
    : adjusted;
}

/**
 * Checks whether the given date is during open business hours for the policy.
 */
export function isBusinessOpen(
  date: Date | string,
  policy: SLAPolicyConfig
): boolean {
  const parts = getZonedParts(date, policy.timezone);
  if (!policy.business_days.includes(parts.weekday)) {
    return false;
  }

  const start = parseTimeString(policy.business_start_time);
  const end = parseTimeString(policy.business_end_time);

  return (
    parts.totalSeconds >= start.totalSeconds &&
    parts.totalSeconds < end.totalSeconds
  );
}

/**
 * Returns the nearest business open moment (Date).
 * If currently within open business hours, returns date as a Date instance.
 * If before opening today, returns today's start time.
 * If after closing or on a non-business day, finds the next business day's start time.
 */
export function getNearestBusinessOpenTime(
  date: Date | string,
  policy: SLAPolicyConfig
): Date {
  if (isBusinessOpen(date, policy)) {
    return new Date(date);
  }

  const d = new Date(date);
  const parts = getZonedParts(d, policy.timezone);
  const start = parseTimeString(policy.business_start_time);

  // If today is a business day and we are before opening
  if (
    policy.business_days.includes(parts.weekday) &&
    parts.totalSeconds < start.totalSeconds
  ) {
    return zonedTimeToUtc(
      parts.year,
      parts.month,
      parts.day,
      start.hour,
      start.minute,
      start.second,
      policy.timezone
    );
  }

  // Otherwise, look forward up to 14 days to find the next business day
  for (let offset = 1; offset <= 14; offset++) {
    const nextCheck = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day + offset, 12, 0, 0)
    );
    const nextParts = getZonedParts(nextCheck, policy.timezone);
    if (policy.business_days.includes(nextParts.weekday)) {
      return zonedTimeToUtc(
        nextParts.year,
        nextParts.month,
        nextParts.day,
        start.hour,
        start.minute,
        start.second,
        policy.timezone
      );
    }
  }

  throw new Error("No business days configured in policy");
}

/**
 * Calculates deterministic SLA deadline advancing strictly through business hours.
 * Off-hours and weekends are frozen.
 */
export function calculateBusinessDeadline(
  startTime: Date | string,
  targetMinutes: number,
  policy: SLAPolicyConfig
): Date {
  if (targetMinutes <= 0) {
    return isBusinessOpen(startTime, policy)
      ? new Date(startTime)
      : getNearestBusinessOpenTime(startTime, policy);
  }

  let current = isBusinessOpen(startTime, policy)
    ? new Date(startTime)
    : getNearestBusinessOpenTime(startTime, policy);

  let remainingMinutes = targetMinutes;
  const endParts = parseTimeString(policy.business_end_time);

  while (remainingMinutes > 0) {
    const parts = getZonedParts(current, policy.timezone);
    const todayEnd = zonedTimeToUtc(
      parts.year,
      parts.month,
      parts.day,
      endParts.hour,
      endParts.minute,
      endParts.second,
      policy.timezone
    );

    const minutesLeftToday =
      (todayEnd.getTime() - current.getTime()) / (60 * 1000);

    if (remainingMinutes <= minutesLeftToday) {
      current = new Date(current.getTime() + remainingMinutes * 60 * 1000);
      remainingMinutes = 0;
      break;
    } else {
      remainingMinutes -= minutesLeftToday;
      current = getNearestBusinessOpenTime(todayEnd, policy);
    }
  }

  return current;
}

/**
 * Calculates remaining active business minutes between now and dueAt.
 * Clock freezes outside business hours.
 */
export function calculateRemainingBusinessMinutes(
  now: Date | string,
  dueAt: Date | string,
  policy: SLAPolicyConfig
): number {
  const nowDate = new Date(now);
  const dueDate = new Date(dueAt);

  if (nowDate.getTime() >= dueDate.getTime()) {
    return 0;
  }

  let current = isBusinessOpen(nowDate, policy)
    ? nowDate
    : getNearestBusinessOpenTime(nowDate, policy);

  if (current.getTime() >= dueDate.getTime()) {
    return 0;
  }

  let totalMinutes = 0;
  const endParts = parseTimeString(policy.business_end_time);

  while (current.getTime() < dueDate.getTime()) {
    const parts = getZonedParts(current, policy.timezone);
    const todayEnd = zonedTimeToUtc(
      parts.year,
      parts.month,
      parts.day,
      endParts.hour,
      endParts.minute,
      endParts.second,
      policy.timezone
    );

    if (dueDate.getTime() <= todayEnd.getTime()) {
      totalMinutes += (dueDate.getTime() - current.getTime()) / (60 * 1000);
      break;
    } else {
      totalMinutes += (todayEnd.getTime() - current.getTime()) / (60 * 1000);
      current = getNearestBusinessOpenTime(todayEnd, policy);
    }
  }

  return Math.max(0, Math.round(totalMinutes));
}

/**
 * Evaluates SLA status based on operational business rules.
 */
export function getSLAStatus(
  now: Date | string,
  dueAt: Date | string | null,
  completedAt: Date | string | null,
  isBusinessOpen: boolean,
  targetMinutes?: number,
  remainingBusinessMinutes?: number
): SLAStatus {
  if (!dueAt) {
    return "none";
  }

  const dueDate = new Date(dueAt);

  if (completedAt) {
    const completedDate = new Date(completedAt);
    return completedDate.getTime() <= dueDate.getTime() ? "met" : "breached";
  }

  const nowDate = new Date(now);
  if (nowDate.getTime() > dueDate.getTime()) {
    return "breached";
  }

  if (!isBusinessOpen) {
    return "paused";
  }

  const remainingMinutes = remainingBusinessMinutes ??
    (dueDate.getTime() - nowDate.getTime()) / (60 * 1000);

  const isAtRisk =
    remainingMinutes <= 60 ||
    (targetMinutes !== undefined &&
      targetMinutes > 0 &&
      remainingMinutes <= targetMinutes * 0.2);

  if (isAtRisk) {
    return "at_risk";
  }

  return "on_track";
}
