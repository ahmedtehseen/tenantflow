"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrgRole } from "@/types/database";

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
 * Requires 'owner' or 'admin' role (enforced by RLS).
 */
export async function updateOrganizationAction(
  orgId: string,
  orgSlug: string,
  prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const name = formData.get("name")?.toString().trim() ?? "";

  if (!name || name.length < 1 || name.length > 120) {
    return { error: "Organization name must be between 1 and 120 characters." };
  }

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
 * Requires 'owner' role (enforced by RLS).
 */
export async function deleteOrganizationAction(
  orgId: string,
  orgSlug: string,
  prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const confirmationSlug = formData.get("confirmation")?.toString().trim() ?? "";

  if (confirmationSlug !== orgSlug) {
    return { error: "Confirmation slug does not match." };
  }

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
 * Adds an existing registered user to an organization by email.
 * Requires caller to be 'owner' or 'admin'.
 */
export async function addMemberAction(
  orgId: string,
  orgSlug: string,
  prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";
  const role = (formData.get("role")?.toString().trim() ?? "member") as OrgRole;

  if (!email || !email.includes("@")) {
    return { error: "Please provide a valid email address." };
  }

  if (!["owner", "admin", "member"].includes(role)) {
    return { error: "Invalid role selected." };
  }

  // 1. Check caller's role in the organization
  const { data: callerMember } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .single();

  if (!callerMember || (callerMember.role !== "owner" && callerMember.role !== "admin")) {
    return { error: "You must be an owner or admin to add members." };
  }

  if (role === "owner" && callerMember.role !== "owner") {
    return { error: "Only owners can assign the owner role." };
  }

  // 2. Lookup the target profile using admin client (bypasses RLS to search across all registered profiles)
  const adminClient = createAdminClient();
  const { data: targetProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, email, full_name")
    .ilike("email", email)
    .maybeSingle();

  if (profileError || !targetProfile) {
    return {
      error: `No registered account found with email "${email}". Ask them to create a TenantFlow account first.`,
    };
  }

  // 3. Check if already a member
  const { data: existingMember } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", targetProfile.id)
    .maybeSingle();

  if (existingMember) {
    return { error: `"${email}" is already a member of this organization.` };
  }

  // 4. Insert membership
  const { error: insertError } = await supabase
    .from("organization_members")
    .insert({
      organization_id: orgId,
      user_id: targetProfile.id,
      role,
    });

  if (insertError) {
    return { error: insertError.message || "Failed to add member." };
  }

  revalidatePath(`/org/${orgSlug}/members`, "page");
  return {
    success: `Added ${targetProfile.full_name || targetProfile.email} as ${role}.`,
  };
}

/**
 * Updates a member's role.
 * Governed by RLS: owners can update anyone; admins cannot update owners or grant ownership.
 */
export async function updateMemberRoleAction(
  orgId: string,
  orgSlug: string,
  targetUserId: string,
  newRole: OrgRole,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
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

