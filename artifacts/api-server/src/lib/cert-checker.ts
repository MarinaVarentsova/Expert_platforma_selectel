import type { Pool } from "pg";
import { logger } from "./logger";

const CERT_SITE_URL = "https://xn--80aaaio3ae2acfmjkg3n.xn--p1ai/";
const WARN_DAYS = 7;

export async function checkExpiringCerts(db: Pool): Promise<void> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const warnDate = new Date(today);
  warnDate.setDate(warnDate.getDate() + WARN_DAYS);
  const warnDateStr = warnDate.toISOString().slice(0, 10);

  const certsRes = await db.query<{
    id: string;
    expert_id: string;
    certificate_number: string | null;
    cert_valid_to: string;
    cert_direction_ids: string[];
  }>(
    `SELECT id, expert_id, certificate_number, cert_valid_to, cert_direction_ids
       FROM public.palata_expert_certificates
      WHERE status = 'verified'
        AND cert_valid_to > $1
        AND cert_valid_to <= $2`,
    [todayStr, warnDateStr],
  );

  const certs = certsRes.rows;

  if (certs.length === 0) {
    logger.info("cert-checker: no certs expiring within 7 days");
    return;
  }

  const expertIds = [...new Set(certs.map(c => c.expert_id))];

  const [usersRes, dirRes] = await Promise.all([
    db.query<{ id: string; full_name: string | null; email: string; phone: string | null }>(
      `SELECT id, full_name, email, phone FROM public.palata_users WHERE id = ANY($1)`,
      [expertIds],
    ),
    db.query<{ id: string; name: string }>(
      `SELECT id, name FROM public.palata_expertise_directions`,
    ),
  ]);

  const usersMap = Object.fromEntries(usersRes.rows.map(u => [u.id, u]));
  const dirMap   = Object.fromEntries(dirRes.rows.map(d => [d.id, d.name]));

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const existingRes = await db.query<{ payload: { cert_id?: string } | null; assigned_to_user_id: string }>(
    `SELECT payload, assigned_to_user_id
       FROM public.palata_action_items
      WHERE action_type = 'cert_expiring_soon'
        AND is_resolved = false
        AND created_at >= $1`,
    [sevenDaysAgo.toISOString()],
  );

  const alreadyNotified = new Set(
    existingRes.rows.map(i => i.payload?.cert_id ?? ""),
  );

  let notified = 0;

  for (const cert of certs) {
    if (alreadyNotified.has(cert.id)) continue;

    const expert = usersMap[cert.expert_id];
    if (!expert) continue;

    const daysLeft = Math.ceil(
      (new Date(cert.cert_valid_to).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    const directionNames = (cert.cert_direction_ids ?? [])
      .map((id: string) => dirMap[id] ?? id)
      .join(", ");

    const certLabel = cert.certificate_number ? `№ ${cert.certificate_number}` : "";
    const formattedDate = new Date(cert.cert_valid_to).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    await db.query(
      `INSERT INTO public.palata_action_items
         (request_id, expert_id, customer_id, assigned_to_user_id, assigned_role,
          action_type, status, is_read, is_resolved, title, description, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        null, cert.expert_id, null, cert.expert_id, "expert",
        "cert_expiring_soon", "open", false, false,
        `Сертификат истекает через ${daysLeft} ${daysLeft === 1 ? "день" : daysLeft < 5 ? "дня" : "дней"}`,
        `Сертификат ${certLabel} по направлению «${directionNames}» действителен до ${formattedDate}. Продлите сертификат на сайте Палаты судебных экспертов: ${CERT_SITE_URL}`,
        JSON.stringify({
          cert_id:            cert.id,
          certificate_number: cert.certificate_number,
          cert_valid_to:      cert.cert_valid_to,
          cert_direction_ids: cert.cert_direction_ids,
          direction_names:    directionNames,
          renewal_url:        CERT_SITE_URL,
          days_left:          daysLeft,
        }),
      ],
    );

    notified++;
  }

  logger.info({ notified, total: certs.length }, "cert-checker: expiry notifications sent");
}
