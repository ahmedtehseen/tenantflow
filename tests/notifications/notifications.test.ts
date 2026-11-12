import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getNotificationInbox } from "#notifications/notification-service";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("Notification inbox", () => {
  function client(failed = false) {
    const filters: unknown[][] = [];
    const query = {
      select(...args: unknown[]) {
        filters.push(["select", ...args]);
        return this;
      },
      eq(...args: unknown[]) {
        filters.push(["eq", ...args]);
        return this;
      },
      is(...args: unknown[]) {
        filters.push(["is", ...args]);
        return this;
      },
      order() {
        return this;
      },
      limit() {
        return this;
      },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve(
          resolve({
            data: [{ id: "notification" }],
            count: 42,
            error: failed ? {} : null,
          }),
        );
      },
    };
    return {
      db: {
        from() {
          return query;
        },
      } as unknown as SupabaseClient,
      filters,
    };
  }
  it("loads recent notifications and counts every unread notification within the tenant and recipient", async () => {
    const { db, filters } = client();
    const inbox = await getNotificationInbox(db, "org", "user");
    assert.equal(inbox.unread, 42);
    assert.equal(inbox.items[0].id, "notification");
    assert.equal(
      filters.filter(
        (entry) => entry[1] === "organization_id" && entry[2] === "org",
      ).length,
      2,
    );
    assert.equal(
      filters.filter(
        (entry) => entry[1] === "recipient_id" && entry[2] === "user",
      ).length,
      2,
    );
    assert.ok(
      filters.some((entry) => entry[0] === "is" && entry[1] === "read_at"),
    );
  });
  it("surfaces failed queries", async () => {
    await assert.rejects(
      getNotificationInbox(client(true).db, "org", "user"),
      /Unable to load/,
    );
  });
});

it("authenticates realtime before joining early-mounted subscriptions", async () => {
  const { readFileSync } = await import("node:fs");
  for (const file of [
    "src/hooks/use-notifications-realtime.ts",
    "src/app/org/[slug]/tickets/[ticketId]/_components/ticket-comments.tsx",
  ]) {
    const source = readFileSync(file, "utf8");
    const authenticated = source.indexOf("await client.realtime.setAuth()");
    const subscribed = source.indexOf("channel.subscribe(");
    assert.ok(
      authenticated >= 0 && subscribed > authenticated,
      `${file} must await Realtime authentication before joining`,
    );
  }
});
