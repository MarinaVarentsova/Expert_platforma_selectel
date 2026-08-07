/**
 * Core logic for the admin personal-data deletion / anonymization endpoint.
 * Extracted into a separate module so it can be imported and tested independently.
 *
 * All functions that write to the DB accept a `client` (pool or pool client with
 * `query()`) so tests can pass a mock without starting a real database.
 *
 * PD fields anonymized:
 *   palata_users:               email, full_name, phone  (is_active → false)
 *   palata_customer_profiles:   company_name, inn, contact_name, notes
 *   palata_expert_profiles:     bio, education, palata_registry_number,
 *                                centrsudexpert_registry_number
 *   palata_requests (customer): title, description
 *   palata_request_contacts:    customer_email, customer_phone (customer path)
 *                                expert_email, expert_phone   (expert path)
 *   palata_status_events:       actor_id → NULL, note → '[Данные обезличены]'
 *   palata_customer_ratings:    comment → NULL
 *   palata_action_items:        DELETE
 *   palata_email_events:        DELETE
 *   palata_expert_regions:      DELETE
 *   palata_expert_directions:   DELETE
 *   palata_expert_certificates: DELETE
 *   palata_request_matches:     DELETE
 */


// ── UUID validation ───────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

// ── Anonymized email placeholder ──────────────────────────────────────────────
export function anonymizedEmail(userId) {
  return `deleted_${userId}@deleted.palata`;
}

// ── collectUserDataSummary ────────────────────────────────────────────────────
// Returns preview of affected rows + file paths.  No writes.

export async function collectUserDataSummary(db, userId, role) {
  const count = async (sql, params) => {
    const { rows } = await db.query(sql, params);
    return Number(rows[0]?.count ?? 0);
  };

  const tables = {};

  tables.palata_users = {
    action: "anonymize",
    rows: await count(`SELECT COUNT(*) FROM public.palata_users WHERE id = $1`, [userId]),
  };

  if (role === "customer") {
    tables.palata_customer_profiles = {
      action: "anonymize",
      rows: await count(`SELECT COUNT(*) FROM public.palata_customer_profiles WHERE user_id = $1`, [userId]),
    };
    tables.palata_requests = {
      action: "anonymize",
      rows: await count(`SELECT COUNT(*) FROM public.palata_requests WHERE customer_id = $1`, [userId]),
    };
    tables.palata_request_matches = {
      action: "delete",
      rows: await count(
        `SELECT COUNT(*) FROM public.palata_request_matches rm
         JOIN public.palata_requests r ON r.id = rm.request_id
         WHERE r.customer_id = $1`,
        [userId],
      ),
    };
    tables.palata_request_contacts = {
      action: "anonymize",
      rows: await count(
        `SELECT COUNT(*) FROM public.palata_request_contacts rc
         JOIN public.palata_requests r ON r.id = rc.request_id
         WHERE r.customer_id = $1`,
        [userId],
      ),
    };
    tables.palata_status_events = {
      action: "anonymize",
      rows: await count(`SELECT COUNT(*) FROM public.palata_status_events WHERE actor_id = $1`, [userId]),
    };
    tables.palata_action_items = {
      action: "delete",
      rows: await count(
        `SELECT COUNT(*) FROM public.palata_action_items
         WHERE customer_id = $1 OR assigned_to_user_id = $1`,
        [userId],
      ),
    };
    tables.palata_customer_ratings = {
      action: "anonymize",
      rows: await count(`SELECT COUNT(*) FROM public.palata_customer_ratings WHERE customer_id = $1`, [userId]),
    };
    tables.palata_email_events = {
      action: "delete",
      rows: await count(`SELECT COUNT(*) FROM public.palata_email_events WHERE recipient_id = $1`, [userId]),
    };

    return { tables, files: [] };
  }

  // ── expert ──────────────────────────────────────────────────────────────────
  tables.palata_expert_profiles = {
    action: "anonymize",
    rows: await count(`SELECT COUNT(*) FROM public.palata_expert_profiles WHERE user_id = $1`, [userId]),
  };
  tables.palata_expert_regions = {
    action: "delete",
    rows: await count(`SELECT COUNT(*) FROM public.palata_expert_regions WHERE expert_id = $1`, [userId]),
  };
  tables.palata_expert_directions = {
    action: "delete",
    rows: await count(`SELECT COUNT(*) FROM public.palata_expert_directions WHERE expert_id = $1`, [userId]),
  };
  tables.palata_expert_certificates = {
    action: "delete",
    rows: await count(`SELECT COUNT(*) FROM public.palata_expert_certificates WHERE expert_id = $1`, [userId]),
  };
  tables.palata_request_matches = {
    action: "delete",
    rows: await count(`SELECT COUNT(*) FROM public.palata_request_matches WHERE expert_id = $1`, [userId]),
  };
  tables.palata_request_contacts = {
    action: "anonymize",
    rows: await count(`SELECT COUNT(*) FROM public.palata_request_contacts WHERE expert_id = $1`, [userId]),
  };
  tables.palata_status_events = {
    action: "anonymize",
    rows: await count(`SELECT COUNT(*) FROM public.palata_status_events WHERE actor_id = $1`, [userId]),
  };
  tables.palata_action_items = {
    action: "delete",
    rows: await count(
      `SELECT COUNT(*) FROM public.palata_action_items
       WHERE expert_id = $1 OR assigned_to_user_id = $1`,
      [userId],
    ),
  };
  tables.palata_customer_ratings = {
    action: "anonymize",
    rows: await count(`SELECT COUNT(*) FROM public.palata_customer_ratings WHERE expert_id = $1`, [userId]),
  };
  tables.palata_email_events = {
    action: "delete",
    rows: await count(`SELECT COUNT(*) FROM public.palata_email_events WHERE recipient_id = $1`, [userId]),
  };

  return { tables, files: [] };
}

// ── anonymizeCustomer ─────────────────────────────────────────────────────────
// Writes happen inside the caller's transaction client.
// Returns { tableName: rowCount, ... }

export async function anonymizeCustomer(client, userId) {
  const counts = {};
  const email = anonymizedEmail(userId);

  const u = await client.query(
    `UPDATE public.palata_users
     SET email = $2, full_name = NULL, phone = NULL, is_active = false, updated_at = NOW()
     WHERE id = $1`,
    [userId, email],
  );
  counts.palata_users = u.rowCount;

  // Anonymize all PD fields — company_name and inn identify sole proprietors (ИП)
  const cp = await client.query(
    `UPDATE public.palata_customer_profiles
     SET company_name = NULL, inn = NULL, contact_name = NULL, notes = NULL, updated_at = NOW()
     WHERE user_id = $1`,
    [userId],
  );
  counts.palata_customer_profiles = cp.rowCount;

  // title and description are user-provided free text that may contain PD
  const rq = await client.query(
    `UPDATE public.palata_requests
     SET title = '[Обезличено]', description = NULL, updated_at = NOW()
     WHERE customer_id = $1`,
    [userId],
  );
  counts.palata_requests = rq.rowCount;

  const rm = await client.query(
    `DELETE FROM public.palata_request_matches
     WHERE request_id IN (SELECT id FROM public.palata_requests WHERE customer_id = $1)`,
    [userId],
  );
  counts.palata_request_matches = rm.rowCount;

  const rc = await client.query(
    `UPDATE public.palata_request_contacts
     SET customer_email = NULL, customer_phone = NULL
     WHERE request_id IN (SELECT id FROM public.palata_requests WHERE customer_id = $1)`,
    [userId],
  );
  counts.palata_request_contacts = rc.rowCount;

  const se = await client.query(
    `UPDATE public.palata_status_events
     SET actor_id = NULL, note = '[Данные обезличены]'
     WHERE actor_id = $1`,
    [userId],
  );
  counts.palata_status_events = se.rowCount;

  const ai = await client.query(
    `DELETE FROM public.palata_action_items
     WHERE customer_id = $1 OR assigned_to_user_id = $1`,
    [userId],
  );
  counts.palata_action_items = ai.rowCount;

  const cr = await client.query(
    `UPDATE public.palata_customer_ratings SET comment = NULL WHERE customer_id = $1`,
    [userId],
  );
  counts.palata_customer_ratings = cr.rowCount;

  const ee = await client.query(
    `DELETE FROM public.palata_email_events WHERE recipient_id = $1`,
    [userId],
  );
  counts.palata_email_events = ee.rowCount;

  return counts;
}

// ── anonymizeExpert ───────────────────────────────────────────────────────────

export async function anonymizeExpert(client, userId) {
  const counts = {};
  const email = anonymizedEmail(userId);

  const u = await client.query(
    `UPDATE public.palata_users
     SET email = $2, full_name = NULL, phone = NULL, is_active = false, updated_at = NOW()
     WHERE id = $1`,
    [userId, email],
  );
  counts.palata_users = u.rowCount;

  // bio and education are personal free text.
  // Registry numbers are public records but still uniquely identify the expert —
  // nullify to prevent re-identification from the archived records.
  const ep = await client.query(
    `UPDATE public.palata_expert_profiles
     SET bio = NULL, education = NULL,
         palata_registry_number = NULL,
         centrsudexpert_registry_number = NULL,
         updated_at = NOW()
     WHERE user_id = $1`,
    [userId],
  );
  counts.palata_expert_profiles = ep.rowCount;

  const er = await client.query(
    `DELETE FROM public.palata_expert_regions WHERE expert_id = $1`,
    [userId],
  );
  counts.palata_expert_regions = er.rowCount;

  const ed = await client.query(
    `DELETE FROM public.palata_expert_directions WHERE expert_id = $1`,
    [userId],
  );
  counts.palata_expert_directions = ed.rowCount;

  const ec = await client.query(
    `DELETE FROM public.palata_expert_certificates WHERE expert_id = $1`,
    [userId],
  );
  counts.palata_expert_certificates = ec.rowCount;

  const rm = await client.query(
    `DELETE FROM public.palata_request_matches WHERE expert_id = $1`,
    [userId],
  );
  counts.palata_request_matches = rm.rowCount;

  const rc = await client.query(
    `UPDATE public.palata_request_contacts
     SET expert_email = NULL, expert_phone = NULL
     WHERE expert_id = $1`,
    [userId],
  );
  counts.palata_request_contacts = rc.rowCount;

  const se = await client.query(
    `UPDATE public.palata_status_events
     SET actor_id = NULL, note = '[Данные обезличены]'
     WHERE actor_id = $1`,
    [userId],
  );
  counts.palata_status_events = se.rowCount;

  const ai = await client.query(
    `DELETE FROM public.palata_action_items
     WHERE expert_id = $1 OR assigned_to_user_id = $1`,
    [userId],
  );
  counts.palata_action_items = ai.rowCount;

  const cr = await client.query(
    `UPDATE public.palata_customer_ratings SET comment = NULL WHERE expert_id = $1`,
    [userId],
  );
  counts.palata_customer_ratings = cr.rowCount;

  const ee = await client.query(
    `DELETE FROM public.palata_email_events WHERE recipient_id = $1`,
    [userId],
  );
  counts.palata_email_events = ee.rowCount;

  return counts;
}

