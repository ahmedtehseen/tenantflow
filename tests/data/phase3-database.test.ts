import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Exercise actual PostgreSQL functions, triggers, privileges, and RLS without a hosted database.
describe("Phase 3 transactional database behavior", () => {
  let db: PGlite;
  const owner = "11111111-1111-1111-1111-111111111111";
  const member = "22222222-2222-2222-2222-222222222222";
  const outsider = "33333333-3333-3333-3333-333333333333";
  const org = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const otherOrg = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const ticket = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const comment = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  let deliveryId: string;
  async function scalar(sql: string): Promise<number> {
    const result = await db.query<{ count: string }>(sql);
    return Number(result.rows[0].count);
  }
  async function asUser(user: string, sql: string) {
    await db.exec(
      `set role authenticated; set request.jwt.claim.sub = '${user}';`,
    );
    try {
      return await db.exec(sql);
    } finally {
      await db.exec("reset role; reset request.jwt.claim.sub;");
    }
  }
  before(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; grant usage on schema auth to authenticated;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
      alter default privileges in schema public grant all on tables to authenticated, service_role;
      create publication supabase_realtime;
      create schema realtime;
      grant usage on schema realtime to authenticated;
      create table realtime.messages(topic text, extension text, event text, payload jsonb, private boolean);
      alter table realtime.messages enable row level security;
      grant select on realtime.messages to authenticated;
      create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic', true)$$;
      create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void language sql as
        $$insert into realtime.messages values (topic, 'broadcast', event, payload, private)$$;`);
    for (const name of readdirSync(
      join(process.cwd(), "supabase/migrations"),
    ).sort()) {
      const sql = readFileSync(
        join(process.cwd(), "supabase/migrations", name),
        "utf8",
      ).replace(/create extension if not exists "?pgcrypto"?[^;]*;/gi, "");
      await db.exec(sql);
    }
    await db.exec(`insert into auth.users(id,email) values ('${owner}','owner@example.com'),('${member}','member@example.com'),('${outsider}','outsider@example.com');
      insert into public.organizations(id,name,slug,created_by) values ('${org}','Alpha','alpha','${owner}'),('${otherOrg}','Beta','beta','${outsider}');
      insert into public.organization_members(organization_id,user_id,role) values ('${org}','${member}','member');
      insert into public.organization_webhooks(organization_id,url,secret) values ('${org}','https://example.com/hook','test-secret');`);
    await asUser(
      owner,
      `insert into public.tickets(id,organization_id,title,created_by,assigned_to) values ('${ticket}','${org}','Example ticket','${owner}','${member}');`,
    );
  });
  after(async () => {
    await db?.close();
  });

  it("sends private workspace change hints for all workspace tables", async () => {
    const result = await db.query<{ table_name: string }>(`
      select distinct payload->>'table' as table_name from realtime.messages
      where topic='workspace:${org}' and private and event='workspace_changed'
    `);
    assert.ok(result.rows.some((row) => row.table_name === "organizations"));
    assert.ok(
      result.rows.some((row) => row.table_name === "organization_members"),
    );
    assert.ok(
      result.rows.some((row) => row.table_name === "organization_sla_policies"),
    );
    assert.ok(
      result.rows.some((row) => row.table_name === "organization_webhooks"),
    );
    assert.ok(result.rows.some((row) => row.table_name === "tickets"));
    assert.equal(
      await scalar(
        `select count(*) from pg_trigger where tgname='workspace_realtime_changed' and not tgisinternal`,
      ),
      8,
    );
    assert.equal(
      await scalar(
        `select count(*) from realtime.messages where payload - 'table' <> '{}'::jsonb`,
      ),
      0,
    );
  });

  it("authorizes workspace hints by membership and prevents client publishing", async () => {
    await db.exec(
      `set role authenticated; set request.jwt.claim.sub='${member}'; set realtime.topic='workspace:${org}';`,
    );
    try {
      assert.ok((await scalar(`select count(*) from realtime.messages`)) > 0);
      await db.exec(`set realtime.topic='workspace:${otherOrg}';`);
      assert.equal(await scalar(`select count(*) from realtime.messages`), 0);
      await assert.rejects(
        db.exec(
          `select realtime.send('{}','workspace_changed','workspace:${org}',true);`,
        ),
      );
    } finally {
      await db.exec(
        "reset role; reset request.jwt.claim.sub; reset realtime.topic;",
      );
    }
    const privilege = await db.query<{ allowed: boolean }>(
      `select has_function_privilege('authenticated', 'public.notify_workspace_changed()', 'execute') as allowed`,
    );
    assert.equal(privilege.rows[0].allowed, false);
  });

  it("sends a private scoped hint when an invitation is deleted", async () => {
    await db.exec(`insert into public.organization_invitations(organization_id,email,role,token,invited_by)
      values ('${org}','delete-test@example.com','member','delete-test-token','${owner}');`);
    await db.exec("delete from realtime.messages;");
    await db.exec(
      `delete from public.organization_invitations where token='delete-test-token';`,
    );
    const result = await db.query<{
      topic: string;
      payload: { table: string };
      private: boolean;
    }>("select topic,payload,private from realtime.messages");
    assert.deepEqual(result.rows, [
      {
        topic: `workspace:${org}`,
        payload: { table: "organization_invitations" },
        private: true,
      },
    ]);
  });

  it("queues assignment notifications and a webhook atomically with ticket creation", async () => {
    assert.equal(
      await scalar(
        `select count(*) from public.notifications where type='ticket_assigned' and recipient_id='${member}'`,
      ),
      1,
    );
    assert.equal(
      await scalar(
        `select count(*) from public.notifications where recipient_id='${owner}'`,
      ),
      0,
    );
    assert.equal(
      await scalar(
        `select count(*) from public.webhook_deliveries where event_type='ticket.created'`,
      ),
      1,
    );
    const delivery = await db.query<{ id: string }>(
      `select id from public.webhook_deliveries limit 1`,
    );
    deliveryId = delivery.rows[0].id;
  });
  it("notifies unique same-organization mentions while excluding self and outsiders", async () => {
    await asUser(
      owner,
      `insert into public.ticket_comments(id,ticket_id,organization_id,author_id,content) values ('${comment}','${ticket}','${org}','${owner}',
      'Hi @[Member](${member}) @[Member](${member}) @[Self](${owner}) @[Other](${outsider}) @[Bad](aaa)');`,
    );
    assert.equal(
      await scalar(
        `select count(*) from public.notifications where type='mention' and recipient_id='${member}'`,
      ),
      1,
    );
    assert.equal(
      await scalar(
        `select count(*) from public.notifications where type='mention' and recipient_id in ('${owner}','${outsider}')`,
      ),
      0,
    );
    assert.equal(
      await scalar(
        `select count(*) from public.webhook_deliveries where event_type='ticket.commented'`,
      ),
      1,
    );
  });
  it("rejects cross-tenant comments even from a caller who belongs to both organizations", async () => {
    await db.exec(
      `insert into public.organization_members(organization_id,user_id,role) values ('${otherOrg}','${owner}','member');`,
    );
    await assert.rejects(
      asUser(
        owner,
        `insert into public.ticket_comments(ticket_id,organization_id,author_id,content) values ('${ticket}','${otherOrg}','${owner}','cross tenant');`,
      ),
    );
  });
  it("limits comment editing to the author and prevents identity reassignment", async () => {
    await asUser(
      member,
      `update public.ticket_comments set content='unauthorized' where id='${comment}';`,
    );
    assert.equal(
      await scalar(
        `select count(*) from public.ticket_comments where id='${comment}' and content='unauthorized'`,
      ),
      0,
    );
    await assert.rejects(
      asUser(
        owner,
        `update public.ticket_comments set ticket_id=gen_random_uuid() where id='${comment}';`,
      ),
    );
    await asUser(
      owner,
      `update public.ticket_comments set content='Edited' where id='${comment}';`,
    );
    assert.equal(
      await scalar(
        `select count(*) from public.ticket_comments where id='${comment}' and is_edited and edited_at is not null`,
      ),
      1,
    );
  });
  it("lets recipients mark read without forging notifications or changing their content", async () => {
    await assert.rejects(
      asUser(member, `update public.notifications set body='forged';`),
    );
    await assert.rejects(
      asUser(
        member,
        `insert into public.notifications(organization_id,recipient_id,type,title,body) values ('${org}','${owner}','mention','forged','forged');`,
      ),
    );
    await asUser(
      member,
      `update public.notifications set read_at=now() where organization_id='${org}';`,
    );
    assert.equal(
      await scalar(
        `select count(*) from public.notifications where recipient_id='${member}' and read_at is null`,
      ),
      0,
    );
    const visible = await asUser(
      outsider,
      "select * from public.notifications;",
    );
    assert.equal(visible[0].rows.length, 0);
  });
  it("excludes status-change actors and deduplicates the author/assignee", async () => {
    await asUser(
      member,
      `update public.tickets set status='in_progress' where id='${ticket}';`,
    );
    assert.equal(
      await scalar(
        `select count(*) from public.notifications where type='status_changed' and recipient_id='${owner}'`,
      ),
      1,
    );
    assert.equal(
      await scalar(
        `select count(*) from public.notifications where type='status_changed' and recipient_id='${member}'`,
      ),
      0,
    );
  });
  it("freezes breach sweeps outside business hours and emits each breach once", async () => {
    await db.exec(
      `update public.tickets set first_response_due_at='2026-11-06T17:00:00Z',resolution_due_at=null where id='${ticket}';`,
    );
    await db.query(
      `select public.process_sla_breaches('2026-11-07T12:00:00Z');`,
    );
    assert.equal(
      await scalar(
        `select count(*) from public.ticket_activities where activity_type='sla_breached'`,
      ),
      0,
    );
    await db.query(
      `select public.process_sla_breaches('2026-11-09T09:01:00Z');`,
    );
    await db.query(
      `select public.process_sla_breaches('2026-11-09T09:02:00Z');`,
    );
    assert.equal(
      await scalar(
        `select count(*) from public.ticket_activities where activity_type='sla_breached'`,
      ),
      1,
    );
    assert.equal(
      await scalar(
        `select count(*) from public.notifications where type='sla_breached' and recipient_id='${member}'`,
      ),
      1,
    );
    assert.equal(
      await scalar(
        `select count(*) from public.webhook_deliveries where event_type='sla.breached'`,
      ),
      1,
    );
  });
  it("prevents overlapping delivery claims and reserves attempts before network work", async () => {
    const first = await db.query(
      `select * from public.claim_webhook_delivery('${deliveryId}',gen_random_uuid());`,
    );
    const second = await db.query(
      `select * from public.claim_webhook_delivery('${deliveryId}',gen_random_uuid());`,
    );
    assert.equal(first.rows.length, 1);
    assert.equal(second.rows.length, 0);
    assert.equal(
      await scalar(
        `select attempts as count from public.webhook_deliveries where id='${deliveryId}'`,
      ),
      1,
    );
    await assert.rejects(
      asUser(
        owner,
        `select public.claim_webhook_delivery('${deliveryId}',gen_random_uuid());`,
      ),
    );
  });
  it("deduplicates SLA warnings and routes unassigned tickets to administrators", async () => {
    await db.exec(
      `update public.tickets set assigned_to=null, resolution_due_at='2026-11-10T12:00:00Z' where id='${ticket}';`,
    );
    await db.query(
      `select public.notify_sla_at_risk('${ticket}','resolution','2026-11-10T12:00:00Z');`,
    );
    await db.query(
      `select public.notify_sla_at_risk('${ticket}','resolution','2026-11-10T12:00:00Z');`,
    );
    await db.query(
      `select public.notify_sla_at_risk('${ticket}','resolution','2026-11-11T12:00:00Z');`,
    );
    assert.equal(
      await scalar(
        `select count(*) from public.notifications where type='sla_at_risk' and recipient_id='${owner}'`,
      ),
      1,
    );
    assert.equal(
      await scalar(
        `select count(*) from public.notifications where type='sla_at_risk' and recipient_id='${member}'`,
      ),
      0,
    );
  });
  it("stops interrupted attempts at the configured maximum", async () => {
    await db.exec(
      `update public.webhook_deliveries set attempts=max_attempts,claimed_until=now()-interval '1 minute' where id='${deliveryId}';`,
    );
    const result = await db.query(
      `select * from public.claim_webhook_delivery('${deliveryId}',gen_random_uuid());`,
    );
    assert.equal(result.rows.length, 0);
    assert.equal(
      await scalar(
        `select count(*) from public.webhook_deliveries where id='${deliveryId}' and status='failed'`,
      ),
      1,
    );
  });
  it("rejects invalid policy windows and nonpositive targets", async () => {
    await assert.rejects(
      db.exec(
        `update public.organization_sla_policies set business_days='{}' where organization_id='${org}';`,
      ),
    );
    await assert.rejects(
      db.exec(
        `update public.organization_sla_policies set business_start_time='18:00' where organization_id='${org}';`,
      ),
    );
    await assert.rejects(
      db.exec(
        `update public.organization_sla_policies set urgent_response_minutes=0 where organization_id='${org}';`,
      ),
    );
  });
  it("audits moderator deletion and permits parent cascade deletion", async () => {
    await asUser(
      member,
      `delete from public.ticket_comments where id='${comment}';`,
    );
    assert.equal(
      await scalar(
        `select count(*) from public.ticket_comments where id='${comment}'`,
      ),
      1,
    );
    await asUser(
      owner,
      `delete from public.ticket_comments where id='${comment}';`,
    );
    assert.equal(
      await scalar(
        `select count(*) from public.ticket_activities where activity_type='comment_deleted'`,
      ),
      1,
    );
    await asUser(
      owner,
      `insert into public.ticket_comments(ticket_id,organization_id,author_id,content) values ('${ticket}','${org}','${owner}','Cascade test');`,
    );
    await asUser(owner, `delete from public.tickets where id='${ticket}';`);
    assert.equal(
      await scalar(`select count(*) from public.ticket_comments`),
      0,
    );
  });
});
