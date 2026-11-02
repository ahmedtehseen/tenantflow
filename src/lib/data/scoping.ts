/**
 * Tenant scoping and zero-knowledge access resolution helpers (ADRs 0001, 0003).
 *
 * Extracted into a standalone module without "server-only" or Next.js runtime bindings
 * so it can be verified in headless Node.js unit tests and shared across data layers.
 */

export class TenantScopingError extends Error {
  constructor(message = "Cross-tenant operation rejected: Tenant context mismatch.") {
    super(message);
    this.name = "TenantScopingError";
  }
}

export type TenantAccessDecision = "allow" | "forbidden" | "not_found";

/**
 * Asserts that the mutation or query target organization ID strictly matches
 * the organization resolved in the active tenant context.
 *
 * Implements ADR 0003: Dual Verification for Tenant Scoping in Data Layer.
 * Prevents confused-deputy cross-tenant mutations in Server Actions.
 */
export function assertTenantScoping(
  context: { currentOrg?: { id: string } | null },
  targetOrgId: string,
): void {
  if (!context.currentOrg || context.currentOrg.id !== targetOrgId) {
    throw new TenantScopingError(
      `Tenant scoping violation: Active context org (${context.currentOrg?.id}) does not match target org (${targetOrgId}).`,
    );
  }
}

/**
 * Resolves access status based on tenant membership and public directory visibility.
 *
 * Implements ADR 0001: Zero-Knowledge Tenant Enumeration Defense via Opt-In Public Directory.
 * - Active members always receive 'allow'.
 * - Non-members for public directory tenants receive 'forbidden' (renders 403 Access Denied).
 * - Non-members for private directory tenants receive 'not_found' (renders 404 Not Found),
 *   completely concealing tenant existence from unauthorized actors.
 */
export function resolveTenantAccess(
  isMember: boolean,
  isPublicDirectory: boolean,
): TenantAccessDecision {
  if (isMember) {
    return "allow";
  }
  if (isPublicDirectory) {
    return "forbidden";
  }
  return "not_found";
}
