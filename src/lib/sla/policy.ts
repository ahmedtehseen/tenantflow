import type { OrganizationSLAPolicyUpdate } from "#types/database";

export const SLA_TARGET_FIELDS = [
  "urgent_response_minutes",
  "urgent_resolution_minutes",
  "high_response_minutes",
  "high_resolution_minutes",
  "medium_response_minutes",
  "medium_resolution_minutes",
  "low_response_minutes",
  "low_resolution_minutes",
] as const;

export function parseSLAPolicy(form: FormData): OrganizationSLAPolicyUpdate {
  const timezone = String(form.get("timezone") || "").trim();
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw new Error("Enter a valid IANA timezone, such as Asia/Karachi.");
  }
  const business_days = [
    ...new Set(form.getAll("business_days").map(Number)),
  ].sort();
  if (
    !business_days.length ||
    business_days.some((day) => !Number.isInteger(day) || day < 1 || day > 7)
  ) {
    throw new Error("Select at least one business day.");
  }
  const business_start_time = String(form.get("business_start_time") || "");
  const business_end_time = String(form.get("business_end_time") || "");
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
  if (
    !timePattern.test(business_start_time) ||
    !timePattern.test(business_end_time) ||
    business_start_time >= business_end_time
  ) {
    throw new Error(
      "Business closing time must follow opening time on the same day.",
    );
  }
  const policy: OrganizationSLAPolicyUpdate = {
    timezone,
    business_days,
    business_start_time,
    business_end_time,
  };
  for (const field of SLA_TARGET_FIELDS) {
    const value = Number(form.get(field));
    if (!Number.isInteger(value) || value < 1 || value > 525600)
      throw new Error(
        "SLA targets must be whole minutes between 1 and 525,600.",
      );
    policy[field] = value;
  }
  return policy;
}
