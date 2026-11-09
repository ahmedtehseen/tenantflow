export type OrgRole = "owner" | "admin" | "member";
export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type InvitationRole = "admin" | "member";
export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export type SLAStatus =
  | "on_track"
  | "at_risk"
  | "breached"
  | "met"
  | "paused"
  | "none";

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

// -----------------------------------------------------------------------------
// SLA Policies (ADR Phase 3)
// -----------------------------------------------------------------------------

export interface SLAPolicyConfig {
  timezone: string;
  business_days: number[];
  business_start_time: string;
  business_end_time: string;
  urgent_response_minutes?: number;
  urgent_resolution_minutes?: number;
  high_response_minutes?: number;
  high_resolution_minutes?: number;
  medium_response_minutes?: number;
  medium_resolution_minutes?: number;
  low_response_minutes?: number;
  low_resolution_minutes?: number;
}

export interface OrganizationSLAPolicy {
  id: string;
  organization_id: string;
  timezone: string;
  business_days: number[];
  business_start_time: string;
  business_end_time: string;
  urgent_response_minutes: number;
  urgent_resolution_minutes: number;
  high_response_minutes: number;
  high_resolution_minutes: number;
  medium_response_minutes: number;
  medium_resolution_minutes: number;
  low_response_minutes: number;
  low_resolution_minutes: number;
  created_at: string;
  updated_at: string;
  organization?: Organization;
}

export interface OrganizationSLAPolicyInsert {
  id?: string;
  organization_id: string;
  timezone?: string;
  business_days?: number[];
  business_start_time?: string;
  business_end_time?: string;
  urgent_response_minutes?: number;
  urgent_resolution_minutes?: number;
  high_response_minutes?: number;
  high_resolution_minutes?: number;
  medium_response_minutes?: number;
  medium_resolution_minutes?: number;
  low_response_minutes?: number;
  low_resolution_minutes?: number;
}

export interface OrganizationSLAPolicyUpdate {
  timezone?: string;
  business_days?: number[];
  business_start_time?: string;
  business_end_time?: string;
  urgent_response_minutes?: number;
  urgent_resolution_minutes?: number;
  high_response_minutes?: number;
  high_resolution_minutes?: number;
  medium_response_minutes?: number;
  medium_resolution_minutes?: number;
  low_response_minutes?: number;
  low_resolution_minutes?: number;
}

// -----------------------------------------------------------------------------
// Tickets & Activities
// -----------------------------------------------------------------------------

export interface Ticket {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  created_by: string | null;
  assigned_to: string | null;
  first_response_due_at: string | null;
  resolution_due_at: string | null;
  first_responded_at: string | null;
  first_response_breached: boolean;
  resolved_at: string | null;
  resolution_breached: boolean;
  created_at: string;
  updated_at: string;
  creator?: Profile;
  assignee?: Profile;
}

export interface TicketInsert {
  id?: string;
  organization_id: string;
  title: string;
  description?: string | null;
  status?: TicketStatus;
  priority?: TicketPriority;
  created_by?: string | null;
  assigned_to?: string | null;
  first_response_due_at?: string | null;
  resolution_due_at?: string | null;
  first_responded_at?: string | null;
  first_response_breached?: boolean;
  resolved_at?: string | null;
  resolution_breached?: boolean;
}

export type TicketActivityType =
  | "created"
  | "status_changed"
  | "priority_changed"
  | "assignee_changed"
  | "details_updated"
  | "comment_deleted"
  | "sla_breached";

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

// -----------------------------------------------------------------------------
// Ticket Comments (Phase 3)
// -----------------------------------------------------------------------------

export interface TicketComment {
  id: string;
  ticket_id: string;
  organization_id: string;
  author_id: string;
  content: string;
  is_edited: boolean;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
  author?: Profile;
  ticket?: Ticket;
}

export interface TicketCommentInsert {
  id?: string;
  ticket_id: string;
  organization_id: string;
  author_id: string;
  content: string;
  is_edited?: boolean;
  edited_at?: string | null;
}

export interface TicketCommentUpdate {
  content?: string;
  is_edited?: boolean;
  edited_at?: string | null;
}

// -----------------------------------------------------------------------------
// Notifications (Phase 3)
// -----------------------------------------------------------------------------

export type NotificationType =
  | "ticket_assigned"
  | "mention"
  | "status_changed"
  | "sla_breached"
  | "sla_at_risk";

export interface Notification {
  id: string;
  organization_id: string;
  recipient_id: string;
  actor_id: string | null;
  ticket_id: string | null;
  type: NotificationType | string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
  actor?: Profile;
  ticket?: Ticket;
  organization?: Organization;
}

export interface NotificationInsert {
  id?: string;
  organization_id: string;
  recipient_id: string;
  actor_id?: string | null;
  ticket_id?: string | null;
  type: NotificationType | string;
  title: string;
  body: string;
  read_at?: string | null;
}

export interface NotificationUpdate {
  read_at?: string | null;
}

// -----------------------------------------------------------------------------
// Webhooks & Deliveries (Phase 3)
// -----------------------------------------------------------------------------

export interface OrganizationWebhook {
  id: string;
  organization_id: string;
  url: string;
  secret: string;
  description: string | null;
  events: string[];
  is_active: boolean;
  created_at: string;
  organization?: Organization;
}

export interface OrganizationWebhookInsert {
  id?: string;
  organization_id: string;
  url: string;
  secret: string;
  description?: string | null;
  events?: string[];
  is_active?: boolean;
}

export interface OrganizationWebhookUpdate {
  url?: string;
  secret?: string;
  description?: string | null;
  events?: string[];
  is_active?: boolean;
}

export type WebhookDeliveryStatus = "pending" | "delivered" | "failed";

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  organization_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  status: WebhookDeliveryStatus;
  last_status_code: number | null;
  last_error: string | null;
  next_retry_at: string | null;
  created_at: string;
  delivered_at: string | null;
  webhook?: OrganizationWebhook;
}

export interface WebhookDeliveryInsert {
  id?: string;
  webhook_id: string;
  organization_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts?: number;
  max_attempts?: number;
  status?: WebhookDeliveryStatus;
  last_status_code?: number | null;
  last_error?: string | null;
  next_retry_at?: string | null;
  delivered_at?: string | null;
}

export interface WebhookDeliveryUpdate {
  attempts?: number;
  status?: WebhookDeliveryStatus;
  last_status_code?: number | null;
  last_error?: string | null;
  next_retry_at?: string | null;
  delivered_at?: string | null;
}

// -----------------------------------------------------------------------------
// Database Schema Map
// -----------------------------------------------------------------------------

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
      organization_sla_policies: {
        Row: OrganizationSLAPolicy;
        Insert: OrganizationSLAPolicyInsert;
        Update: OrganizationSLAPolicyUpdate;
      };
      tickets: {
        Row: Ticket;
        Insert: TicketInsert;
        Update: Partial<TicketInsert>;
      };
      ticket_activities: {
        Row: TicketActivity;
        Insert: TicketActivityInsert;
        Update: Partial<TicketActivity>;
      };
      ticket_comments: {
        Row: TicketComment;
        Insert: TicketCommentInsert;
        Update: TicketCommentUpdate;
      };
      notifications: {
        Row: Notification;
        Insert: NotificationInsert;
        Update: NotificationUpdate;
      };
      organization_webhooks: {
        Row: OrganizationWebhook;
        Insert: OrganizationWebhookInsert;
        Update: OrganizationWebhookUpdate;
      };
      webhook_deliveries: {
        Row: WebhookDelivery;
        Insert: WebhookDeliveryInsert;
        Update: WebhookDeliveryUpdate;
      };
    };
  };
}

// -----------------------------------------------------------------------------
// Realtime Collaboration & Presence Types (ADR 0006)
// -----------------------------------------------------------------------------

export interface PresenceUser {
  userId: string;
  email: string;
  fullName: string | null;
  role: OrgRole;
  avatarUrl?: string | null;
  currentView?: "list" | "kanban" | "ticket";
  viewingTicketId?: string | null;
  onlineAt: string;
}

export type RealtimeTicketEvent = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  old: Record<string, any>;
};
