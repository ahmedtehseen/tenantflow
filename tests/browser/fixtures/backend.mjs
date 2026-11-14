// In-memory Supabase transport fixture. Authentication and RLS use separate tests.
import http from "node:http";
import { randomUUID } from "node:crypto";
const orgId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const memberId = "20000000-0000-4000-8000-000000000002";
const org = {
  id: orgId,
  name: "Verification Workspace",
  slug: "verification",
  created_at: "2026-11-01T00:00:00Z",
  created_by: userId,
};
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "verification@example.test",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: org.created_at,
};
const profile = {
  id: userId,
  full_name: "Verification Owner",
  email: user.email,
  avatar_url: null,
};
const memberProfile = {
  id: memberId,
  full_name: "Verification Member",
  email: "member@example.test",
  avatar_url: null,
};
const ticket = () => ({
  id: "30000000-0000-4000-8000-000000000001",
  organization_id: orgId,
  title: "Verification ticket",
  description: "Fixture description",
  status: "open",
  priority: "medium",
  created_by: userId,
  assigned_to: null,
  created_at: "2026-11-10T12:00:00Z",
  updated_at: "2026-11-10T12:00:01Z",
  first_response_due_at: null,
  first_responded_at: null,
  resolution_due_at: null,
  resolved_at: null,
  first_response_breached: false,
  resolution_breached: false,
});
const db = {
  organizations: [org],
  profiles: [profile, memberProfile],
  organization_members: [
    {
      user_id: userId,
      organization_id: orgId,
      role: "owner",
      created_at: org.created_at,
      profiles: profile,
      organizations: org,
    },
    {
      user_id: memberId,
      organization_id: orgId,
      role: "member",
      created_at: org.created_at,
      profiles: memberProfile,
      organizations: org,
    },
  ],
  tickets: [ticket()],
  ticket_activities: [],
  ticket_comments: [],
  notifications: [],
  organization_sla_policies: [],
  organization_invitations: [],
  organization_webhooks: [],
  webhook_deliveries: [],
};
const expiresAt = Math.floor(Date.now() / 1000) + 86400;
const header = Buffer.from(
  JSON.stringify({ alg: "HS256", typ: "JWT" }),
).toString("base64url");
const payload = Buffer.from(
  JSON.stringify({
    sub: userId,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    exp: expiresAt,
  }),
).toString("base64url");
const token = `${header}.${payload}.fake-signature`;
const session = {
  access_token: token,
  refresh_token: "verification-refresh",
  token_type: "bearer",
  expires_in: 86400,
  expires_at: expiresAt,
  user,
};

function send(res, status, data, extra = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,HEAD,OPTIONS",
    ...extra,
  });
  res.end(data === undefined ? "" : JSON.stringify(data));
}
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "OPTIONS") return send(res, 204);
    if (url.pathname === "/session") return send(res, 200, session);
    if (url.pathname === "/control") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const change = body ? JSON.parse(body) : {};
      if (change.reset) {
        Object.assign(db.tickets[0], ticket());
        db.ticket_activities = [];
      }
      return send(res, 200, {
        tickets: db.tickets,
        activities: db.ticket_activities,
      });
    }
    if (url.pathname === "/auth/v1/user") return send(res, 200, user);
    if (url.pathname === "/auth/v1/logout") return send(res, 204);
    if (url.pathname === "/auth/v1/token") return send(res, 200, session);
    if (url.pathname === "/auth/v1/.well-known/jwks.json")
      return send(res, 200, { keys: [] });
    if (!url.pathname.startsWith("/rest/v1/"))
      return send(res, 404, { error: "unavailable" });
    const table = url.pathname.split("/").at(-1);
    if (!db[table]) return send(res, 404, { message: "unknown table" });
    const matches = (row) =>
      [...url.searchParams].every(([key, val]) => {
        if (["select", "order", "limit", "offset"].includes(key)) return true;
        if (val.startsWith("eq.")) return String(row[key]) === val.slice(3);
        if (val === "is.null") return row[key] == null;
        if (val.startsWith("gt.")) return row[key] > val.slice(3);
        return true;
      });
    let rows = db[table].filter(matches);
    if (["POST", "PATCH"].includes(req.method)) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      if (req.method === "POST") {
        const inserted = (Array.isArray(body) ? body : [body]).map((data) => ({
          ...data,
          id: data.id || randomUUID(),
          created_at: data.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
        db[table].push(...inserted);
        rows = inserted;
      } else {
        rows.forEach((row) =>
          Object.assign(row, body, { updated_at: new Date().toISOString() }),
        );
      }
    }
    const count = rows.length;
    const limit = Number(url.searchParams.get("limit"));
    if (limit) rows = rows.slice(0, limit);
    if (url.searchParams.get("order")?.includes("created_at.desc"))
      rows = rows.toReversed();
    const single = (req.headers.accept || "").includes("vnd.pgrst.object");
    const headers = { "Content-Range": `0-${Math.max(0, count - 1)}/${count}` };
    if (req.method === "HEAD") return send(res, 200, undefined, headers);
    return send(res, 200, single ? rows[0] || null : rows, headers);
  })
  .listen(54450, "127.0.0.1", () => console.log("Verification backend ready"));
