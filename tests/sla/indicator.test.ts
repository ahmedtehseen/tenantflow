import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getTicketSLAIndicator } from "#sla/indicator";
import { parseSLAPolicy, SLA_TARGET_FIELDS } from "#sla/policy";
import type { OrganizationSLAPolicy } from "#types/database";

const policy = {
  timezone: "UTC",
  business_days: [1, 2, 3, 4, 5],
  business_start_time: "09:00",
  business_end_time: "17:00",
  urgent_response_minutes: 600,
  urgent_resolution_minutes: 1200,
} as OrganizationSLAPolicy;
describe("SLA indicators and policy validation", () => {
  it("evaluates risk using business minutes across a weekend", () => {
    const result = getTicketSLAIndicator(
      { priority: "urgent", first_response_due_at: "2026-11-09T10:00:00Z" },
      policy,
      new Date("2026-11-06T16:30:00Z"),
      "response",
    );
    assert.equal(result?.status, "at_risk");
    assert.match(result?.text || "", /1h 30m/);
  });
  it("freezes unbreached timers outside business hours", () => {
    const result = getTicketSLAIndicator(
      { priority: "urgent", first_response_due_at: "2026-11-06T17:00:00Z" },
      policy,
      new Date("2026-11-07T12:00:00Z"),
      "response",
    );
    assert.equal(result?.status, "paused");
  });
  it("preserves completed and previously recorded breach outcomes", () => {
    assert.equal(
      getTicketSLAIndicator(
        {
          priority: "urgent",
          first_response_due_at: "2026-11-06T17:00:00Z",
          first_responded_at: "2026-11-06T16:00:00Z",
        },
        policy,
        new Date("2026-11-07T12:00:00Z"),
        "response",
      )?.status,
      "met",
    );
    assert.equal(
      getTicketSLAIndicator(
        {
          priority: "urgent",
          first_response_due_at: "2026-11-06T16:00:00Z",
          first_response_breached: true,
        },
        policy,
        new Date("2026-11-07T12:00:00Z"),
        "response",
      )?.status,
      "breached",
    );
  });
  function form() {
    const data = new FormData();
    data.set("timezone", "Asia/Karachi");
    data.set("business_start_time", "09:00");
    data.set("business_end_time", "17:00");
    data.append("business_days", "1");
    for (const field of SLA_TARGET_FIELDS) data.set(field, "60");
    return data;
  }
  it("accepts valid business windows and rejects impossible policies", () => {
    assert.deepEqual(parseSLAPolicy(form()).business_days, [1]);
    for (const [key, value] of [
      ["timezone", "invalid"],
      ["business_end_time", "08:00"],
      ["urgent_response_minutes", "0"],
      ["urgent_response_minutes", "Infinity"],
    ]) {
      const data = form();
      data.set(key, value);
      assert.throws(() => parseSLAPolicy(data));
    }
    const data = form();
    data.delete("business_days");
    assert.throws(() => parseSLAPolicy(data));
  });
});
