import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  Database,
  OrganizationSLAPolicy,
  TicketComment,
  Notification,
  OrganizationWebhook,
  WebhookDelivery,
  Ticket,
} from "#types/database";

describe("Database Migration 05 Schema Verification (Phase 3)", () => {
  const migrationPath = join(
    process.cwd(),
    "supabase/migrations/05_phase_3_sla_notifications_webhooks.sql",
  );

  it("ensures migration file exists", () => {
    assert.ok(
      existsSync(migrationPath),
      "Migration 05 file must exist at supabase/migrations/05_phase_3_sla_notifications_webhooks.sql",
    );
  });

  describe("Table: organization_sla_policies", () => {
    it("defines organization_sla_policies with business hours, priority minutes, and defaults", () => {
      const migration = readFileSync(migrationPath, "utf8");
      assert.match(
        migration,
        /create table (?:if not exists )?public\.organization_sla_policies/i,
      );
      assert.match(migration, /organization_id\s+uuid\s+not null/i);
      assert.match(migration, /unique/i);
      assert.match(migration, /timezone\s+text\s+not null\s+default\s+'UTC'/i);
      assert.match(
        migration,
        /business_days\s+integer\[\]\s+not null\s+default\s+'\{1,2,3,4,5\}'/i,
      );
      assert.match(
        migration,
        /business_start_time\s+time\s+not null\s+default\s+'09:00:00'/i,
      );
      assert.match(
        migration,
        /business_end_time\s+time\s+not null\s+default\s+'17:00:00'/i,
      );

      // Priority targets
      assert.match(migration, /urgent_response_minutes\s+integer\s+not null\s+default\s+60/i);
      assert.match(migration, /urgent_resolution_minutes\s+integer\s+not null\s+default\s+240/i);
      assert.match(migration, /high_response_minutes\s+integer\s+not null\s+default\s+240/i);
      assert.match(migration, /high_resolution_minutes\s+integer\s+not null\s+default\s+1440/i);
      assert.match(migration, /medium_response_minutes\s+integer\s+not null\s+default\s+480/i);
      assert.match(migration, /medium_resolution_minutes\s+integer\s+not null\s+default\s+2880/i);
      assert.match(migration, /low_response_minutes\s+integer\s+not null\s+default\s+1440/i);
      assert.match(migration, /low_resolution_minutes\s+integer\s+not null\s+default\s+4320/i);
    });

    it("enables RLS and defines member/admin access policies", () => {
      const migration = readFileSync(migrationPath, "utf8");
      assert.match(
        migration,
        /alter table public\.organization_sla_policies enable row level security/i,
      );
      assert.match(migration, /organization_sla_policies.*select/i);
      assert.match(migration, /has_org_role|user_is_member_of/i);
    });

    it("creates seed trigger and backfills existing organizations", () => {
      const migration = readFileSync(migrationPath, "utf8");
      assert.match(migration, /seed_organization_default_sla_policy/i);
      assert.match(migration, /trigger.*on_organization_created_seed_sla|trigger.*seed_sla/i);
      assert.match(
        migration,
        /insert into public\.organization_sla_policies\s*\(\s*organization_id\s*\)\s*select id from public\.organizations/i,
      );
    });
  });

  describe("Table: tickets SLA tracking columns", () => {
    it("adds SLA deadline and breach columns to public.tickets", () => {
      const migration = readFileSync(migrationPath, "utf8");
      assert.match(migration, /first_response_due_at\s+timestamptz/i);
      assert.match(migration, /resolution_due_at\s+timestamptz/i);
      assert.match(migration, /first_responded_at\s+timestamptz/i);
      assert.match(
        migration,
        /first_response_breached\s+boolean\s+not null\s+default\s+false/i,
      );
      assert.match(migration, /resolved_at\s+timestamptz/i);
      assert.match(
        migration,
        /resolution_breached\s+boolean\s+not null\s+default\s+false/i,
      );
    });
  });

  describe("Table: ticket_comments", () => {
    it("defines ticket_comments with author, content, edit tracking, and RLS", () => {
      const migration = readFileSync(migrationPath, "utf8");
      assert.match(
        migration,
        /create table (?:if not exists )?public\.ticket_comments/i,
      );
      assert.match(migration, /ticket_id\s+uuid\s+not null/i);
      assert.match(migration, /organization_id\s+uuid\s+not null/i);
      assert.match(migration, /author_id\s+uuid\s+not null/i);
      assert.match(migration, /content\s+text\s+not null/i);
      assert.match(migration, /is_edited\s+boolean\s+not null\s+default\s+false/i);
      assert.match(migration, /edited_at\s+timestamptz/i);
      assert.match(
        migration,
        /alter table public\.ticket_comments enable row level security/i,
      );
    });

    it("attaches comment deletion trigger logging to ticket_activities", () => {
      const migration = readFileSync(migrationPath, "utf8");
      assert.match(migration, /comment_deleted/i);
      assert.match(migration, /ticket_activities/i);
    });
  });

  describe("Table: notifications", () => {
    it("defines notifications table with recipient, actor, ticket reference, and RLS", () => {
      const migration = readFileSync(migrationPath, "utf8");
      assert.match(
        migration,
        /create table (?:if not exists )?public\.notifications/i,
      );
      assert.match(migration, /recipient_id\s+uuid\s+not null/i);
      assert.match(migration, /organization_id\s+uuid\s+not null/i);
      assert.match(migration, /ticket_id\s+uuid/i);
      assert.match(migration, /type\s+text\s+not null/i);
      assert.match(migration, /title\s+text\s+not null/i);
      assert.match(migration, /body\s+text\s+not null/i);
      assert.match(migration, /read_at\s+timestamptz/i);
      assert.match(
        migration,
        /alter table public\.notifications enable row level security/i,
      );
    });
  });

  describe("Tables: organization_webhooks & webhook_deliveries", () => {
    it("defines organization_webhooks with url, secret, and admin RLS", () => {
      const migration = readFileSync(migrationPath, "utf8");
      assert.match(
        migration,
        /create table (?:if not exists )?public\.organization_webhooks/i,
      );
      assert.match(migration, /url\s+text\s+not null/i);
      assert.match(migration, /secret\s+text\s+not null/i);
      assert.match(migration, /events\s+text\[\]/i);
      assert.match(
        migration,
        /alter table public\.organization_webhooks enable row level security/i,
      );
    });

    it("defines webhook_deliveries with retry fields and admin RLS", () => {
      const migration = readFileSync(migrationPath, "utf8");
      assert.match(
        migration,
        /create table (?:if not exists )?public\.webhook_deliveries/i,
      );
      assert.match(migration, /webhook_id\s+uuid\s+not null/i);
      assert.match(migration, /payload\s+jsonb\s+not null/i);
      assert.match(migration, /attempts\s+integer/i);
      assert.match(migration, /max_attempts\s+integer/i);
      assert.match(migration, /status\s+text/i);
      assert.match(migration, /next_retry_at\s+timestamptz/i);
      assert.match(
        migration,
        /alter table public\.webhook_deliveries enable row level security/i,
      );
    });
  });

  describe("Realtime Publication & Replication", () => {
    it("registers ticket_comments and notifications in supabase_realtime publication", () => {
      const migration = readFileSync(migrationPath, "utf8");
      assert.match(
        migration,
        /alter publication supabase_realtime add table.*public\.ticket_comments/i,
      );
      assert.match(
        migration,
        /alter publication supabase_realtime add table.*public\.notifications/i,
      );
    });
  });

  describe("TypeScript Schema Types Contract", () => {
    it("validates type definitions can be structurally matched", () => {
      // Type test: ensure all expected properties compile cleanly
      const mockPolicy: OrganizationSLAPolicy = {
        id: "policy-1",
        organization_id: "org-1",
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      assert.equal(mockPolicy.timezone, "UTC");

      const mockComment: TicketComment = {
        id: "comment-1",
        ticket_id: "ticket-1",
        organization_id: "org-1",
        author_id: "author-1",
        content: "Hello @[Jane](uuid-123)",
        is_edited: false,
        edited_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      assert.equal(mockComment.is_edited, false);

      const mockNotification: Notification = {
        id: "notif-1",
        organization_id: "org-1",
        recipient_id: "user-1",
        actor_id: "actor-1",
        ticket_id: "ticket-1",
        type: "ticket_assigned",
        title: "Assigned to ticket",
        body: "You have been assigned to Ticket #123",
        read_at: null,
        created_at: new Date().toISOString(),
      };
      assert.equal(mockNotification.read_at, null);

      const mockWebhook: OrganizationWebhook = {
        id: "wh-1",
        organization_id: "org-1",
        url: "https://example.com/webhook",
        secret: "whsec_12345",
        description: "Test webhook",
        events: ["ticket.created"],
        is_active: true,
        created_at: new Date().toISOString(),
      };
      assert.equal(mockWebhook.is_active, true);

      const mockDelivery: WebhookDelivery = {
        event_id: "event-1",
        claimed_until: null,
        claim_token: null,
        id: "del-1",
        webhook_id: "wh-1",
        organization_id: "org-1",
        event_type: "ticket.created",
        payload: { ticket_id: "ticket-1" },
        attempts: 1,
        max_attempts: 5,
        status: "pending",
        last_status_code: null,
        last_error: null,
        next_retry_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        delivered_at: null,
      };
      assert.equal(mockDelivery.status, "pending");

      // Verify Ticket has SLA columns
      const mockTicket: Partial<Ticket> = {
        first_response_due_at: null,
        resolution_due_at: null,
        first_responded_at: null,
        first_response_breached: false,
        resolved_at: null,
        resolution_breached: false,
      };
      assert.equal(mockTicket.first_response_breached, false);

      // Verify Database interface tables exist
      type DatabaseTables = Database["public"]["Tables"];
      type HasTables =
        & ("organization_sla_policies" extends keyof DatabaseTables ? true : false)
        & ("ticket_comments" extends keyof DatabaseTables ? true : false)
        & ("notifications" extends keyof DatabaseTables ? true : false)
        & ("organization_webhooks" extends keyof DatabaseTables ? true : false)
        & ("webhook_deliveries" extends keyof DatabaseTables ? true : false);

      const check: HasTables = true;
      assert.equal(check, true);
    });
  });
});
