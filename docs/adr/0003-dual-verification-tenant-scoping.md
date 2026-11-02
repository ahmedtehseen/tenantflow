# ADR 0003: Dual Verification for Tenant Scoping in Data Layer

## Status
Accepted

## Context
Client-invoked Server Actions (e.g. `createTicketAction`, `updateTicketAction`) receive parameters such as `orgId` and `orgSlug` from form bindings. PostgreSQL Row Level Security (RLS) restricts modifications using:
```sql
organization_id in (select public.get_auth_user_org_ids())
```
While RLS effectively prevents users from touching tenants they do not belong to, a user who is legitimately a member of multiple tenants could supply mismatched arguments (e.g. `orgSlug = "org-alpha"` and `orgId = "org-beta-uuid"`). This could lead to a confused-deputy condition where records are written into Org Beta while UI cache revalidation and routing trigger for Org Alpha.

## Decision
We enforce **Dual Verification in Application Code and Data Layer**:
1. Every tenant-scoped Server Action must resolve the active tenant context using `getTenantContext(slug)`.
2. The action explicitly asserts that the mutation's target `orgId` matches `context.currentOrg.id`.
3. If a mismatch is detected, the action fails immediately with a security exception and logs the anomaly.
4. Database RLS remains the ultimate enforcement boundary (Defense in Depth).

## Consequences
- **Positive:** Guarantees alignment between the URL tenant slug, the active user's permissions, and the mutation target.
- **Positive:** Prevents cache corruption and cross-tenant payload contamination for multi-tenant users.
- **Negative:** Requires calling `getTenantContext` inside Server Actions (mitigated by `React.cache()` request memoization).

