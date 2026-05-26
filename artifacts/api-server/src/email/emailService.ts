import { Resend } from "resend";
import { pool } from "@workspace/db";
import { buildEmail, type NotifyPayload } from "./templates.js";
import { logger } from "../lib/logger.js";

// ── Resend client (lazy — only initialised when API key is present) ───────────
const resendApiKey = process.env["RESEND_API_KEY"];
const fromEmail    = process.env["RESEND_FROM_EMAIL"] ?? "notifications@palata.app";
const testMode     = !resendApiKey;

const resend = testMode ? null : new Resend(resendApiKey!);

if (testMode) {
  logger.warn("RESEND_API_KEY not set — email notifications running in TEST MODE (logged, not sent)");
}

// ── Log to DB ────────────────────────────────────────────────────────────────

async function logEmailEvent(opts: {
  requestId: string;
  expertId:  string | undefined;
  recipientEmail: string;
  recipientType:  string;
  emailType:      string;
  subject:        string;
  bodyPreview:    string;
  status:         "sent" | "test_mode" | "error";
  errorText?:     string;
}) {
  try {
    await pool.query(
      `INSERT INTO palata_email_events
         (request_id, expert_id, recipient_email, recipient_type,
          email_type, subject, body_preview, status, error_text, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        opts.requestId   || null,
        opts.expertId    || null,
        opts.recipientEmail,
        opts.recipientType,
        opts.emailType,
        opts.subject,
        opts.bodyPreview,
        opts.status,
        opts.errorText   || null,
      ],
    );
  } catch (err) {
    // Logging failure should never crash the notification flow
    logger.error({ err }, "Failed to log email event to DB");
  }
}

// ── Main send function ───────────────────────────────────────────────────────

export async function sendNotification(payload: NotifyPayload): Promise<void> {
  const { subject, html, threadId } = buildEmail(payload);
  const bodyPreview = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);

  if (testMode) {
    logger.info(
      { type: payload.type, to: payload.recipientEmail, subject },
      "📧 [TEST MODE] Email notification — not sent, logged only",
    );
    await logEmailEvent({
      requestId:      payload.requestId,
      expertId:       payload.expertId,
      recipientEmail: payload.recipientEmail,
      recipientType:  payload.recipientType,
      emailType:      payload.type,
      subject,
      bodyPreview,
      status: "test_mode",
    });
    return;
  }

  try {
    const headers: Record<string, string> = {
      "In-Reply-To": threadId,
      "References":  threadId,
    };

    await resend!.emails.send({
      from:    fromEmail,
      to:      payload.recipientEmail,
      subject,
      html,
      headers,
    });

    logger.info(
      { type: payload.type, to: payload.recipientEmail, subject },
      "📧 Email notification sent",
    );

    await logEmailEvent({
      requestId:      payload.requestId,
      expertId:       payload.expertId,
      recipientEmail: payload.recipientEmail,
      recipientType:  payload.recipientType,
      emailType:      payload.type,
      subject,
      bodyPreview,
      status: "sent",
    });
  } catch (err: unknown) {
    const errorText = err instanceof Error ? err.message : String(err);
    logger.error({ err, type: payload.type, to: payload.recipientEmail }, "📧 Email send failed");

    await logEmailEvent({
      requestId:      payload.requestId,
      expertId:       payload.expertId,
      recipientEmail: payload.recipientEmail,
      recipientType:  payload.recipientType,
      emailType:      payload.type,
      subject,
      bodyPreview,
      status: "error",
      errorText,
    });

    // Never propagate — email failure must not break the caller
  }
}

// ── Batch helper (send to multiple recipients) ───────────────────────────────

export async function sendNotifications(
  payloads: NotifyPayload[],
): Promise<void> {
  await Promise.allSettled(payloads.map(sendNotification));
}
