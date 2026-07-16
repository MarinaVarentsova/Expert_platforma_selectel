import { pool } from "@workspace/db";
import { buildEmail, type NotifyPayload } from "./templates.js";
import { logger } from "../lib/logger.js";

// ── UniSender config (lazy — only active when API key is present) ─────────────

const uniApiKey  = process.env["UNISENDER_API_KEY"];
const fromEmail  = process.env["UNISENDER_FROM_EMAIL"] ?? "info@platformaekspertov.ru";
const fromName   = process.env["UNISENDER_FROM_NAME"]  ?? "Платформа судебных экспертов";
const testMode   = !uniApiKey;

const UNISENDER_SEND_URL = "https://api.unisender.com/ru/api/sendEmail";

if (testMode) {
  logger.warn("UNISENDER_API_KEY not set — email notifications running in TEST MODE (logged, not sent)");
}

// ── UniSender transport ───────────────────────────────────────────────────────

async function sendViaUniSender(opts: {
  to:      string;
  subject: string;
  html:    string;
}): Promise<void> {
  const params = new URLSearchParams({
    format:       "json",
    api_key:      uniApiKey!,
    email:        opts.to,
    sender_name:  fromName,
    sender_email: fromEmail,
    subject:      opts.subject,
    body:         opts.html,
  });

  const response = await fetch(`${UNISENDER_SEND_URL}?format=json`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    params.toString(),
  });

  const data = await response.json() as { result?: { email_id?: string }; error?: string; code?: string };

  if (!response.ok || data.error) {
    throw new Error(data.error ?? `UniSender HTTP ${response.status}`);
  }
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
  const { subject, html } = buildEmail(payload);
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

  logger.info({ type: payload.type, to: payload.recipientEmail }, `[EMAIL] ${payload.type} start`);

  try {
    await sendViaUniSender({
      to:      payload.recipientEmail,
      subject,
      html,
    });

    logger.info(
      { type: payload.type, to: payload.recipientEmail, subject },
      `[EMAIL] ${payload.type} success`,
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
    logger.error(
      { type: payload.type, to: payload.recipientEmail, errorText },
      `[EMAIL] ${payload.type} error`,
    );

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
