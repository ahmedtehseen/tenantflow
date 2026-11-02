import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrgRole } from "@/types/database";
import { resolveTenantAccess } from "./scoping";

export {
  TenantScopingError,
  assertTenantScoping,
  resolveTenantAccess,
  type TenantAccessDecision,
} from "./scoping";

export interface TenantOrgSummary {
  id: string;
  name: string;
  slug: string;
  created_by: string | null;
  created_at: string;
  role: OrgRole;
}

export interface TenantContext {
  user: {
    id: string;
    email?: string;
  };
  currentOrg: {
    id: string;
    name: string;
    slug: string;
    created_by: string | null;
    created_at: string;
  };
  currentRole: OrgRole;
  organizations: TenantOrgSummary[];
  profile: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

/**
 * Request-memoized current user retriever.
 * Ensures auth.getUser() runs at most once per incoming request.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Request-memoized tenant resolver.
 * Collapses 5 sequential network round-trips into a single joined query,
 * and caches the result for all layouts and pages in the current request.
 */
export const getTenantContext = cache(
  async (slug: string): Promise<TenantContext> => {
    const supabase = await createClient();
    const user = await getCurrentUser();

    if (!user) {
      redirect(`/login?next=/org/${slug}`);
    }

    // Single joined query: fetches all organizations the user belongs to,
    // their roles, and organization metadata in ONE network trip.
    const [membershipsResult, profileResult] = await Promise.all([
      supabase
        .from("organization_members")
        .select(`
          role,
          organizations (
            id,
            name,
            slug,
            created_by,
            created_at
          )
        `)
        .eq("user_id", user.id),
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    const userMemberships = membershipsResult.data || [];

    // Parse and flatten organizations list
    const organizations: TenantOrgSummary[] = userMemberships
      .map((m) => {
        const org = Array.isArray(m.organizations)
          ? m.organizations[0]
          : m.organizations;
        if (!org) return null;
        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          created_by: org.created_by,
          created_at: org.created_at,
          role: m.role as OrgRole,
        };
      })
      .filter((o): o is TenantOrgSummary => o !== null);

    // Resolve the current organization from in-memory membership list (0ms)
    const activeOrg = organizations.find((o) => o.slug === slug);

    if (activeOrg) {
      return {
        user: {
          id: user.id,
          email: user.email,
        },
        currentOrg: {
          id: activeOrg.id,
          name: activeOrg.name,
          slug: activeOrg.slug,
          created_by: activeOrg.created_by,
          created_at: activeOrg.created_at,
        },
        currentRole: activeOrg.role,
        organizations,
        profile: profileResult.data ?? null,
      };
    }

    // If not found in user's memberships, check if org exists globally via admin client
    // to enforce zero-knowledge isolation (ADR 0001).
    const adminClient = createAdminClient();
    const { data: globalOrg } = await adminClient
      .from("organizations")
      .select("id, name, slug, created_by, created_at, is_public_directory")
      .eq("slug", slug)
      .maybeSingle();

    const access = resolveTenantAccess(false, globalOrg?.is_public_directory ?? false);

    if (access === "not_found" || !globalOrg) {
      notFound();
    }

    // Org exists and is in the public directory, but user is not a member ->
    // return context with null role so layout displays 403 Access Denied screen.
    return {
      user: {
        id: user.id,
        email: user.email,
      },
      currentOrg: {
        id: globalOrg.id,
        name: globalOrg.name,
        slug: globalOrg.slug,
        created_by: globalOrg.created_by,
        created_at: globalOrg.created_at,
      },
      currentRole: null as unknown as OrgRole,
      organizations,
      profile: profileResult.data ?? null,
    };
  },
);

