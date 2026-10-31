# TenantFlow: Architecture & Context Handoff

## 1. Project Overview
- **Name:** TenantFlow
- **Stack:** Next.js 16 (App Router with Turbopack, React 19), Tailwind CSS v4, TypeScript, Supabase SSR.
- **Core Purpose:** Production-grade, multi-tenant B2B operations application with strict tenant isolation via Row Level Security (RLS).

---

## 2. Next.js 16 Breaking Changes & Conventions
- **Proxy instead of Middleware:** In Next.js 16, `middleware.ts` is deprecated and replaced by `src/proxy.ts`. The proxy file exports a named `proxy` function to refresh auth sessions on incoming requests via `@supabase/ssr`.
- **Cache Components & Suspense:** `cacheComponents` and `partialPrefetching` are enabled in `next.config.ts`. Any component reading dynamic request context (cookies, headers, `useSearchParams()`) must be wrapped within `<Suspense>` boundaries.

---

## 3. Environment Variables
Stored locally in `.env.local` (git-ignored). Template tracked in `.env.example`:
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL (`https://owkqbuypklkoaiddmnbt.supabase.co`).
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Modern Supabase publishable key (`sb_publishable_...`).
- `SUPABASE_SECRET_KEY`: Server-only secret role key (`sb_secret_...`), never exposed to client.
- `SUPABASE_JWKS_URL`: Optional JWKS endpoint for token validation.

---

## 4. Supabase Architecture & Database Design
Migration applied on remote project: `supabase/migrations/01_init_multi_tenancy.sql`

### Tables
1. **`public.profiles`**: 1:1 with `auth.users`. Automatically populated on signup via `handle_new_user()` trigger on `auth.users`.
2. **`public.organizations`**: Tenant entities (`name`, `slug`, `created_by`). Creating an organization automatically assigns the creator as an `owner` via trigger.
3. **`public.organization_members`**: Link table between users and organizations with roles:
   - Roles enum: `'owner' | 'admin' | 'member'`.
   - Prevent last owner removal trigger.
   - Immutable tenant keys trigger.
4. **`public.tickets`**: Operational tenant data (`title`, `description`, `status`, `priority`, `created_by`, `assigned_to`).
   - Assignee must belong to the organization (composite FK constraint).

### Multi-Tenancy RLS Engine
- **`get_auth_user_org_ids()`**: Security Definer function returning all organization UUIDs for `auth.uid()`, eliminating recursive policy evaluation loops.
- **`has_org_role(org_id, roles[])`**: Security Definer helper for role checks.
- All 4 tables have strict RLS policies ensuring users can only read, write, or modify data belonging to organizations they are members of.

---

## 5. Auth Architecture
- **Browser Client:** `src/lib/supabase/client.ts` (`createBrowserClient` with publishable key).
- **Server Client:** `src/lib/supabase/server.ts` (`createServerClient` reading from `next/headers`).
- **Session Refresher:** `src/lib/supabase/proxy.ts` called by `src/proxy.ts`.
- **Callback Route:** `src/app/auth/callback/route.ts` handles PKCE auth code exchange and magic link OTP verification with open-redirect protection (`safeRedirectPath`).
- **Pages & Actions:**
  - Login: `src/app/(auth)/login/`
  - Signup: `src/app/(auth)/signup/`
  - Server Actions: `src/app/(auth)/actions.ts` (`login`, `signup` using React 19 `useActionState`).
  - Home Dashboard: `src/app/page.tsx` displays active authenticated session, user profile, and tenant organizations.

---

## 6. Supabase CLI & Migrations Workflow
The project is initialized with `supabase init` and linked to remote project `owkqbuypklkoaiddmnbt`:
- Create new migration: `npx supabase migration new <name>`
- Test migration dry-run: `npx supabase db push --dry-run`
- Push migrations to remote: `npx supabase db push`
