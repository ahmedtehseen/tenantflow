import { verifyCronAuthorization } from "@/lib/cron/authorization";
import { processBackgroundJobs } from "@/lib/cron/background-jobs";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!verifyCronAuthorization(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await processBackgroundJobs());
  } catch (error) {
    console.error("Background processing failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return Response.json(
      { error: "Background processing failed. Pending jobs will be retried." },
      { status: 500 },
    );
  }
}

// GET supports schedulers that issue GET requests, including Vercel Cron.
export const GET = POST;
