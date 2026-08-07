import { getToken, palataFetch } from "@/lib/authClient";

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
  | "customer_cancelled_order"
  | "other_expert_took_order"
  | "choose_another_expert"
  | "you_are_approved_for_work"
  | "manual_matching_required"
  | "cert_expiring_soon";

export type ActionItem = {
  id: string;
  request_id: string | null;
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
  request_summary?: {
    title: string | null;
    description: string | null;
    urgency: string | null;
    region_id: string | null;
    expertise_direction_id: string | null;
    created_at: string | null;
  } | null;
};

// ─── CRUD ────────────────────────────────────────────────────────────────────

// resolveActionItem — writes to Selectel via backend
export async function resolveActionItem(id: string): Promise<void> {
  try {
    const token = getToken();
    if (!token) return;
    await palataFetch(`/api/palata/action-items/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // best-effort
  }
}

// loadOpenActionItems — reads from Selectel via backend
export async function loadOpenActionItems(_userId?: string): Promise<ActionItem[]> {
  try {
    const token = getToken();
    if (!token) return [];
    const res = await palataFetch("/api/palata/action-items/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const body = await res.json() as { success: boolean; items?: ActionItem[] };
    return body.items ?? [];
  } catch {
    return [];
  }
}

// ─── Logging helpers ──────────────────────────────────────────────────────────

export async function logEmailTestEvent(
  recipientId: string,
  email: string,
  template: string,
  subject: string,
  context: Record<string, unknown>,
) {
  return fetch("/api/palata/email-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient_id: recipientId,
      email_address: email,
      template_name: template,
      subject,
      context,
      sent_at: new Date().toISOString(),
      error: "TEST_MODE",
    }),
  });
}
