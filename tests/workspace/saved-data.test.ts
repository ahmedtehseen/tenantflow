import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applySavedPolicy,
  applySavedWebhook,
  applySavedTicket,
  applySavedOrganization,
} from "#workspace/saved-data";
import type {
  Ticket,
  OrganizationSLAPolicy,
  OrganizationWebhook,
} from "#types/database";
import type {
  TicketsData,
  DetailData,
  SettingsData,
} from "@/lib/data/workspace";

const org = {
  id: "org",
  name: "Before",
  slug: "example",
  created_by: "owner",
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-13T10:00:00Z",
};
const ticket: Ticket = {
  id: "ticket",
  organization_id: org.id,
  title: "Before",
  description: null,
  status: "open",
  priority: "medium",
  created_by: "owner",
  assigned_to: null,
  first_response_due_at: null,
  resolution_due_at: null,
  first_responded_at: null,
  first_response_breached: false,
  resolved_at: null,
  resolution_breached: false,
  created_at: org.created_at,
  updated_at: org.updated_at,
};
const tickets: TicketsData = {
  org,
  user: { id: "owner" },
  profile: null,
  currentRole: "owner",
  tickets: [ticket],
  memberOptions: [
    { user_id: "member", full_name: "Member", email: "member@example.com" },
  ],
};
const detail: DetailData = {
  org,
  user: tickets.user,
  profile: null,
  currentRole: "owner",
  ticket,
  creatorProfile: null,
  assigneeProfile: null,
  memberOptions: tickets.memberOptions,
  activities: [],
};

test("confirmed ticket writes update detail and List cache before a failed read", () => {
  const saved: Ticket = {
    ...ticket,
    title: "Saved",
    status: "in_progress",
    assigned_to: "member",
    updated_at: "2026-11-13T11:00:00Z",
  };
  const list = applySavedTicket(tickets, saved) as TicketsData;
  const result = applySavedTicket(detail, saved) as DetailData;
  assert.equal(list.tickets[0].title, "Saved");
  assert.equal(list.tickets[0].status, "in_progress");
  assert.equal(list.tickets[0].assignee?.full_name, "Member");
  assert.equal(result.ticket.title, "Saved");
  assert.equal(result.assigneeProfile?.id, "member");
  assert.equal(tickets.tickets[0].title, "Before");
});

test("confirmed writes preserve newer snapshots and tenant isolation", () => {
  const older = {
    ...ticket,
    title: "Older",
    updated_at: "2026-11-13T09:00:00Z",
  };
  assert.equal(
    (applySavedTicket(detail, older) as DetailData).ticket.title,
    "Before",
  );
  assert.equal(
    (applySavedTicket(tickets, older) as TicketsData).tickets[0].title,
    "Before",
  );
  assert.equal(
    applySavedTicket(detail, { ...ticket, organization_id: "foreign" }),
    detail,
  );
  assert.equal(applySavedTicket(undefined, ticket), undefined);
});

test("confirmed organization writes remain visible with read failures", () => {
  const saved = {
    ...org,
    name: "Saved organization",
    updated_at: "2026-11-13T11:00:00Z",
  };
  const result = applySavedOrganization(tickets, saved) as TicketsData;
  assert.equal(result.org.name, "Saved organization");
  assert.equal(applySavedOrganization(result, org), result);
  assert.equal(
    applySavedOrganization(tickets, { ...saved, id: "foreign" }),
    tickets,
  );
  assert.equal(applySavedOrganization(undefined, saved), undefined);
});

test("confirmed settings values survive read failures and preserve organization scope", () => {
  const policy: OrganizationSLAPolicy = {
    id: "policy",
    organization_id: org.id,
    timezone: "UTC",
    business_days: [1, 2, 3, 4, 5],
    business_start_time: "09:00",
    business_end_time: "17:00",
    urgent_response_minutes: 30,
    urgent_resolution_minutes: 120,
    high_response_minutes: 60,
    high_resolution_minutes: 240,
    medium_response_minutes: 120,
    medium_resolution_minutes: 480,
    low_response_minutes: 240,
    low_resolution_minutes: 960,
    created_at: org.created_at,
    updated_at: org.updated_at,
  };
  const settings: SettingsData = {
    org,
    currentRole: "owner",
    canManage: true,
    policy,
    webhooks: [],
    deliveries: [],
  };
  const saved = {
    ...policy,
    timezone: "Asia/Karachi",
    updated_at: "2026-11-13T11:00:00Z",
  };
  const result = applySavedPolicy(settings, saved) as SettingsData;
  assert.equal(result.policy.timezone, "Asia/Karachi");
  assert.equal(applySavedPolicy(result, policy), result);
  assert.equal(
    applySavedPolicy(settings, { ...saved, organization_id: "foreign" }),
    settings,
  );
  const webhook: OrganizationWebhook = {
    id: "webhook",
    organization_id: org.id,
    url: "https://example.com/hook",
    secret: "fixture",
    events: ["ticket.created"],
    is_active: true,
    description: null,
    created_at: org.created_at,
  };
  const created = applySavedWebhook(settings, webhook) as SettingsData;
  const updated = applySavedWebhook(created, {
    ...webhook,
    description: "Saved",
  }) as SettingsData;
  assert.equal(updated.webhooks.length, 1);
  assert.equal(updated.webhooks[0].description, "Saved");
  assert.equal(
    applySavedWebhook(settings, { ...webhook, organization_id: "foreign" }),
    settings,
  );
});
