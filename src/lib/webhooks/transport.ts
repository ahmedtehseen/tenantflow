import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isPublicAddress, validateWebhookUrl } from "#webhooks/url";
import { signWebhookPayload } from "#webhooks/signer";

export async function postWebhook(
  urlString: string,
  payload: string,
  secret: string,
  deliveryId: string,
): Promise<number> {
  const url = validateWebhookUrl(urlString);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicAddress(address))
  ) {
    throw new Error("Webhook endpoint must resolve to public IP addresses.");
  }
  // Pin this validated DNS result for the socket connection. Redirects are never followed.
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "POST",
        agent: false,
        family: address.family,
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "X-TenantFlow-Signature": signWebhookPayload(payload, secret),
          "X-TenantFlow-Delivery": deliveryId,
        },
      },
      (response) => {
        const code = response.statusCode || 0;
        response.destroy();
        resolve(code);
      },
    );
    const timer = setTimeout(
      () => req.destroy(new Error("Webhook request timed out.")),
      10000,
    );
    req.once("close", () => clearTimeout(timer));
    req.once("error", reject);
    req.end(payload);
  });
}
