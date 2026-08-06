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
 *   palata_expert_documents:    DELETE (+ S3 physical files via caller)
 *   palata_request_matches:     DELETE
 */

import { createHmac, createHash } from "crypto";

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
  tables.palata_expert_documents = {
    action: "delete",
    rows: await count(`SELECT COUNT(*) FROM public.palata_expert_documents WHERE expert_id = $1`, [userId]),
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

  const { rows: docRows } = await db.query(
    `SELECT bucket_path, file_name FROM public.palata_expert_documents WHERE expert_id = $1`,
    [userId],
  );
  const files = docRows.map(r => ({ bucket_path: r.bucket_path, file_name: r.file_name }));

  return { tables, files };
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
// Expert documents DB records are deleted here; physical file deletion
// must be done by the caller with bucket_paths collected before this call.

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

  const edoc = await client.query(
    `DELETE FROM public.palata_expert_documents WHERE expert_id = $1`,
    [userId],
  );
  counts.palata_expert_documents = edoc.rowCount;

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

// ── tryDeleteS3Object ─────────────────────────────────────────────────────────
// Attempts DELETE using AWS Sig V4 (native crypto, no extra dependencies).
// Returns { deleted: boolean, bucketPath: string, reason?: string }

function _hmacSha256(key, data) {
  return createHmac("sha256", key).update(data).digest();
}

export async function tryDeleteS3Object(bucketPath) {
  const endpoint  = process.env.SELECTEL_S3_ENDPOINT;
  const bucket    = process.env.SELECTEL_S3_BUCKET;
  const accessKey = process.env.SELECTEL_S3_ACCESS_KEY;
  const secretKey = process.env.SELECTEL_S3_SECRET_KEY;
  const region    = process.env.SELECTEL_S3_REGION ?? "ru-1";

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    return { deleted: false, bucketPath, reason: "S3_NOT_CONFIGURED" };
  }

  try {
    const now       = new Date();
    const amzDate   = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").slice(0, 16) + "Z";
    const dateStamp = amzDate.slice(0, 8);
    const host      = new URL(endpoint).hostname;
    const keyPath   = `/${bucket}/${bucketPath}`;
    const emptyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${emptyHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders    = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = `DELETE\n${keyPath}\n\n${canonicalHeaders}\n${signedHeaders}\n${emptyHash}`;

    const credScope    = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credScope}\n${createHash("sha256").update(canonicalRequest).digest("hex")}`;

    const kDate    = _hmacSha256("AWS4" + secretKey, dateStamp);
    const kRegion  = _hmacSha256(kDate, region);
    const kService = _hmacSha256(kRegion, "s3");
    const kSigning = _hmacSha256(kService, "aws4_request");
    const sig      = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
    const auth     = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;

    const res = await fetch(`${endpoint}${keyPath}`, {
      method: "DELETE",
      headers: {
        "Host": host,
        "x-amz-content-sha256": emptyHash,
        "x-amz-date":           amzDate,
        "Authorization":        auth,
      },
    });

    if (res.status === 204 || res.status === 200) {
      return { deleted: true, bucketPath };
    }
    const errBody = await res.text().catch(() => "");
    return { deleted: false, bucketPath, reason: `HTTP_${res.status}`, detail: errBody.slice(0, 200) };
  } catch (err) {
    return { deleted: false, bucketPath, reason: "NETWORK_ERROR", detail: String(err).slice(0, 200) };
  }
}
