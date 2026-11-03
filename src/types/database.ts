export type OrgRole = "owner" | "admin" | "member";
export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type InvitationRole = "admin" | "member";
export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_by: string | null;
  is_public_directory: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationInsert {
  name: string;
  slug: string;
  created_by?: string | null;
  is_public_directory?: boolean;
}

export interface OrganizationUpdate {
  name?: string;
  slug?: string;
  created_by?: string | null;
  is_public_directory?: boolean;
}

export interface OrganizationMember {
  organization_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
  organizations?: Organization;
}

export interface OrganizationInvitation {
  id: string;
  organization_id: string;
  email: string;
  role: InvitationRole;
  token: string;
  invited_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  organization?: Organization;
  inviter?: Profile;
}

export interface OrganizationInvitationInsert {
  organization_id: string;
  email: string;
  role: InvitationRole;
  token: string;
  invited_by: string;
  expires_at?: string;
}

export interface OrganizationInvitationUpdate {
  accepted_at?: string | null;
  revoked_at?: string | null;
}

/**
 * Derives the active status of an invitation based on acceptance,
 * revocation timestamps and expiry date.
 */
export function getInvitationStatus(invitation: {
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
}): InvitationStatus {
  if (invitation.accepted_at) return "accepted";
  if (invitation.revoked_at) return "revoked";
  if (new Date(invitation.expires_at).getTime() <= Date.now()) return "expired";
  return "pending";
}

export interface Ticket {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  created_by: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  creator?: Profile;
  assignee?: Profile;
}

export type TicketActivityType =
  | "created"
  | "status_changed"
  | "priority_changed"
  | "assignee_changed"
  | "details_updated";

export interface TicketActivity {
  id: string;
  organization_id: string;
  ticket_id: string;
  actor_id: string | null;
  activity_type: TicketActivityType;
  old_value: string | null;
  new_value: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: Profile;
}

export interface TicketActivityInsert {
  id?: string;
  organization_id: string;
  ticket_id: string;
  actor_id?: string | null;
  activity_type: TicketActivityType;
  old_value?: string | null;
  new_value?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; email: string };
        Update: Partial<Profile>;
      };
      organizations: {
        Row: Organization;
        Insert: OrganizationInsert;
        Update: OrganizationUpdate;
      };
      organization_members: {
        Row: OrganizationMember;
        Insert: Omit<OrganizationMember, "created_at" | "updated_at">;
        Update: Partial<Omit<OrganizationMember, "organization_id" | "user_id">>;
      };
      organization_invitations: {
        Row: OrganizationInvitation;
        Insert: OrganizationInvitationInsert;
        Update: OrganizationInvitationUpdate;
      };
      tickets: {
        Row: Ticket;
        Insert: Omit<Ticket, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Ticket, "id">>;
      };
      ticket_activities: {
        Row: TicketActivity;
        Insert: TicketActivityInsert;
        Update: Partial<TicketActivity>;
      };
    };
  };
}
