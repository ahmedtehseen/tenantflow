"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext, assertTenantScoping } from "@/lib/data/tenant";
import {
  normalizeEmail,
  isValidEmail,
  isValidInvitationRole,
  generateInvitationToken,
} from "@/lib/invitations/invitation-utils";
import type { OrgRole, InvitationRole } from "@/types/database";

export interface ActionState {
  error?: string | null;
  success?: string | null;
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Creates a new organization with the caller as creator.
 * The DB trigger on_organization_created automatically grants the creator 'owner' role.
 */
export async function createOrganizationAction(
  prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to create an organization." };
  }

  const name = formData.get("name")?.toString().trim() ?? "";
  const rawSlug = formData.get("slug")?.toString().trim().toLowerCase() ?? "";

  if (!name || name.length < 1 || name.length > 120) {
    return { error: "Organization name must be between 1 and 120 characters." };
  }

  const slug = rawSlug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  if (!slug || slug.length < 2 || slug.length > 63 || !SLUG_REGEX.test(slug)) {
    return {
      error:
        "Slug must be 2-63 characters, lowercase alphanumeric with optional hyphens (e.g. 'acme-corp').",
    };
  }

  const { data: org, error } = await supabase
    .from("organizations")
    .insert({
      name,
      slug,
      created_by: user.id,
    })
    .select("id, slug")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        error: `The slug "${slug}" is already taken. Please choose a different slug.`,
      };
    }
    return { error: error.message || "Failed to create organization." };
  }

  revalidatePath("/", "layout");
  redirect(`/org/${org.slug}`);
}

/**
 * Updates organization details (name).
 * Requires 'owner' or 'admin' role.
 * Enforces tenant scoping and zero-knowledge isolation (ADRs 0001, 0003).
 */
export async function updateOrganizationAction(
  orgId: string,
  orgSlug: string,
  prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const context = await getTenantContext(orgSlug);
  assertTenantScoping(context, orgId);

  if (context.currentRole !== "owner" && context.currentRole !== "admin") {
    return { error: "You must be an owner or admin to update organization details." };
  }

  const name = formData.get("name")?.toString().trim() ?? "";

  if (!name || name.length < 1 || name.length > 120) {
    return { error: "Organization name must be between 1 and 120 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ name })
    .eq("id", orgId);

  if (error) {
    return { error: error.message || "Failed to update organization." };
  }

  revalidatePath(`/org/${orgSlug}`, "layout");
  return { success: "Organization updated successfully." };
}

/**
 * Deletes an organization permanently.
 * Requires 'owner' role.
 * Enforces tenant scoping and zero-knowledge isolation (ADRs 0001, 0003).
 */
export async function deleteOrganizationAction(
  orgId: string,
  orgSlug: string,
  prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const context = await getTenantContext(orgSlug);
  assertTenantScoping(context, orgId);

  if (context.currentRole !== "owner") {
    return { error: "Only owners can delete an organization." };
  }

  const confirmationSlug = formData.get("confirmation")?.toString().trim() ?? "";

  if (confirmationSlug !== orgSlug) {
    return { error: "Confirmation slug does not match." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .delete()
    .eq("id", orgId);

  if (error) {
    return { error: error.message || "Failed to delete organization." };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Creates a token-backed invitation for an email address (ADR 0002).
 * Enforces dual verification and caller role checking (owner or admin).
 * Prevents user enumeration by never probing public.profiles directly.
 */
export async function createInvitationAction(
  orgId: string,
  orgSlug: string,
  prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState & { invitationToken?: string }> {
  const context = await getTenantContext(orgSlug);
  assertTenantScoping(context, orgId);

  if (context.currentRole !== "owner" && context.currentRole !== "admin") {
    return { error: "You must be an owner or admin to invite members." };
  }

  const rawEmail = formData.get("email")?.toString() ?? "";
  const email = normalizeEmail(rawEmail);
  const rawRole = formData.get("role")?.toString().trim() ?? "member";

  if (!isValidEmail(email)) {
    return { error: "Please provide a valid email address." };
  }

  if (!isValidInvitationRole(rawRole)) {
    return { error: "Invalid role selected. Invitations can only be sent for admin or member roles." };
  }
  const role: InvitationRole = rawRole;

  const supabase = await createClient();

  // 1. Check if the user is already a member of this organization
  const { data: existingMember } = await supabase
    .from("organization_members")
    .select("user_id, profiles!inner(email)")
    .eq("organization_id", orgId)
    .ilike("profiles.email", email)
    .maybeSingle();

  if (existingMember) {
    return { error: "User is already a member of this organization." };
  }

  // 2. Check if an active, unrevoked, unexpired invitation already exists
  const nowIso = new Date().toISOString();
  const { data: existingInvite } = await supabase
    .from("organization_invitations")
    .select("id")
    .eq("organization_id", orgId)
    .ilike("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (existingInvite) {
    return { error: "An active invitation already exists for this email." };
  }

  // 3. Generate crypto token and insert invitation
  const token = generateInvitationToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: insertError } = await supabase
    .from("organization_invitations")
    .insert({
      organization_id: orgId,
      email,
      role,
      token,
      invited_by: context.user.id,
      expires_at: expiresAt,
    });

  if (insertError) {
    if (insertError.code === "23505") {
      return { error: "An active invitation already exists for this email." };
    }
    return { error: insertError.message || "Failed to create invitation." };
  }

  revalidatePath(`/org/${orgSlug}/members`, "page");
  return {
    success: `Invitation created for ${email}.`,
    invitationToken: token,
  };
}

/**
 * Revokes a pending invitation (ADR 0002).
 * Caller must be 'owner' or 'admin' of the organization.
 */
export async function revokeInvitationAction(
  invitationId: string,
  orgId: string,
  orgSlug: string,
): Promise<ActionState> {
  const context = await getTenantContext(orgSlug);
  assertTenantScoping(context, orgId);

  if (context.currentRole !== "owner" && context.currentRole !== "admin") {
    return { error: "You must be an owner or admin to revoke invitations." };
  }

  const supabase = await createClient();
  const { error: revokeError } = await supabase
    .from("organization_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("organization_id", orgId);

  if (revokeError) {
    return { error: revokeError.message || "Failed to revoke invitation." };
  }

  revalidatePath(`/org/${orgSlug}/members`, "page");
  return { success: "Invitation revoked successfully." };
}

/**
 * Accepts a pending invitation using its unique token (ADR 0002).
 * Caller must be authenticated.
 * Uses admin client to finalize membership and acceptance status.
 */
export async function acceptInvitationAction(
  token: string,
): Promise<ActionState & { orgSlug?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to accept an invitation." };
  }

  if (!token || typeof token !== "string" || !token.trim()) {
    return { error: "Invalid, expired, or revoked invitation." };
  }

  const adminClient = createAdminClient();
  const { data: invitation, error: inviteError } = await adminClient
    .from("organization_invitations")
    .select(`
      id,
      organization_id,
      email,
      role,
      token,
      expires_at,
      accepted_at,
      revoked_at,
      organizations (
        id,
        slug,
        name
      )
    `)
    .eq("token", token.trim())
    .maybeSingle();

  if (
    inviteError ||
    !invitation ||
    invitation.accepted_at !== null ||
    invitation.revoked_at !== null ||
    new Date(invitation.expires_at).getTime() <= Date.now()
  ) {
    return { error: "Invalid, expired, or revoked invitation." };
  }

  const org = Array.isArray(invitation.organizations)
    ? invitation.organizations[0]
    : invitation.organizations;

  if (!org || !org.slug) {
    return { error: "Organization not found." };
  }

  // Check if caller is already a member. If not, insert membership.
  const { data: existingMember } = await adminClient
    .from("organization_members")
    .select("role")
    .eq("organization_id", invitation.organization_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existingMember) {
    const { error: insertError } = await adminClient
      .from("organization_members")
      .insert({
        organization_id: invitation.organization_id,
        user_id: user.id,
        role: invitation.role as OrgRole,
      });

    if (insertError) {
      return { error: insertError.message || "Failed to join organization." };
    }
  }

  // Mark invitation accepted
  const { error: updateError } = await adminClient
    .from("organization_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  if (updateError) {
    return { error: updateError.message || "Failed to finalize invitation acceptance." };
  }

  revalidatePath("/", "layout");
  revalidatePath(`/org/${org.slug}`, "layout");

  return {
    success: "Joined organization successfully.",
    orgSlug: org.slug,
  };
}

/**
 * @deprecated Direct member addition via profiles query is deprecated in favor of token-based invitations (ADR 0002).
 * Delegates directly to createInvitationAction without querying public.profiles.
 */
export async function addMemberAction(
  orgId: string,
  orgSlug: string,
  prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  return createInvitationAction(orgId, orgSlug, prevState, formData);
}

/**
 * Updates a member's role.
 * Governed by tenant scoping and role authority:
 * owners can update anyone; admins cannot update owners or grant ownership.
 */
export async function updateMemberRoleAction(
  orgId: string,
  orgSlug: string,
  targetUserId: string,
  newRole: OrgRole,
): Promise<ActionState> {
  const context = await getTenantContext(orgSlug);
  assertTenantScoping(context, orgId);

  if (context.currentRole !== "owner" && context.currentRole !== "admin") {
    return { error: "You must be an owner or admin to update member roles." };
  }

  if (newRole === "owner" && context.currentRole !== "owner") {
    return { error: "Only owners can assign the owner role." };
  }

  const supabase = await createClient();

  // If caller is admin, prevent modifying an owner
  if (context.currentRole === "admin") {
    const { data: targetMember } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (targetMember?.role === "owner") {
      return { error: "Admins cannot modify an owner's role." };
    }
  }

  const { error } = await supabase
    .from("organization_members")
    .update({ role: newRole })
    .eq("organization_id", orgId)
    .eq("user_id", targetUserId);

  if (error) {
    return { error: error.message || "Failed to update member role." };
  }

  revalidatePath(`/org/${orgSlug}/members`, "page");
  return { success: `Member role updated to ${newRole}.` };
}

/**
 * Removes a member from an organization.
 * DB trigger prevent_last_owner_removal ensures at least one owner remains.
 */
export async function removeMemberAction(
  orgId: string,
  orgSlug: string,
  targetUserId: string,
): Promise<ActionState> {
  const context = await getTenantContext(orgSlug);
  assertTenantScoping(context, orgId);

  if (context.currentRole !== "owner" && context.currentRole !== "admin") {
    return { error: "You must be an owner or admin to remove members." };
  }

  const supabase = await createClient();

  // If caller is admin, prevent removing an owner
  if (context.currentRole === "admin") {
    const { data: targetMember } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (targetMember?.role === "owner") {
      return { error: "Admins cannot remove an owner." };
    }
  }

  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", orgId)
    .eq("user_id", targetUserId);

  if (error) {
    return { error: error.message || "Failed to remove member." };
  }

  revalidatePath(`/org/${orgSlug}/members`, "page");
  return { success: "Member removed from organization." };
}

/**
 * Self-removal / leaving an organization.
 */
export async function leaveOrganizationAction(
  orgId: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", orgId)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message || "Failed to leave organization." };
  }

  revalidatePath("/", "layout");
  redirect("/");
}
