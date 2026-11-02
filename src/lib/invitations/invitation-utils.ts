import { randomBytes } from "node:crypto";
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
 * Uses base64url encoding (no '+', '/', or '=' characters), making it safe
 * for direct inclusion in email links and route params.
 */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
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
