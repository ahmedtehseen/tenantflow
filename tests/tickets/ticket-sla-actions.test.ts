import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeTicketSLADeadlines,
  evaluateStatusTransitionSLA,
  getTargetMinutesForPriority,
} from "#sla/ticket-sla";
import type { SLAPolicyConfig } from "#types/database";

const policy: SLAPolicyConfig = {
  timezone: "UTC",
  business_days: [1, 2, 3, 4, 5],
  business_start_time: "09:00:00",
  business_end_time: "17:00:00",
  urgent_response_minutes: 60,
  urgent_resolution_minutes: 240,
  high_response_minutes: 240,
  high_resolution_minutes: 1440,
  medium_response_minutes: 480,
  medium_resolution_minutes: 2880,
  low_response_minutes: 1440,
  low_resolution_minutes: 4320,
};

describe("Ticket SLA Integration (Phase 3)", () => {
  describe("getTargetMinutesForPriority", () => {
    it("returns urgent targets from policy", () => {
      const { responseMinutes, resolutionMinutes } = getTargetMinutesForPriority("urgent", policy);
      assert.equal(responseMinutes, 60);
      assert.equal(resolutionMinutes, 240);
    });

    it("returns high targets from policy", () => {
      const { responseMinutes, resolutionMinutes } = getTargetMinutesForPriority("high", policy);
      assert.equal(responseMinutes, 240);
      assert.equal(resolutionMinutes, 1440);
    });

    it("falls back to defaults when policy fields are undefined", () => {
      const minimalPolicy: SLAPolicyConfig = {
        timezone: "UTC",
        business_days: [1, 2, 3, 4, 5],
        business_start_time: "09:00:00",
        business_end_time: "17:00:00",
      };
      const { responseMinutes, resolutionMinutes } = getTargetMinutesForPriority(
        "medium",
        minimalPolicy,
      );
      assert.equal(responseMinutes, 480);
      assert.equal(resolutionMinutes, 2880);
    });
  });

  describe("computeTicketSLADeadlines", () => {
    it("computes correct deadlines for urgent priority created at business start", () => {
      const created = new Date("2026-11-09T09:00:00Z"); // Monday 9:00 AM UTC
      const deadlines = computeTicketSLADeadlines(created, "urgent", policy);
      assert.equal(deadlines.first_response_due_at.toISOString(), "2026-11-09T10:00:00.000Z"); // +1hr
      assert.equal(deadlines.resolution_due_at.toISOString(), "2026-11-09T13:00:00.000Z"); // +4hr
    });

    it("computes correct deadlines for high priority created mid-day", () => {
      const created = new Date("2026-11-09T11:00:00Z"); // Monday 11:00 AM UTC
      const deadlines = computeTicketSLADeadlines(created, "high", policy);
      // 4 hrs from 11 AM = 3pm (Mon)
      assert.equal(deadlines.first_response_due_at.toISOString(), "2026-11-09T15:00:00.000Z");
    });

    it("freezes clock and starts on Monday for ticket created on Saturday", () => {
      const created = new Date("2026-11-14T12:00:00Z"); // Saturday noon UTC
      const deadlines = computeTicketSLADeadlines(created, "urgent", policy);
      // Business starts Monday 9am + 1hr = 10am Monday
      assert.equal(deadlines.first_response_due_at.toISOString(), "2026-11-16T10:00:00.000Z");
    });

    it("rolls deadline to next business day if created near end of business hours", () => {
      const created = new Date("2026-11-09T16:30:00Z"); // Monday 4:30 PM (30 min left)
      const deadlines = computeTicketSLADeadlines(created, "urgent", policy);
      // 30 min Monday + 30 min Tuesday = Tue 9:30 AM
      assert.equal(deadlines.first_response_due_at.toISOString(), "2026-11-10T09:30:00.000Z");
    });
  });

  describe("evaluateStatusTransitionSLA - open -> in_progress (First Response)", () => {
    it("sets first_responded_at when moving from open to in_progress for the first time", () => {
      const result = evaluateStatusTransitionSLA({
        fromStatus: "open",
        toStatus: "in_progress",
        transitionTime: new Date("2026-11-09T09:30:00Z"),
        firstResponseDueAt: new Date("2026-11-09T10:00:00Z"),
        firstRespondedAt: null,
      });
      assert.equal(result.first_responded_at, "2026-11-09T09:30:00.000Z");
      assert.equal(result.first_response_breached, false);
    });

    it("marks first_response_breached true if moving to in_progress after the due date", () => {
      const result = evaluateStatusTransitionSLA({
        fromStatus: "open",
        toStatus: "in_progress",
        transitionTime: new Date("2026-11-09T10:30:00Z"),
        firstResponseDueAt: new Date("2026-11-09T10:00:00Z"),
        firstRespondedAt: null,
      });
      assert.equal(result.first_response_breached, true);
    });

    it("does not overwrite first_responded_at if already set", () => {
      const result = evaluateStatusTransitionSLA({
        fromStatus: "open",
        toStatus: "in_progress",
        transitionTime: new Date("2026-11-09T11:00:00Z"),
        firstResponseDueAt: new Date("2026-11-09T10:00:00Z"),
        firstRespondedAt: "2026-11-09T09:30:00Z",
      });
      // first_responded_at already set, no update
      assert.equal(result.first_responded_at, undefined);
    });
  });

  describe("evaluateStatusTransitionSLA - any -> resolved (Resolution)", () => {
    it("sets resolved_at and marks SLA met when resolved before due date", () => {
      const result = evaluateStatusTransitionSLA({
        fromStatus: "in_progress",
        toStatus: "resolved",
        transitionTime: new Date("2026-11-09T14:00:00Z"),
        resolutionDueAt: new Date("2026-11-09T17:00:00Z"),
        resolvedAt: null,
      });
      assert.equal(result.resolved_at, "2026-11-09T14:00:00.000Z");
      assert.equal(result.resolution_breached, false);
    });

    it("marks resolution_breached true when resolving after due date", () => {
      const result = evaluateStatusTransitionSLA({
        fromStatus: "in_progress",
        toStatus: "resolved",
        transitionTime: new Date("2026-11-10T10:00:00Z"),
        resolutionDueAt: new Date("2026-11-09T17:00:00Z"),
        resolvedAt: null,
      });
      assert.equal(result.resolution_breached, true);
    });
  });

  describe("evaluateStatusTransitionSLA - reopening (Resolution reset)", () => {
    it("clears resolved_at when resolved ticket is reopened to in_progress", () => {
      const result = evaluateStatusTransitionSLA({
        fromStatus: "resolved",
        toStatus: "in_progress",
        transitionTime: new Date("2026-11-09T16:00:00Z"),
        resolutionDueAt: new Date("2026-11-09T17:00:00Z"),
        resolvedAt: "2026-11-09T15:00:00Z",
      });
      assert.equal(result.resolved_at, null);
      assert.equal(result.resolution_breached, false);
    });

    it("clears resolved_at when closed ticket is reopened to open", () => {
      const result = evaluateStatusTransitionSLA({
        fromStatus: "closed",
        toStatus: "open",
        transitionTime: new Date("2026-11-10T09:00:00Z"),
        resolvedAt: "2026-11-09T15:00:00Z",
      });
      assert.equal(result.resolved_at, null);
      assert.equal(result.resolution_breached, false);
    });
  });
});
