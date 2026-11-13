import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBusinessDeadline,
  calculateRemainingBusinessMinutes,
  getSLAStatus,
  isBusinessOpen,
  getNearestBusinessOpenTime,
} from '#sla/business-hours';
import type { SLAPolicyConfig } from '#types/database';

describe('SLA Business Hours Engine', () => {
  const policy: SLAPolicyConfig = {
    timezone: 'UTC',
    business_days: [1, 2, 3, 4, 5], // Mon-Fri
    business_start_time: '09:00:00',
    business_end_time: '17:00:00', // 8 hours = 480 mins/day
  };

  describe('isBusinessOpen', () => {
    it('returns true when timestamp is within open business hours', () => {
      const openTime = new Date('2026-11-09T10:00:00Z'); // Monday 10:00 AM UTC
      assert.equal(isBusinessOpen(openTime, policy), true);
    });

    it('returns false when timestamp is before opening time', () => {
      const earlyMorning = new Date('2026-11-09T08:59:59Z'); // Monday 8:59:59 AM UTC
      assert.equal(isBusinessOpen(earlyMorning, policy), false);
    });

    it('returns false when timestamp is at or after closing time', () => {
      const closing = new Date('2026-11-09T17:00:00Z'); // Monday 5:00 PM UTC
      assert.equal(isBusinessOpen(closing, policy), false);
      const afterHours = new Date('2026-11-09T20:00:00Z');
      assert.equal(isBusinessOpen(afterHours, policy), false);
    });

    it('returns false on weekends / non-business days', () => {
      const saturday = new Date('2026-11-14T12:00:00Z');
      const sunday = new Date('2026-11-15T12:00:00Z');
      assert.equal(isBusinessOpen(saturday, policy), false);
      assert.equal(isBusinessOpen(sunday, policy), false);
    });

    it('respects configured timezone (e.g. America/New_York)', () => {
      const nyPolicy: SLAPolicyConfig = {
        timezone: 'America/New_York',
        business_days: [1, 2, 3, 4, 5],
        business_start_time: '09:00:00',
        business_end_time: '17:00:00',
      };
      // 14:00 UTC = 9:00 AM EST (open)
      assert.equal(isBusinessOpen(new Date('2026-11-09T14:00:00Z'), nyPolicy), true);
      // 13:59 UTC = 8:59 AM EST (closed)
      assert.equal(isBusinessOpen(new Date('2026-11-09T13:59:00Z'), nyPolicy), false);
      // 22:00 UTC = 5:00 PM EST (closed)
      assert.equal(isBusinessOpen(new Date('2026-11-09T22:00:00Z'), nyPolicy), false);
    });
  });

  describe('getNearestBusinessOpenTime', () => {
    it('returns the same time if currently within open business hours', () => {
      const openTime = new Date('2026-11-09T10:00:00Z');
      const nearest = getNearestBusinessOpenTime(openTime, policy);
      assert.equal(nearest.toISOString(), '2026-11-09T10:00:00.000Z');
    });

    it('returns opening time of the same day if before opening on a business day', () => {
      const morning = new Date('2026-11-09T07:15:00Z');
      const nearest = getNearestBusinessOpenTime(morning, policy);
      assert.equal(nearest.toISOString(), '2026-11-09T09:00:00.000Z');
    });

    it('returns opening time of next business day if after closing', () => {
      const evening = new Date('2026-11-09T18:00:00Z'); // Monday 6:00 PM
      const nearest = getNearestBusinessOpenTime(evening, policy);
      assert.equal(nearest.toISOString(), '2026-11-10T09:00:00.000Z'); // Tuesday 9:00 AM
    });

    it('freezes over weekend from Friday night to Monday morning', () => {
      const fridayNight = new Date('2026-11-13T19:30:00Z');
      const nearest = getNearestBusinessOpenTime(fridayNight, policy);
      assert.equal(nearest.toISOString(), '2026-11-16T09:00:00.000Z'); // Monday 9:00 AM
    });

    it('handles Sunday creation by returning Monday morning', () => {
      const sunday = new Date('2026-11-15T12:00:00Z');
      const nearest = getNearestBusinessOpenTime(sunday, policy);
      assert.equal(nearest.toISOString(), '2026-11-16T09:00:00.000Z');
    });
  });

  describe('calculateBusinessDeadline', () => {
    it('calculates deadline within the same business day', () => {
      const start = new Date('2026-11-09T10:00:00Z'); // Monday 10:00 AM UTC
      const deadline = calculateBusinessDeadline(start, 120, policy); // 2 hours
      assert.equal(deadline.toISOString(), '2026-11-09T12:00:00.000Z');
    });

    it('returns original/nearest open time if targetMinutes is 0', () => {
      const start = new Date('2026-11-09T10:00:00Z');
      assert.equal(calculateBusinessDeadline(start, 0, policy).toISOString(), '2026-11-09T10:00:00.000Z');
      const sunday = new Date('2026-11-15T12:00:00Z');
      assert.equal(calculateBusinessDeadline(sunday, 0, policy).toISOString(), '2026-11-16T09:00:00.000Z');
    });

    it('rolls deadline over to next day when target exceeds closing time', () => {
      const start = new Date('2026-11-09T16:00:00Z'); // Monday 4:00 PM (1 hr left today)
      const deadline = calculateBusinessDeadline(start, 120, policy); // 2 hours
      // 1 hr on Mon (until 5pm) + 1 hr on Tue (9am - 10am)
      assert.equal(deadline.toISOString(), '2026-11-10T10:00:00.000Z');
    });

    it('rolls over multiple days if targetMinutes spans several business days', () => {
      const start = new Date('2026-11-09T09:00:00Z'); // Monday 9:00 AM
      // 16 business hours = 960 minutes = exactly 2 full business days
      const deadline = calculateBusinessDeadline(start, 960, policy);
      // Mon 8 hrs + Tue 8 hrs = ends Tuesday at 17:00:00
      assert.equal(deadline.toISOString(), '2026-11-10T17:00:00.000Z');
    });

    it('freezes deadline calculation over weekend (Friday afternoon to Monday morning)', () => {
      const start = new Date('2026-11-13T16:30:00Z'); // Friday 4:30 PM (30 mins left)
      const deadline = calculateBusinessDeadline(start, 120, policy); // 2 hours (30 min Fri + 90 min Mon)
      // 9:00 AM Monday + 90 mins = 10:30 AM Monday
      assert.equal(deadline.toISOString(), '2026-11-16T10:30:00.000Z');
    });

    it('starts clock at opening time if ticket is created overnight or on weekend', () => {
      const start = new Date('2026-11-15T12:00:00Z'); // Sunday noon
      const deadline = calculateBusinessDeadline(start, 60, policy); // 1 hour
      assert.equal(deadline.toISOString(), '2026-11-16T10:00:00.000Z');
    });

    it('accepts string timestamps', () => {
      const deadline = calculateBusinessDeadline('2026-11-09T10:00:00Z', 120, policy);
      assert.equal(deadline.toISOString(), '2026-11-09T12:00:00.000Z');
    });

    it('supports custom work schedules (e.g. Sunday-Thursday in Middle East)', () => {
      const dubaiPolicy: SLAPolicyConfig = {
        timezone: 'Asia/Dubai',
        business_days: [7, 1, 2, 3, 4], // Sun, Mon, Tue, Wed, Thu
        business_start_time: '09:00:00',
        business_end_time: '17:00:00',
      };
      // Dubai is UTC+4. Sunday 06:00 UTC = Sunday 10:00 AM Dubai
      const start = new Date('2026-11-15T06:00:00Z'); // Sunday
      const deadline = calculateBusinessDeadline(start, 120, dubaiPolicy);
      // 10:00 AM + 2 hours = 12:00 PM Dubai = 08:00 UTC
      assert.equal(deadline.toISOString(), '2026-11-15T08:00:00.000Z');
    });
  });

  describe('calculateRemainingBusinessMinutes', () => {
    it('returns exact business minutes between two timestamps on the same day', () => {
      const now = new Date('2026-11-09T10:00:00Z');
      const due = new Date('2026-11-09T12:00:00Z');
      assert.equal(calculateRemainingBusinessMinutes(now, due, policy), 120);
    });

    it('returns business minutes across business days, skipping nights', () => {
      const now = new Date('2026-11-09T16:00:00Z'); // Mon 4 PM (1 hr left today)
      const due = new Date('2026-11-10T10:00:00Z'); // Tue 10 AM (1 hr into tomorrow)
      assert.equal(calculateRemainingBusinessMinutes(now, due, policy), 120);
    });

    it('returns business minutes across weekends, skipping Saturday and Sunday', () => {
      const now = new Date('2026-11-13T16:30:00Z'); // Fri 4:30 PM (30 min left)
      const due = new Date('2026-11-16T10:30:00Z'); // Mon 10:30 AM (90 min in)
      assert.equal(calculateRemainingBusinessMinutes(now, due, policy), 120);
    });

    it('freezes clock when now is during non-business hours', () => {
      const sundayNoon = new Date('2026-11-15T12:00:00Z');
      const due = new Date('2026-11-16T10:00:00Z'); // Mon 10:00 AM (1 hr from Mon 9 AM)
      assert.equal(calculateRemainingBusinessMinutes(sundayNoon, due, policy), 60);
    });

    it('returns 0 when now is equal to or past dueAt', () => {
      const past = new Date('2026-11-09T13:00:00Z');
      const due = new Date('2026-11-09T12:00:00Z');
      assert.equal(calculateRemainingBusinessMinutes(past, due, policy), 0);
      assert.equal(calculateRemainingBusinessMinutes(due, due, policy), 0);
    });
  });

  describe('getSLAStatus', () => {
    const due = new Date('2026-11-09T12:00:00Z');

    it('returns "none" when dueAt is null', () => {
      assert.equal(getSLAStatus(new Date('2026-11-09T11:00:00Z'), null, null, true), 'none');
    });

    it('returns "met" when completedAt is on or before dueAt', () => {
      // Completed 30 mins before deadline
      assert.equal(getSLAStatus(new Date('2026-11-09T11:00:00Z'), due, new Date('2026-11-09T11:30:00Z'), true), 'met');
      // Completed at exact deadline
      assert.equal(getSLAStatus(new Date('2026-11-09T12:00:00Z'), due, due, true), 'met');
    });

    it('returns "breached" when completedAt is after dueAt', () => {
      assert.equal(getSLAStatus(new Date('2026-11-09T13:00:00Z'), due, new Date('2026-11-09T12:01:00Z'), true), 'breached');
    });

    it('returns "breached" when now is past dueAt and ticket is not completed', () => {
      assert.equal(getSLAStatus(new Date('2026-11-09T13:00:00Z'), due, null, true), 'breached');
    });

    it('returns "paused" when outside business hours and not breached or completed', () => {
      assert.equal(getSLAStatus(new Date('2026-11-08T12:00:00Z'), due, null, false), 'paused');
    });

    it('returns "at_risk" when remaining time is <= 60 minutes', () => {
      // 15 minutes left
      assert.equal(getSLAStatus(new Date('2026-11-09T11:45:00Z'), due, null, true), 'at_risk');
      // Exactly 60 minutes left
      assert.equal(getSLAStatus(new Date('2026-11-09T11:00:00Z'), due, null, true), 'at_risk');
    });

    it('returns "at_risk" when remaining time is <= 20% of targetMinutes', () => {
      // Target is 600 mins (10 hrs), 20% is 120 mins.
      // 90 mins remaining (more than 60 mins, but less than 20% of 600)
      const futureDue = new Date('2026-11-09T13:30:00Z');
      const current = new Date('2026-11-09T12:00:00Z'); // 90 mins remaining
      assert.equal(getSLAStatus(current, futureDue, null, true, 600), 'at_risk');
    });

    it('returns "on_track" when remaining time is > 60 minutes and > 20% of target', () => {
      // 120 minutes left (no target passed)
      assert.equal(getSLAStatus(new Date('2026-11-09T10:00:00Z'), due, null, true), 'on_track');
      // 120 minutes left with target 240 mins (20% is 48 mins, 120 > 60 and > 48)
      assert.equal(getSLAStatus(new Date('2026-11-09T10:00:00Z'), due, null, true, 240), 'on_track');
    });

    it('accepts string timestamps for dates', () => {
      assert.equal(
        getSLAStatus('2026-11-09T11:00:00Z', '2026-11-09T12:00:00Z', '2026-11-09T11:30:00Z', true),
        'met'
      );
    });
  });
});
