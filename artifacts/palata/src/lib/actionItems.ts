import { supabase } from "./supabaseClient";

// ─── Action types ─────────────────────────────────────────────────────────────

export type ActionType =
  | "experts_matched"
  | "expert_declined"
  | "expert_can_start_from"
  | "expert_completed_order"
  | "expert_started_work"
  | "customer_selected_you"
  | "customer_approved_start_date"
  | "customer_declined_start_date"
  | "choose_another_expert"
  | "you_are_approved_for_work"
  | "manual_matching_required";

export type ActionItem = {
  id: string;
  request_id: string;
  expert_id: string | null;
  customer_id: string | null;
  assigned_to_user_id: string;
  assigned_role: "customer" | "expert" | "admin";
  action_type: ActionType;
  title: string;
  description: string;
  status: "open" | "read" | "resolved" | "cancelled";
  is_read: boolean;
  is_resolved: boolean;
  created_at: string;
  read_at: string | null;
  resolved_at: string | null;
  payload: Record<string, unknown> | null;
};

type CreateInput = Pick<
  ActionItem,
  | "request_id" | "expert_id" | "customer_id"
  | "assigned_to_user_id" | "assigned_role"
  | "action_type" | "title" | "description" | "payload"
>;

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createActionItem(input: CreateInput) {
  return supabase.from("palata_action_items").insert({
    ...input,
    status: "open",
    is_read: false,
    is_resolved: false,
  });
}

export async function resolveActionItem(id: string) {
  return supabase.from("palata_action_items").update({
    is_resolved: true,
    status: "resolved",
    resolved_at: new Date().toISOString(),
  }).eq("id", id);
}

export async function cancelRequestActionItems(requestId: string, exceptId?: string) {
  let q = supabase
    .from("palata_action_items")
    .update({ is_resolved: true, status: "cancelled", resolved_at: new Date().toISOString() })
    .eq("request_id", requestId)
    .eq("is_resolved", false);
  if (exceptId) q = q.neq("id", exceptId);
  return q;
}

export async function loadOpenActionItems(userId: string): Promise<ActionItem[]> {
  try {
    const { data, error } = await supabase
      .from("palata_action_items")
      .select("*")
      .eq("assigned_to_user_id", userId)
      .eq("status", "open")
      .eq("is_resolved", false)
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data ?? []) as ActionItem[];
  } catch {
    return [];
  }
}

// ─── Logging helpers (same TEST_MODE pattern used across the app) ─────────────

export async function logStatusEvent(
  requestId: string,
  oldStatus: string,
  newStatus: string,
  note: string,
) {
  return supabase.from("palata_status_events").insert({
    entity_type: "request",
    entity_id: requestId,
    old_status: oldStatus,
    new_status: newStatus,
    actor_id: null,
    note,
  });
}

export async function logEmailTestEvent(
  recipientId: string,
  email: string,
  template: string,
  subject: string,
  context: Record<string, unknown>,
) {
  return supabase.from("palata_email_events").insert({
    recipient_id: recipientId,
    email_address: email,
    template_name: template,
    subject,
    context,
    sent_at: new Date().toISOString(),
    error: "TEST_MODE",
  });
}
