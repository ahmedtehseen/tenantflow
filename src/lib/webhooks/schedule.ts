import "server-only";
import { after } from "next/server";
import { dispatchPendingWebhooks } from "./dispatcher";

export function scheduleWebhookDispatch(orgId: string) {
  after(async () => {
    try {
      await dispatchPendingWebhooks(orgId);
    } catch {
      console.error("Webhook dispatch deferred to background worker", {
        orgId,
      });
    }
  });
}
