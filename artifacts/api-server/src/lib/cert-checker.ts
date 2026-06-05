import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger";

const CERT_SITE_URL = "https://xn--80aaaio3ae2acfmjkg3n.xn--p1ai/";
const WARN_DAYS = 7;

export async function checkExpiringCerts(db: SupabaseClient): Promise<void> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const warnDate = new Date(today);
  warnDate.setDate(warnDate.getDate() + WARN_DAYS);
  const warnDateStr = warnDate.toISOString().slice(0, 10);

  const { data: certs, error: certsErr } = await db
    .from("palata_expert_certificates")
    .select("id, expert_id, certificate_number, cert_valid_to, cert_direction_ids")
    .eq("status", "verified")
    .gt("cert_valid_to", todayStr)
    .lte("cert_valid_to", warnDateStr);

  if (certsErr) {
    logger.warn({ err: certsErr.message }, "cert-checker: failed to fetch certs");
    return;
  }

  if (!certs || certs.length === 0) {
    logger.info("cert-checker: no certs expiring within 7 days");
    return;
  }

  const expertIds = [...new Set((certs as { expert_id: string }[]).map(c => c.expert_id))];

  const [usersRes, dirRes] = await Promise.all([
    db.from("palata_users")
      .select("id, full_name, email, phone")
      .in("id", expertIds),
    db.from("palata_expertise_directions")
      .select("id, name"),
  ]);

  const usersMap = Object.fromEntries(
    ((usersRes.data ?? []) as { id: string; full_name: string | null; email: string; phone: string | null }[])
      .map(u => [u.id, u]),
  );
  const dirMap = Object.fromEntries(
    ((dirRes.data ?? []) as { id: string; name: string }[])
      .map(d => [d.id, d.name]),
  );

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: existingItems } = await db
    .from("palata_action_items")
    .select("payload, assigned_to_user_id")
    .eq("action_type", "cert_expiring_soon")
    .eq("is_resolved", false)
    .gte("created_at", sevenDaysAgo.toISOString());

  const alreadyNotified = new Set(
    ((existingItems ?? []) as { payload: { cert_id?: string } | null; assigned_to_user_id: string }[])
      .map(i => i.payload?.cert_id ?? ""),
  );

  let notified = 0;

  for (const cert of certs as {
    id: string;
    expert_id: string;
    certificate_number: string | null;
    cert_valid_to: string;
    cert_direction_ids: string[];
  }[]) {
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

    await db.from("palata_action_items").insert({
      request_id:           null,
      expert_id:            cert.expert_id,
      customer_id:          null,
      assigned_to_user_id:  cert.expert_id,
      assigned_role:        "expert",
      action_type:          "cert_expiring_soon",
      status:               "open",
      is_read:              false,
      is_resolved:          false,
      title:                `Сертификат истекает через ${daysLeft} ${daysLeft === 1 ? "день" : daysLeft < 5 ? "дня" : "дней"}`,
      description:          `Сертификат ${certLabel} по направлению «${directionNames}» действителен до ${formattedDate}. Продлите сертификат на сайте Палаты судебных экспертов: ${CERT_SITE_URL}`,
      payload: {
        cert_id:             cert.id,
        certificate_number:  cert.certificate_number,
        cert_valid_to:       cert.cert_valid_to,
        cert_direction_ids:  cert.cert_direction_ids,
        direction_names:     directionNames,
        renewal_url:         CERT_SITE_URL,
        days_left:           daysLeft,
      },
    });

    notified++;
  }

  logger.info({ notified, total: certs.length }, "cert-checker: expiry notifications sent");
}
