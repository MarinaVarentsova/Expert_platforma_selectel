// ─── Email notification helper ────────────────────────────────────────────────
// Fire-and-forget: never awaited, never blocks UI, never throws.
// The API server logs all attempts to palata_email_events.

export type EmailType =
  | "request_created"
  | "expert_matched"
  | "contacts_opened_customer"
  | "contacts_opened_expert"
  | "expert_can_take"
  | "request_in_progress"
  | "request_completed"
  | "request_cancelled"
  | "expert_proposed"
  | "taken_by_other";

export interface NotifyItem {
  type: EmailType;
  requestId: string;
  requestShortId?: string;
  requestTitle?: string;
  expertiseType?: string;
  region?: string;
  currentStatus?: string;
  // recipient
  recipientEmail: string;
  recipientType: "customer" | "expert" | "admin";
  recipientName?: string;
  // expert context
  expertId?: string;
  expertEmail?: string;
  expertName?: string;
  // extras
  note?: string;
  canStartFrom?: string;
}

const API_NOTIFY = `${import.meta.env.BASE_URL}api/notify`.replace(/\/\//g, "/").replace(":/", "://");

/**
 * Send one or more email notifications.
 * Always fire-and-forget — never blocks the caller.
 */
export function notify(items: NotifyItem | NotifyItem[]): void {
  const payload = Array.isArray(items) ? items : [items];
  fetch(API_NOTIFY, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  }).catch(() => {
    // silently ignore — the UI must never break because of notifications
  });
}
