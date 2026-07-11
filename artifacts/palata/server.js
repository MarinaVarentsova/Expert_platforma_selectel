import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? "3000");
const AUTH_SERVICE_URL = (process.env.AUTH_SERVICE_URL ?? "http://q1rwqqgfbmvyhwgsdr701t0h.161.104.50.164.sslip.io").replace(/\/$/, "");
const STATIC_DIR = path.resolve(__dirname, "dist/public");
const PALATA_DATABASE_URL = process.env.PALATA_DATABASE_URL ?? "";

if (!process.env.AUTH_SERVICE_URL) {
  console.warn(
    "[AUTH-PROXY] AUTH_SERVICE_URL env var not set — falling back to default:",
    AUTH_SERVICE_URL,
  );
}

if (!PALATA_DATABASE_URL) {
  console.warn(
    "[PALATA-USER] PALATA_DATABASE_URL env var not set — /api/palata/users/me will return 503",
  );
}

let dbConfig = null;
if (PALATA_DATABASE_URL) {
  try {
    const parsed = new URL(PALATA_DATABASE_URL);
    dbConfig = {
      host: parsed.hostname,
      database: parsed.pathname.replace(/^\//, ""),
    };
  } catch (err) {
    console.error("[PALATA-USER] failed to parse PALATA_DATABASE_URL", { error: String(err) });
  }
}

// TODO: replace rejectUnauthorized:false with Selectel CA certificate
const palataPool = PALATA_DATABASE_URL
  ? new Pool({
      connectionString: process.env.PALATA_DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    })
  : null;
const pool = palataPool;

const app = express();

app.use(express.json({ limit: "50mb" }));

async function proxyAuthRequest(req, res) {
  const hasAuthHeader = Boolean(req.headers["authorization"]);

  console.log("[AUTH-PROXY] incoming", {
    method: req.method,
    originalUrl: req.originalUrl,
    path: req.path,
    hasAuthorizationHeader: hasAuthHeader,
    contentType: req.headers["content-type"] ?? null,
  });

  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const upstreamUrl = `${AUTH_SERVICE_URL}${req.originalUrl.split("?")[0]}${qs}`;

  console.log("[AUTH-PROXY] targetUrl =", upstreamUrl);

  const headers = { "Content-Type": "application/json" };
  const auth = req.headers["authorization"];
  if (auth) headers["Authorization"] = auth;

  const init = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    init.body = JSON.stringify(req.body ?? {});
  }

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch (err) {
    const stack = err instanceof Error ? err.stack : String(err);
    console.error("[AUTH-PROXY] ERROR stack =", stack);
    res.status(502).json({ success: false, error: `Auth service unreachable: ${String(err)}` });
    return;
  }

  const upstreamContentType = upstream.headers.get("content-type") ?? "";
  console.log("[AUTH-PROXY] upstream response", {
    status: upstream.status,
    contentType: upstreamContentType,
  });

  const rawText = await upstream.text();

  let body;
  const isJson = upstreamContentType.includes("application/json");
  if (isJson) {
    try {
      body = JSON.parse(rawText);
    } catch (err) {
      console.error("[AUTH-PROXY] upstream declared JSON but failed to parse", {
        error: String(err),
        preview: rawText.slice(0, 500),
      });
      body = rawText;
    }
  } else {
    body = rawText;
  }

  if (!isJson || upstream.status >= 400) {
    console.error("[AUTH-PROXY] upstream body preview =", rawText.slice(0, 500));
  }

  if (isJson) {
    res.status(upstream.status).json(body);
  } else {
    res.status(upstream.status).type(upstreamContentType || "text/plain").send(body);
  }
}

app.get("/api/debug/auth-proxy", (_req, res) => {
  res.json({
    ok: true,
    service: "palata-production-server",
    version: "palata-prod-server-2026-07-09-1",
    upstream: AUTH_SERVICE_URL,
    hasUpstream: Boolean(AUTH_SERVICE_URL),
  });
});

app.get("/api/debug/palata-db", (_req, res) => {
  res.json({
    ok: true,
    service: "palata-production-server",
    hasDatabaseUrl: Boolean(PALATA_DATABASE_URL),
    db: dbConfig,
    sslRejectUnauthorized: false,
  });
});

app.get("/api/debug/palata-users-schema", async (_req, res) => {
  if (!pool) {
    res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'palata_users'
       ORDER BY ordinal_position`,
    );
    res.json({ success: true, columns: result.rows });
  } catch (err) {
    console.error("[PALATA-USER] DB ERROR", {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      position: err.position,
      schema: err.schema,
      table: err.table,
      column: err.column,
      constraint: err.constraint,
      stack: err.stack,
    });
    res.status(500).json({
      success: false,
      error: "DB_QUERY_FAILED",
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      table: err.table,
      column: err.column,
    });
  }
});

app.get("/api/debug/palata-cert-import-schema", async (_req, res) => {
  if (!pool) {
    res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT
         table_name,
         column_name,
         data_type,
         udt_name,
         is_nullable,
         column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('palata_certificates_import', 'palata_certificate_import_logs')
       ORDER BY table_name, ordinal_position`,
    );
    const byTable = { palata_certificates_import: [], palata_certificate_import_logs: [] };
    for (const row of result.rows) {
      if (byTable[row.table_name]) {
        byTable[row.table_name].push({
          column_name: row.column_name,
          data_type: row.data_type,
          udt_name: row.udt_name,
          is_nullable: row.is_nullable,
          column_default: row.column_default,
        });
      }
    }
    res.json({ success: true, tables: byTable });
  } catch (err) {
    console.error("[CERT-IMPORT] DB ERROR", {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      position: err.position,
      schema: err.schema,
      table: err.table,
      column: err.column,
      constraint: err.constraint,
      stack: err.stack,
    });
    res.status(500).json({
      success: false,
      error: "DB_QUERY_FAILED",
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      table: err.table,
      column: err.column,
    });
  }
});

app.all(/^\/api\/auth(\/.*)?$/, (req, res) => {
  proxyAuthRequest(req, res).catch((err) => {
    const stack = err instanceof Error ? err.stack : String(err);
    console.error("[AUTH-PROXY] ERROR stack =", stack);
    res.status(500).json({ success: false, error: String(err) });
  });
});

async function handlePalataUserMe(req, res) {
  console.log("[PALATA-USER] /api/palata/users/me start");

  const authHeader = req.headers["authorization"] ?? "";
  const hasToken = authHeader.startsWith("Bearer ") && authHeader.slice(7).length > 0;
  console.log("[PALATA-USER] token exists", hasToken);

  if (!hasToken) {
    res.status(401).json({ success: false, error: "MISSING_TOKEN" });
    return;
  }

  const token = authHeader.slice(7);

  let meBody;
  let meStatus;
  try {
    const meRes = await fetch(`${AUTH_SERVICE_URL}/api/auth/me`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    meStatus = meRes.status;
    const meText = await meRes.text();
    try {
      meBody = JSON.parse(meText);
    } catch {
      meBody = null;
    }
  } catch (err) {
    console.error("[PALATA-USER] auth /me request failed", { error: String(err) });
    res.status(502).json({ success: false, error: "AUTH_SERVICE_UNREACHABLE" });
    return;
  }

  if (meStatus !== 200 || !meBody || meBody.success !== true) {
    console.log("[PALATA-USER] auth /me result", { user_id: null, email: null, status: meStatus });
    res.status(401).json({ success: false, error: "INVALID_TOKEN" });
    return;
  }

  console.log("[PALATA-USER] auth /me result", { user_id: meBody.user?.id, email: meBody.user?.email });

  if (!meBody.user?.id) {
    res.status(401).json({ success: false, error: "INVALID_AUTH_USER" });
    return;
  }

  if (!pool) {
    console.error("[PALATA-USER] not found reason = PALATA_DATABASE_URL not configured");
    res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" });
    return;
  }

  console.log("[PALATA-USER] db query palata_users by id", { userId: meBody.user.id });

  let result;
  try {
    result = await pool.query(
      `SELECT id, email, full_name, phone, role, is_active
       FROM public.palata_users
       WHERE id = $1
         AND is_active = true
       LIMIT 1`,
      [meBody.user.id],
    );
  } catch (err) {
    console.error("[PALATA-USER] DB ERROR", {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      position: err.position,
      schema: err.schema,
      table: err.table,
      column: err.column,
      constraint: err.constraint,
      stack: err.stack,
    });
    res.status(500).json({
      success: false,
      error: "DB_QUERY_FAILED",
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      table: err.table,
      column: err.column,
    });
    return;
  }

  const row = result.rows[0];

  if (!row) {
    console.log("[PALATA-USER] not found reason = no active palata_users row for id", { userId: meBody.user.id });
    res.status(404).json({ success: false, error: "PALATA_USER_NOT_FOUND" });
    return;
  }

  console.log("[PALATA-USER] found", { id: row.id, role: row.role, is_active: row.is_active });

  res.status(200).json({
    success: true,
    user: {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      role: row.role,
      is_active: row.is_active,
    },
  });
}

app.get("/api/palata/users/me", (req, res) => {
  handlePalataUserMe(req, res).catch((err) => {
    const stack = err instanceof Error ? err.stack : String(err);
    console.error("[PALATA-USER] ERROR stack =", stack);
    res.status(500).json({ success: false, error: String(err) });
  });
});

async function requireAdmin(req) {
  const authHeader = req.headers["authorization"] ?? "";
  const hasToken = authHeader.startsWith("Bearer ") && authHeader.slice(7).length > 0;
  if (!hasToken) return { ok: false, status: 401, error: "MISSING_TOKEN" };

  const token = authHeader.slice(7);

  let meBody;
  let meStatus;
  try {
    const meRes = await fetch(`${AUTH_SERVICE_URL}/api/auth/me`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    meStatus = meRes.status;
    const meText = await meRes.text();
    try {
      meBody = JSON.parse(meText);
    } catch {
      meBody = null;
    }
  } catch (err) {
    return { ok: false, status: 502, error: "AUTH_SERVICE_UNREACHABLE" };
  }

  if (meStatus !== 200 || !meBody || meBody.success !== true || !meBody.user?.id) {
    return { ok: false, status: 401, error: "INVALID_TOKEN" };
  }

  if (!pool) {
    return { ok: false, status: 503, error: "DATABASE_NOT_CONFIGURED" };
  }

  const result = await pool.query(
    `SELECT id, role, is_active FROM public.palata_users WHERE id = $1 AND is_active = true LIMIT 1`,
    [meBody.user.id],
  );
  const row = result.rows[0];
  if (!row || row.role !== "admin") {
    return { ok: false, status: 403, error: "FORBIDDEN" };
  }

  return { ok: true, userId: row.id };
}

function toNullable(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  return v;
}

function toDateOrNull(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  return v;
}

async function handleCertImport(req, res) {
  console.log("[CERT-IMPORT] start");

  let admin;
  try {
    admin = await requireAdmin(req);
  } catch (err) {
    console.error("[CERT-IMPORT] error", { stage: "auth", message: err.message });
    res.status(500).json({ success: false, error: "CERT_IMPORT_FAILED", message: "AUTH_CHECK_FAILED" });
    return;
  }

  if (!admin.ok) {
    res.status(admin.status).json({ success: false, error: admin.error });
    return;
  }

  console.log("[CERT-IMPORT] admin verified", { userId: admin.userId });

  const fileName = typeof req.body?.file_name === "string" ? req.body.file_name.trim() : "";
  const rows = req.body?.rows;
  const batchIndex = Number.isInteger(req.body?.batch_index) ? req.body.batch_index : 0;
  const batchCount = Number.isInteger(req.body?.batch_count) ? req.body.batch_count : 1;

  if (!fileName) {
    res.status(400).json({ success: false, error: "CERT_IMPORT_FAILED", message: "MISSING_FILE_NAME" });
    return;
  }

  if (!Array.isArray(rows)) {
    res.status(400).json({ success: false, error: "CERT_IMPORT_FAILED", message: "ROWS_MUST_BE_ARRAY" });
    return;
  }

  const isFirstBatch = batchIndex === 0;
  const isLastBatch = batchIndex === batchCount - 1;

  console.log("[CERT-IMPORT] rows received", {
    userId: admin.userId,
    fileName,
    count: rows.length,
    batchIndex,
    batchCount,
  });

  if (!pool) {
    res.status(503).json({ success: false, error: "CERT_IMPORT_FAILED", message: "DATABASE_NOT_CONFIGURED" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("[CERT-IMPORT] transaction started");

    if (isFirstBatch) {
      await client.query("TRUNCATE TABLE public.palata_certificates_import");
      console.log("[CERT-IMPORT] staging truncated");
    }

    for (const r of rows) {
      const certificateNumber = toNullable(r.certificate_number);
      const expertFullName = toNullable(r.expert_full_name);
      const validFrom = toDateOrNull(r.valid_from);
      const validTo = toDateOrNull(r.valid_to);
      const certificateStatus = toNullable(r.certificate_status);

      await client.query(
        `INSERT INTO public.palata_certificates_import
           (certificate_number, expert_full_name, specialty_text, certificate_period,
            codes, directions, valid_from, valid_to, certificate_status, load_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          certificateNumber,
          expertFullName,
          toNullable(r.specialty_text),
          toNullable(r.certificate_period),
          toNullable(r.codes),
          toNullable(r.directions),
          validFrom,
          validTo,
          certificateStatus,
          toNullable(r.load_status),
        ],
      );
    }
    console.log("[CERT-IMPORT] rows inserted", {
      userId: admin.userId,
      count: rows.length,
      batchIndex,
      batchCount,
    });

    if (!isLastBatch) {
      await client.query("COMMIT");
      console.log("[CERT-IMPORT] commit", { userId: admin.userId, fileName, batchIndex, batchCount });
      res.status(200).json({ success: true, batch_ack: true, batch_index: batchIndex });
      return;
    }

    const statsResult = await client.query(
      `SELECT
         count(*)::integer AS total,
         count(*) FILTER (WHERE certificate_status = 'Активный')::integer AS active,
         count(*) FILTER (WHERE certificate_status = 'Истёкший')::integer AS expired,
         count(*) FILTER (WHERE certificate_number IS NULL OR expert_full_name IS NULL)::integer AS parse_errors
       FROM public.palata_certificates_import`,
    );
    const { total, active, expired, parse_errors: parseErrors } = statsResult.rows[0];
    const linkedExpertsCount = 0;
    const unlinkedExpertsCount = total;

    // ── ETL: palata_certificates_import → palata_certificates ─────────────────
    // Перенесено из старой etl_process_certificate_import (v2).
    // Нормализация номера и ФИО, парсинг кодов специальностей из поля codes
    // (или через regex из specialty_text), INSERT/UPDATE по уникальному ключу
    // (certificate_number, specialty_text, certificate_period).
    // Строки без certificate_number пропускаются (фильтр WHERE).
    const etlResult = await client.query(
      `INSERT INTO public.palata_certificates (
         certificate_number, expert_full_name, specialty_text, certificate_period,
         specialty_code, valid_from, valid_to, is_active, source_file_name, source_loaded_at
       )
       SELECT
         trim(COALESCE(certificate_number, ''))  AS certificate_number,
         trim(COALESCE(expert_full_name, ''))    AS expert_full_name,
         COALESCE(specialty_text, '')            AS specialty_text,
         COALESCE(certificate_period, '')        AS certificate_period,
         CASE
           WHEN codes IS NOT NULL AND trim(codes) != ''
             THEN trim(codes)
           WHEN specialty_text IS NOT NULL AND specialty_text ~ '\\d+\\.\\d+'
             THEN array_to_string(
               ARRAY(
                 SELECT DISTINCT m[1]
                 FROM regexp_matches(specialty_text, '(\\d+\\.\\d+)', 'g') AS m
                 ORDER BY m[1]
               ), ','
             )
           ELSE NULL
         END                                     AS specialty_code,
         valid_from,
         valid_to,
         (certificate_status = 'Активный')       AS is_active,
         $1                                      AS source_file_name,
         now()                                   AS source_loaded_at
       FROM public.palata_certificates_import
       WHERE trim(COALESCE(certificate_number, '')) != ''
       ON CONFLICT ON CONSTRAINT palata_certificates_certificate_number_specialty_text_certi_key DO UPDATE SET
         expert_full_name   = EXCLUDED.expert_full_name,
         specialty_code     = EXCLUDED.specialty_code,
         valid_from         = EXCLUDED.valid_from,
         valid_to           = EXCLUDED.valid_to,
         is_active          = EXCLUDED.is_active,
         source_file_name   = EXCLUDED.source_file_name,
         source_loaded_at   = EXCLUDED.source_loaded_at,
         updated_at         = now()`,
      [fileName],
    );
    const certsUpserted = etlResult.rowCount ?? 0;
    console.log("[CERT-IMPORT] etl done", { userId: admin.userId, fileName, certsUpserted });

    const logResult = await client.query(
      `INSERT INTO public.palata_certificate_import_logs
         (created_by, file_name, total_rows, active_count, expired_count,
          parse_error_count, linked_experts_count, unlinked_experts_count, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, created_at`,
      [
        admin.userId,
        fileName,
        total,
        active,
        expired,
        parseErrors,
        linkedExpertsCount,
        unlinkedExpertsCount,
        "ok",
        null,
      ],
    );
    console.log("[CERT-IMPORT] log inserted", { userId: admin.userId, fileName, logId: logResult.rows[0]?.id });

    await client.query("COMMIT");
    console.log("[CERT-IMPORT] commit", { userId: admin.userId, fileName, batchIndex, batchCount });

    res.status(200).json({
      success: true,
      result: {
        total,
        active,
        expired,
        parse_errors: parseErrors,
        certs_upserted: certsUpserted,
        linked_experts: linkedExpertsCount,
        unlinked_experts: unlinkedExpertsCount,
        file_name: fileName,
        created_at: logResult.rows[0]?.created_at ?? null,
      },
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
      console.log("[CERT-IMPORT] rollback", { userId: admin.userId, fileName });
    } catch (rollbackErr) {
      console.error("[CERT-IMPORT] error", { stage: "rollback", message: rollbackErr.message });
    }

    console.error("[CERT-IMPORT] error", {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      table: err.table,
      column: err.column,
      constraint: err.constraint,
    });

    res.status(500).json({
      success: false,
      error: "CERT_IMPORT_FAILED",
      message: err.message,
    });
  } finally {
    client.release();
  }
}

app.post("/api/palata/cert-import", (req, res) => {
  handleCertImport(req, res).catch((err) => {
    const stack = err instanceof Error ? err.stack : String(err);
    console.error("[CERT-IMPORT] error", { stage: "unhandled", stack });
    res.status(500).json({ success: false, error: "CERT_IMPORT_FAILED", message: String(err) });
  });
});

async function handleCertImportStats(req, res) {
  let admin;
  try {
    admin = await requireAdmin(req);
  } catch (err) {
    console.error("[CERT-IMPORT-STATS] error", { message: err.message });
    res.status(500).json({ success: false, error: "STATS_FAILED", message: "AUTH_CHECK_FAILED" });
    return;
  }

  if (!admin.ok) {
    res.status(admin.status).json({ success: false, error: admin.error });
    return;
  }

  if (!pool) {
    res.status(503).json({ success: false, error: "STATS_FAILED", message: "DATABASE_NOT_CONFIGURED" });
    return;
  }

  try {
    const logResult = await pool.query(
      `SELECT
         created_at,
         file_name,
         total_rows,
         active_count,
         expired_count,
         parse_error_count,
         linked_experts_count,
         unlinked_experts_count,
         status,
         error_message
       FROM public.palata_certificate_import_logs
       ORDER BY created_at DESC
       LIMIT 1`,
    );

    const countResult = await pool.query(
      `SELECT count(*)::integer AS total FROM public.palata_certificates_import`,
    );

    const last = logResult.rows[0] ?? null;

    console.log("[CERT-IMPORT-STATS] success", { userId: admin.userId, hasLog: Boolean(last) });

    res.status(200).json({
      success: true,
      stats: {
        total: countResult.rows[0]?.total ?? 0,
        active: last?.active_count ?? 0,
        expired: last?.expired_count ?? 0,
        parse_errors: last?.parse_error_count ?? 0,
        linked_experts: last?.linked_experts_count ?? 0,
        unlinked_experts: last?.unlinked_experts_count ?? 0,
        last_upload_at: last?.created_at ?? null,
        file_name: last?.file_name ?? null,
        status: last?.status ?? null,
      },
    });
  } catch (err) {
    console.error("[CERT-IMPORT-STATS] error", {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      table: err.table,
      column: err.column,
    });
    res.status(500).json({ success: false, error: "STATS_FAILED", message: err.message });
  }
}

app.get("/api/palata/cert-import/stats", (req, res) => {
  handleCertImportStats(req, res).catch((err) => {
    const stack = err instanceof Error ? err.stack : String(err);
    console.error("[CERT-IMPORT-STATS] error", { stage: "unhandled", stack });
    res.status(500).json({ success: false, error: "STATS_FAILED", message: String(err) });
  });
});

async function handleCustomerRegisterCheckEmail(req, res) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";

  if (!email) {
    res.status(400).json({ success: false, error: "MISSING_EMAIL" });
    return;
  }

  if (!pool) {
    res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" });
    return;
  }

  console.log("[CUSTOMER-REGISTER] check email");

  try {
    const result = await pool.query(
      `SELECT id FROM public.palata_users WHERE lower(email) = lower($1) LIMIT 1`,
      [email],
    );

    if (result.rows.length > 0) {
      res.status(200).json({ success: false, error: "EMAIL_ALREADY_EXISTS" });
      return;
    }

    console.log("[CUSTOMER-REGISTER] success", { stage: "check_email" });
    res.status(200).json({ success: true, exists: false });
  } catch (err) {
    console.error("[CUSTOMER-REGISTER] error", { stage: "check_email", message: err.message });
    res.status(500).json({ success: false, error: "CHECK_EMAIL_FAILED", message: err.message });
  }
}

async function handleCustomerRegisterCreateUser(req, res) {
  const id = typeof req.body?.id === "string" ? req.body.id : "";
  const role = typeof req.body?.role === "string" ? req.body.role : "";
  const fullName = typeof req.body?.full_name === "string" ? req.body.full_name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const phone = typeof req.body?.phone === "string" && req.body.phone.trim() ? req.body.phone.trim() : null;
  const isActive = req.body?.is_active !== false;

  if (!id || !role || !fullName || !email) {
    res.status(400).json({ success: false, error: "MISSING_FIELDS" });
    return;
  }

  if (!pool) {
    res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" });
    return;
  }

  console.log("[CUSTOMER-REGISTER] insert user", { id, role });

  try {
    await pool.query(
      `INSERT INTO public.palata_users (id, role, full_name, email, phone, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, role, fullName, email, phone, isActive],
    );

    console.log("[CUSTOMER-REGISTER] success", { stage: "insert_user", id });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("[CUSTOMER-REGISTER] error", {
      stage: "insert_user",
      message: err.message,
      code: err.code,
      detail: err.detail,
      constraint: err.constraint,
    });
    res.status(500).json({ success: false, error: "USER_INSERT_FAILED", message: err.message });
  }
}

function buildCustomerProfileParams(body) {
  return {
    userId:      typeof body?.user_id === "string" ? body.user_id : "",
    companyName: typeof body?.company_name === "string" && body.company_name.trim() ? body.company_name.trim() : null,
    inn:         typeof body?.inn === "string" && body.inn.trim() ? body.inn.trim() : null,
    contactName: typeof body?.contact_name === "string" && body.contact_name.trim() ? body.contact_name.trim() : null,
    notes:       typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
    regionId:    typeof body?.region_id === "string" && body.region_id ? body.region_id : null,
  };
}

async function runCustomerProfileUpsert(pool, { userId, companyName, inn, contactName, notes, regionId }) {
  await pool.query(
    `INSERT INTO public.palata_customer_profiles
       (user_id, company_name, inn, contact_name, notes, region_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       company_name = EXCLUDED.company_name,
       inn          = EXCLUDED.inn,
       contact_name = EXCLUDED.contact_name,
       notes        = EXCLUDED.notes,
       region_id    = EXCLUDED.region_id,
       updated_at   = now()`,
    [userId, companyName, inn, contactName, notes, regionId],
  );
}

async function handleCustomerRegisterUpsertProfile(req, res) {
  const params = buildCustomerProfileParams(req.body);

  if (!params.userId) {
    res.status(400).json({ success: false, error: "MISSING_USER_ID" });
    return;
  }

  if (!pool) {
    res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" });
    return;
  }

  console.log("[CUSTOMER-REGISTER] upsert profile", { userId: params.userId });

  try {
    await runCustomerProfileUpsert(pool, params);
    console.log("[CUSTOMER-REGISTER] success", { stage: "upsert_profile", userId: params.userId });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("[CUSTOMER-REGISTER] error", {
      stage: "upsert_profile",
      message: err.message,
      code: err.code,
      detail: err.detail,
      constraint: err.constraint,
    });
    res.status(500).json({ success: false, error: "PROFILE_UPSERT_FAILED", message: err.message });
  }
}

async function handleCustomerProfileUpsert(req, res) {
  const params = buildCustomerProfileParams(req.body);

  if (!params.userId) {
    res.status(400).json({ success: false, error: "MISSING_USER_ID" });
    return;
  }

  if (!pool) {
    res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" });
    return;
  }

  console.log("[CUSTOMER-PROFILE] upsert", { userId: params.userId });

  try {
    await runCustomerProfileUpsert(pool, params);
    console.log("[CUSTOMER-PROFILE] success", { stage: "upsert", userId: params.userId });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("[CUSTOMER-PROFILE] error", {
      stage: "upsert",
      message: err.message,
      code: err.code,
      detail: err.detail,
      constraint: err.constraint,
    });
    res.status(500).json({ success: false, error: "PROFILE_UPSERT_FAILED", message: err.message });
  }
}

async function handleCustomerProfileGet(req, res) {
  const userId = typeof req.params?.userId === "string" ? req.params.userId : "";

  if (!userId) {
    res.status(400).json({ success: false, error: "MISSING_USER_ID" });
    return;
  }

  if (!pool) {
    res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" });
    return;
  }

  console.log("[CUSTOMER-PROFILE] get", { userId });

  try {
    const result = await pool.query(
      `SELECT cp.user_id, cp.company_name, cp.contact_name, cp.notes,
              cp.region_id, cp.created_at, cp.updated_at,
              r.name AS region_name
       FROM public.palata_customer_profiles cp
       LEFT JOIN public.palata_regions r ON r.id = cp.region_id
       WHERE cp.user_id = $1`,
      [userId],
    );

    if (result.rows.length === 0) {
      console.log("[CUSTOMER-PROFILE] success", { stage: "get", userId, found: false });
      res.status(200).json({ success: true, profile: null });
      return;
    }

    const row = result.rows[0];
    const profile = {
      user_id:         row.user_id,
      company_name:    row.company_name ?? null,
      contact_name:    row.contact_name ?? null,
      notes:           row.notes ?? null,
      region_id:       row.region_id ?? null,
      created_at:      row.created_at ?? null,
      updated_at:      row.updated_at ?? null,
      palata_regions:  row.region_name ? { name: row.region_name } : null,
    };

    console.log("[CUSTOMER-PROFILE] success", { stage: "get", userId, found: true });
    res.status(200).json({ success: true, profile });
  } catch (err) {
    console.error("[CUSTOMER-PROFILE] error", { stage: "get", message: err.message });
    res.status(500).json({ success: false, error: "GET_PROFILE_FAILED", message: err.message });
  }
}

async function handleCustomerProfileList(req, res) {
  if (!pool) {
    res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" });
    return;
  }

  console.log("[CUSTOMER-PROFILE] list");

  try {
    const result = await pool.query(
      `SELECT user_id FROM public.palata_customer_profiles`,
    );

    console.log("[CUSTOMER-PROFILE] success", { stage: "list", count: result.rows.length });
    res.status(200).json({ success: true, rows: result.rows });
  } catch (err) {
    console.error("[CUSTOMER-PROFILE] error", { stage: "list", message: err.message });
    res.status(500).json({ success: false, error: "LIST_FAILED", message: err.message });
  }
}

async function handleCustomerRegisterGetRole(req, res) {
  const id = typeof req.params?.id === "string" ? req.params.id : "";

  if (!id) {
    res.status(400).json({ success: false, error: "MISSING_ID" });
    return;
  }

  if (!pool) {
    res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT role FROM public.palata_users WHERE id = $1`,
      [id],
    );

    console.log("[CUSTOMER-REGISTER] success", { stage: "get_role", id });
    res.status(200).json({ success: true, role: result.rows[0]?.role ?? null });
  } catch (err) {
    console.error("[CUSTOMER-REGISTER] error", { stage: "get_role", message: err.message });
    res.status(500).json({ success: false, error: "GET_ROLE_FAILED", message: err.message });
  }
}

app.post("/api/palata/customer-register/check-email", (req, res) => {
  handleCustomerRegisterCheckEmail(req, res).catch((err) => {
    console.error("[CUSTOMER-REGISTER] error", { stage: "unhandled_check_email", stack: err.stack });
    res.status(500).json({ success: false, error: "CHECK_EMAIL_FAILED", message: String(err) });
  });
});

app.post("/api/palata/customer-register/create-user", (req, res) => {
  handleCustomerRegisterCreateUser(req, res).catch((err) => {
    console.error("[CUSTOMER-REGISTER] error", { stage: "unhandled_insert_user", stack: err.stack });
    res.status(500).json({ success: false, error: "USER_INSERT_FAILED", message: String(err) });
  });
});

app.post("/api/palata/customer-register/upsert-profile", (req, res) => {
  handleCustomerRegisterUpsertProfile(req, res).catch((err) => {
    console.error("[CUSTOMER-REGISTER] error", { stage: "unhandled_upsert_profile", stack: err.stack });
    res.status(500).json({ success: false, error: "PROFILE_UPSERT_FAILED", message: String(err) });
  });
});

app.get("/api/palata/customer-register/role/:id", (req, res) => {
  handleCustomerRegisterGetRole(req, res).catch((err) => {
    console.error("[CUSTOMER-REGISTER] error", { stage: "unhandled_get_role", stack: err.stack });
    res.status(500).json({ success: false, error: "GET_ROLE_FAILED", message: String(err) });
  });
});

app.get("/api/palata/customer-profile", (req, res) => {
  handleCustomerProfileList(req, res).catch((err) => {
    console.error("[CUSTOMER-PROFILE] error", { stage: "unhandled_list", stack: err.stack });
    res.status(500).json({ success: false, error: "LIST_FAILED", message: String(err) });
  });
});

app.get("/api/palata/customer-profile/:userId", (req, res) => {
  handleCustomerProfileGet(req, res).catch((err) => {
    console.error("[CUSTOMER-PROFILE] error", { stage: "unhandled_get", stack: err.stack });
    res.status(500).json({ success: false, error: "GET_PROFILE_FAILED", message: String(err) });
  });
});

app.post("/api/palata/customer-profile", (req, res) => {
  handleCustomerProfileUpsert(req, res).catch((err) => {
    console.error("[CUSTOMER-PROFILE] error", { stage: "unhandled_upsert", stack: err.stack });
    res.status(500).json({ success: false, error: "PROFILE_UPSERT_FAILED", message: String(err) });
  });
});

app.use(express.static(STATIC_DIR));

app.get(/(.*)/, (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    next();
    return;
  }
  res.sendFile(path.join(STATIC_DIR, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[PALATA-PROD-SERVER] listening on port ${PORT}`);
  console.log(`[PALATA-PROD-SERVER] serving static files from ${STATIC_DIR}`);
  console.log(`[PALATA-PROD-SERVER] proxying /api/auth/* -> ${AUTH_SERVICE_URL}/api/auth/*`);
});
