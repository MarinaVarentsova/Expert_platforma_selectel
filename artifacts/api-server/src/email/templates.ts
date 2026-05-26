// ─── Email Templates ──────────────────────────────────────────────────────────
// Warm cream enterprise-style HTML emails matching the platform's visual design.

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

export interface NotifyPayload {
  type: EmailType;
  requestId: string;
  requestShortId: string;
  requestTitle: string;
  expertiseType: string;
  region: string;
  currentStatus: string;
  // recipient
  recipientEmail: string;
  recipientType: "customer" | "expert" | "admin";
  recipientName?: string;
  // expert context (when relevant)
  expertId?: string;
  expertEmail?: string;
  expertName?: string;
  // extra
  note?: string;
  canStartFrom?: string;
  appUrl: string;
}

interface EmailContent {
  subject: string;
  html: string;
  threadId: string;        // for In-Reply-To header
}

const STATUS_LABELS: Record<string, string> = {
  draft:            "Черновик",
  pending:          "Идёт подбор",
  matching:         "Подбор завершён",
  expert_selection: "Выбор эксперта",
  in_work:          "В работе",
  in_progress:      "В работе",
  completed:        "Выполнен",
  cancelled:        "Неактуален",
  failed:           "Провалён",
};

function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s;
}

// ── Subject lines ────────────────────────────────────────────────────────────

function buildSubject(p: NotifyPayload): string {
  const base = `Заказ №${p.requestShortId} — ${p.requestTitle}`;
  if (p.expertName) return `${base} — эксперт ${shortName(p.expertName)}`;
  return base;
}

function shortName(fullName: string): string {
  // "Подшивайлова Анна" → "Подшивайлова А."
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return fullName;
  return `${parts[0]} ${parts[1]![0]}.`;
}

// ── Thread ID (for email threading) ─────────────────────────────────────────

function buildThreadId(p: NotifyPayload): string {
  if (p.expertId) {
    return `<request-${p.requestId}-expert-${p.expertId}@palata.app>`;
  }
  return `<request-${p.requestId}@palata.app>`;
}

// ── Event heading + body text ────────────────────────────────────────────────

function eventContent(p: NotifyPayload): { heading: string; body: string } {
  const link = `${p.appUrl}/requests/${p.requestId}`;
  const shortId = p.requestShortId;

  switch (p.type) {
    case "request_created":
      return {
        heading: "Ваша заявка получена",
        body: `Заявка <strong>№${shortId}</strong> по направлению <em>${p.expertiseType}</em> в регионе <em>${p.region}</em> успешно принята.<br>Система начала автоматический подбор квалифицированного эксперта. Мы сообщим вам, когда кандидат будет найден.`,
      };
    case "expert_matched":
      return {
        heading: "Эксперт подобран",
        body: `К вашей заявке <strong>№${shortId}</strong> подобран эксперт${p.expertName ? ` — <strong>${p.expertName}</strong>` : ""}.<br>Перейдите в личный кабинет, чтобы просмотреть профиль и открыть контакты.`,
      };
    case "contacts_opened_customer":
      return {
        heading: "Контакты открыты",
        body: `Вы открыли контакты с экспертом${p.expertName ? ` <strong>${p.expertName}</strong>` : ""} по заявке <strong>№${shortId}</strong>.<br>Эксперт получил уведомление и сможет связаться с вами.`,
      };
    case "contacts_opened_expert":
      return {
        heading: "Заказчик открыл ваши контакты",
        body: `По заявке <strong>№${shortId}</strong> заказчик открыл контакты.<br>Специализация: <em>${p.expertiseType}</em>, регион: <em>${p.region}</em>.<br>Войдите в личный кабинет, чтобы ознакомиться с деталями заявки.`,
      };
    case "expert_can_take":
      return {
        heading: "Эксперт готов взять заказ",
        body: `Эксперт${p.expertName ? ` <strong>${p.expertName}</strong>` : ""} подтвердил готовность взяться за заявку <strong>№${shortId}</strong>${p.canStartFrom ? ` с <strong>${p.canStartFrom}</strong>` : ""}.<br>Перейдите в кабинет, чтобы перевести заказ в работу.`,
      };
    case "request_in_progress":
      return {
        heading: "Заказ взят в работу",
        body: `Заявка <strong>№${shortId}</strong> официально передана эксперту${p.expertName ? ` <strong>${p.expertName}</strong>` : ""} и находится в работе.<br>Следите за статусом в личном кабинете.`,
      };
    case "request_completed":
      return {
        heading: "Заказ выполнен",
        body: `Заявка <strong>№${shortId}</strong> — <em>${p.requestTitle}</em> — успешно завершена.<br>Если у вас есть вопросы или замечания, обратитесь к администратору платформы.`,
      };
    case "request_cancelled":
      return {
        heading: "Заказ помечен неактуальным",
        body: `Заявка <strong>№${shortId}</strong> переведена в статус «Неактуален»${p.note ? `:<br><em>${p.note}</em>` : "."}`,
      };
    case "expert_proposed":
      return {
        heading: "Вам предложена новая заявка",
        body: `Система подобрала вас для заявки <strong>№${shortId}</strong>.<br>Направление: <em>${p.expertiseType}</em>, регион: <em>${p.region}</em>.<br>Войдите в личный кабинет, чтобы принять решение.`,
      };
    case "taken_by_other":
      return {
        heading: "Заявка взята другим экспертом",
        body: `Заявка <strong>№${shortId}</strong> — <em>${p.requestTitle}</em> — принята другим экспертом.<br>Спасибо за готовность участвовать. Мы направим вам новые предложения по вашей специализации.`,
      };
    default:
      return {
        heading: "Обновление статуса",
        body: `Статус заявки <strong>№${shortId}</strong> изменился на <strong>${statusLabel(p.currentStatus)}</strong>.`,
      };
  }
}

// ── Main template builder ────────────────────────────────────────────────────

export function buildEmail(p: NotifyPayload): EmailContent {
  const subject  = buildSubject(p);
  const threadId = buildThreadId(p);
  const { heading, body } = eventContent(p);
  const requestUrl = `${p.appUrl}/requests/${p.requestId}`;
  const cabinetUrl = p.recipientType === "customer" ? `${p.appUrl}/customer`
    : p.recipientType === "expert" ? `${p.appUrl}/expert`
    : `${p.appUrl}/admin`;

  const noteBlock = p.note
    ? `<tr><td style="padding:0 0 20px">
        <div style="background:#faf8f5;border-left:3px solid #e8891a;padding:12px 16px;border-radius:0 8px 8px 0">
          <p style="margin:0;font-size:13px;color:#78716c;line-height:1.6"><em>${p.note}</em></p>
        </div>
      </td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f2ece2;font-family:'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased">

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f2ece2;padding:32px 16px">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%">

          <!-- Header -->
          <tr>
            <td style="background:#2e2a27;border-radius:16px 16px 0 0;padding:20px 32px">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background:#1c1714;border-radius:50%;width:36px;height:36px;text-align:center;vertical-align:middle">
                          <span style="color:#e8891a;font-size:11px;font-weight:700;letter-spacing:-0.5px">СЭ</span>
                        </td>
                        <td style="padding-left:12px">
                          <span style="color:#f2ece2;font-size:14px;font-weight:700;letter-spacing:-0.3px">Палата СЭ</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right">
                    <span style="color:#78716c;font-size:11px">№${p.requestShortId}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body card -->
          <tr>
            <td style="background:#ffffff;border-radius:0 0 16px 16px;padding:32px">
              <table width="100%" cellpadding="0" cellspacing="0">

                <!-- Heading -->
                <tr>
                  <td style="padding-bottom:8px">
                    <h1 style="margin:0;font-size:22px;font-weight:700;color:#1c1714;line-height:1.2">${heading}</h1>
                  </td>
                </tr>

                <!-- Request title badge -->
                <tr>
                  <td style="padding-bottom:20px">
                    <span style="display:inline-block;background:#f2ece2;border:1px solid #ddd6ce;border-radius:999px;padding:4px 12px;font-size:12px;color:#78716c;font-weight:500">${p.requestTitle}</span>
                  </td>
                </tr>

                <!-- Body text -->
                <tr>
                  <td style="padding-bottom:24px">
                    <p style="margin:0;font-size:14px;color:#44403c;line-height:1.7">${body}</p>
                  </td>
                </tr>

                <!-- Status card -->
                <tr>
                  <td style="padding-bottom:24px">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;border:1px solid #e5dfd7;border-radius:10px">
                      <tr>
                        <td style="padding:14px 16px">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="font-size:11px;color:#a8a29e;font-weight:600;text-transform:uppercase;letter-spacing:0.08em">Текущий статус</td>
                              <td style="font-size:11px;color:#a8a29e;font-weight:600;text-transform:uppercase;letter-spacing:0.08em" align="right">Специализация</td>
                            </tr>
                            <tr>
                              <td style="font-size:14px;color:#2e2a27;font-weight:600;padding-top:4px">${statusLabel(p.currentStatus)}</td>
                              <td style="font-size:13px;color:#78716c;padding-top:4px" align="right">${p.expertiseType}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                ${noteBlock}

                <!-- CTA button -->
                <tr>
                  <td style="padding-bottom:24px">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background:#2e2a27;border-radius:999px">
                          <a href="${requestUrl}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#f2ece2;text-decoration:none">
                            Открыть заявку →
                          </a>
                        </td>
                        <td style="padding-left:12px">
                          <a href="${cabinetUrl}" style="display:inline-block;padding:12px 20px;font-size:13px;font-weight:500;color:#78716c;text-decoration:none;border:1px solid #ddd6ce;border-radius:999px">
                            Личный кабинет
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="border-top:1px solid #f0ebe3;padding-top:20px">
                    <p style="margin:0;font-size:11px;color:#c4bdb4;line-height:1.6">
                      Это автоматическое уведомление от платформы Палата судебных экспертов.<br>
                      Регион: <strong>${p.region}</strong> · 
                      <a href="${p.appUrl}" style="color:#c4bdb4;text-decoration:none">palata.app</a>
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Spacer -->
          <tr><td style="height:24px"></td></tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;

  return { subject, html, threadId };
}
