import ipaddr from "ipaddr.js";

export function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.parse(address).range() === "unicast";
  } catch {
    return false;
  }
}

export function validateWebhookUrl(value: string): URL {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    (ipaddr.isValid(hostname) && !isPublicAddress(hostname))
  ) {
    throw new Error(
      "Use a public HTTPS URL without credentials or a fragment.",
    );
  }
  return url;
}
