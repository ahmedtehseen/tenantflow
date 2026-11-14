import { getCurrentUser, getTenantContext } from "@/lib/data/tenant";
import {
  loadOverview,
  loadTickets,
  loadMembers,
  loadSettings,
  loadDetail,
} from "@/lib/data/workspace";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; screen: string[] }> },
) {
  const { slug, screen } = await params;
  const headers = { "Cache-Control": "private, no-store" };
  if (!(await getCurrentUser()))
    return Response.json(
      { error: "Sign in to continue." },
      { status: 401, headers },
    );
  const context = await getTenantContext(slug);
  if (!context.currentRole)
    return Response.json(
      { error: "Workspace access has changed." },
      { status: 403, headers },
    );
  const expected = new URL(request.url).searchParams;
  if (
    expected.get("user") !== context.user.id ||
    expected.get("org") !== context.currentOrg.id
  ) {
    return Response.json(
      { error: "Workspace session has changed." },
      { status: 403, headers },
    );
  }

  try {
    let data;
    const name = screen.join("/");
    switch (name) {
      case "overview":
        data = await loadOverview(context);
        break;
      case "tickets":
        data = await loadTickets(context);
        break;
      case "members":
        data = await loadMembers(context);
        break;
      case "settings":
        data = await loadSettings(context);
        break;
      default:
        if (
          screen.length !== 2 ||
          screen[0] !== "ticket" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(screen[1])
        ) {
          return Response.json(
            { error: "Screen unavailable." },
            { status: 400, headers },
          );
        }
        data = await loadDetail(context, screen[1]);
        if (!data)
          return Response.json(
            { error: "This ticket is no longer available." },
            { status: 410, headers },
          );
    }
    return Response.json(data, { headers });
  } catch {
    return Response.json(
      { error: "Unable to refresh this screen. Try again." },
      { status: 500, headers },
    );
  }
}
