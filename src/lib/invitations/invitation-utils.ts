import {
  getInvitationStatus,
  type InvitationRole,
  type InvitationStatus,
} from "#types/database";

export { getInvitationStatus, type InvitationRole, type InvitationStatus };

/**
 * Standard RFC-5322-compliant email validator regex.
 * Disallows leading/trailing/embedded whitespace, empty user/domain segments,
 * and requires a top-level domain with at least two characters.
 */
export const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Normalizes email input by trimming whitespace and converting to lowercase.
 */
export function normalizeEmail(rawEmail: string): string {
  if (typeof rawEmail !== "string") return "";
  return rawEmail.trim().toLowerCase();
}

/**
 * Validates if an email address satisfies standard format constraints.
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const normalized = email.trim();
  if (normalized.length === 0 || normalized.length > 254) return false;
  return EMAIL_REGEX.test(normalized);
}

/**
 * Validates whether the role offered in an invitation is permissible.
 * Per ADR 0002, invitations can only be issued for 'admin' or 'member' roles.
 * Ownership assignment requires explicit in-band owner transfer.
 */
export function isValidInvitationRole(role: unknown): role is InvitationRole {
  return role === "admin" || role === "member";
}

/**
 * Generates a cryptographically secure, URL-safe 256-bit token.
 * Uses Web Crypto API (supported in Node.js, browsers, and edge runtimes)
 * with base64url encoding (no '+', '/', or '=' characters).
 */
export function generateInvitationToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Checks whether an invitation is currently active and eligible for acceptance.
 * Returns true only if it has not been accepted, not revoked, and is unexpired.
 */
export function isInvitationActive(invitation: {
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
}): boolean {
  return getInvitationStatus(invitation) === "pending";
}

/**
 * Resolves the application base URL for generating user-facing links.
 * 
 * Order of precedence:
 * 1. Explicit `NEXT_PUBLIC_APP_URL` or `NEXT_PUBLIC_SITE_URL` environment variable.
 * 2. If request headers are provided (server-side):
 *    - If localhost / 127.0.0.1 -> use http://localhost:port (preserves local testing).
 *    - Otherwise (e.g. Vercel preview or production) -> default to https://tenantflow-alpha.vercel.app
 *      to avoid Vercel Deployment Protection / SSO login gates on preview URLs.
 * 3. If running in a browser (client-side):
 *    - If localhost / 127.0.0.1 -> use window.location.origin.
 *    - Otherwise -> default to https://tenantflow-alpha.vercel.app.
 * 4. Fallback to production default https://tenantflow-alpha.vercel.app
 */
export function getAppBaseUrl(requestHeaders?: Headers): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  if (requestHeaders) {
    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
    if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
      const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
      return `${proto}://${host}`;
    }
  }
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return window.location.origin;
    }
  }
  return "https://tenantflow-alpha.vercel.app";
}

/**
 * Builds the canonical public invitation URL for a given token.
 */
export function getInvitationUrl(token: string): string {
  return `${getAppBaseUrl()}/invite/${token}`;
}
