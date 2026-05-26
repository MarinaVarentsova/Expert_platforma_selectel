import { Router } from "express";
import { sendNotifications } from "../email/emailService.js";
import { type NotifyPayload, type EmailType } from "../email/templates.js";

const router = Router();

const VALID_TYPES: Set<EmailType> = new Set([
  "request_created",
  "expert_matched",
  "contacts_opened_customer",
  "contacts_opened_expert",
  "expert_can_take",
  "request_in_progress",
  "request_completed",
  "request_cancelled",
  "expert_proposed",
  "taken_by_other",
]);

/**
 * POST /api/notify
 *
 * Body: NotifyRequest — an array of notification payloads.
 * All notifications are sent/logged; errors are swallowed per-item.
 * Returns 202 immediately — fire-and-forget from the client's perspective.
 */
router.post("/notify", async (req, res) => {
  try {
    const body = req.body as unknown;

    // Accept both a single payload and an array
    const items: unknown[] = Array.isArray(body) ? body : [body];

    const appUrl = (process.env["APP_URL"] ?? "").replace(/\/$/, "") ||
      `https://${req.get("host") ?? "palata.app"}`;

    const payloads: NotifyPayload[] = [];
    const errors: string[] = [];

    for (const item of items) {
      if (typeof item !== "object" || item === null) {
        errors.push("Item is not an object");
        continue;
      }

      const p = item as Record<string, unknown>;

      if (!p["type"] || !VALID_TYPES.has(p["type"] as EmailType)) {
        errors.push(`Unknown email type: ${String(p["type"])}`);
        continue;
      }
      if (!p["requestId"] || typeof p["requestId"] !== "string") {
        errors.push("Missing requestId");
        continue;
      }
      if (!p["recipientEmail"] || typeof p["recipientEmail"] !== "string") {
        errors.push("Missing recipientEmail");
        continue;
      }

      payloads.push({
        type:           p["type"] as EmailType,
        requestId:      p["requestId"] as string,
        requestShortId: (p["requestShortId"] as string | undefined) ?? (p["requestId"] as string).slice(0, 8),
        requestTitle:   (p["requestTitle"]   as string | undefined) ?? "Заявка",
        expertiseType:  (p["expertiseType"]  as string | undefined) ?? "",
        region:         (p["region"]         as string | undefined) ?? "",
        currentStatus:  (p["currentStatus"]  as string | undefined) ?? "pending",
        recipientEmail: p["recipientEmail"] as string,
        recipientType:  (p["recipientType"]  as "customer" | "expert" | "admin") ?? "customer",
        recipientName:  p["recipientName"]  as string | undefined,
        expertId:       p["expertId"]       as string | undefined,
        expertEmail:    p["expertEmail"]    as string | undefined,
        expertName:     p["expertName"]     as string | undefined,
        note:           p["note"]           as string | undefined,
        canStartFrom:   p["canStartFrom"]   as string | undefined,
        appUrl,
      });
    }

    // Fire-and-forget — do not await; respond 202 immediately
    void sendNotifications(payloads);

    res.status(202).json({
      accepted: payloads.length,
      skipped:  errors.length,
      errors:   errors.length > 0 ? errors : undefined,
    });
  } catch (err: unknown) {
    req.log.error({ err }, "Notify route error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
