import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
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
       SELECT DISTINCT ON (
         trim(COALESCE(certificate_number, '')),
         COALESCE(specialty_text, ''),
         COALESCE(certificate_period, '')
       )
         trim(COALESCE(certificate_number, ''))  AS certificate_number,
         trim(COALESCE(expert_full_name, ''))    AS expert_full_name,
         COALESCE(specialty_text, '')            AS specialty_text,
         COALESCE(certificate_period, '')        AS certificate_period,
         CASE
           WHEN codes IS NOT NULL AND trim(codes) != ''
             THEN regexp_replace(trim(codes), '\\s*,\\s*', ',', 'g')
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
       ORDER BY
         trim(COALESCE(certificate_number, '')),
         COALESCE(specialty_text, ''),
         COALESCE(certificate_period, ''),
         valid_to DESC NULLS LAST,
         valid_from DESC NULLS LAST,
         ctid DESC
       ON CONFLICT (certificate_number, specialty_text, certificate_period) DO UPDATE SET
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

// ─── Expert Profile ───────────────────────────────────────────────────────────

async function handleExpertProfileGet(req, res) {
  const userId = typeof req.params?.userId === "string" ? req.params.userId.trim() : "";
  if (!userId) { res.status(400).json({ success: false, error: "MISSING_USER_ID" }); return; }
  if (!pool) { res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" }); return; }
  console.log("[EXPERT-PROFILE] get", { userId });
  try {
    const result = await pool.query(
      `SELECT id, user_id, status, experience_years, education, certifications,
              accepts_requests, business_trip_ready,
              palata_registry_verified, palata_registry_number,
              centrsudexpert_verified, centrsudexpert_registry_number,
              avg_customer_rating, completed_orders_count, decline_rate,
              bio, created_at, updated_at
       FROM public.palata_expert_profiles
       WHERE user_id = $1
       LIMIT 1`,
      [userId],
    );
    const profile = result.rows[0] ?? null;
    console.log("[EXPERT-PROFILE] success", { stage: "get", userId, found: Boolean(profile) });
    res.status(200).json({ success: true, profile });
  } catch (err) {
    console.error("[EXPERT-PROFILE] error", { stage: "get", message: err.message });
    res.status(500).json({ success: false, error: "GET_PROFILE_FAILED", message: err.message });
  }
}

async function handleExpertProfileList(req, res) {
  if (!pool) { res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" }); return; }
  const userIdsRaw = typeof req.query?.user_ids === "string" ? req.query.user_ids.trim() : "";
  const userIds = userIdsRaw ? userIdsRaw.split(",").map(s => s.trim()).filter(Boolean) : null;
  const acceptsRequests = req.query?.accepts_requests === "true" ? true : null;
  console.log("[EXPERT-PROFILE] list", { userIdsCount: userIds?.length ?? "all", acceptsRequests });
  try {
    let sql = `SELECT id, user_id, status, experience_years, education, certifications,
                      accepts_requests, business_trip_ready,
                      palata_registry_verified, palata_registry_number,
                      centrsudexpert_verified, centrsudexpert_registry_number,
                      avg_customer_rating, completed_orders_count, decline_rate,
                      bio, created_at, updated_at
               FROM public.palata_expert_profiles`;
    const params = [];
    const conditions = [];
    if (userIds && userIds.length > 0) {
      params.push(userIds);
      conditions.push(`user_id = ANY($${params.length})`);
    }
    if (acceptsRequests === true) {
      conditions.push("accepts_requests = true");
    }
    if (conditions.length > 0) sql += " WHERE " + conditions.join(" AND ");
    const result = await pool.query(sql, params);
    console.log("[EXPERT-PROFILE] success", { stage: "list", count: result.rows.length });
    res.status(200).json({ success: true, rows: result.rows });
  } catch (err) {
    console.error("[EXPERT-PROFILE] error", { stage: "list", message: err.message });
    res.status(500).json({ success: false, error: "LIST_FAILED", message: err.message });
  }
}

async function handleExpertProfileUpsert(req, res) {
  const body = req.body ?? {};
  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  if (!userId) { res.status(400).json({ success: false, error: "MISSING_USER_ID" }); return; }
  if (!pool) { res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" }); return; }
  const bio             = typeof body.bio === "string" ? body.bio : null;
  const expYears        = body.experience_years != null ? (parseInt(body.experience_years) || null) : null;
  const education       = typeof body.education === "string" ? body.education : null;
  const tripReady       = typeof body.business_trip_ready === "boolean" ? body.business_trip_ready : false;
  const accepts         = typeof body.accepts_requests === "boolean" ? body.accepts_requests : true;
  const palataOk        = typeof body.palata_registry_verified === "boolean" ? body.palata_registry_verified : false;
  const palataNum       = typeof body.palata_registry_number === "string" ? body.palata_registry_number : null;
  const centrsudOk      = typeof body.centrsudexpert_verified === "boolean" ? body.centrsudexpert_verified : false;
  const centrsudNum     = typeof body.centrsudexpert_registry_number === "string" ? body.centrsudexpert_registry_number : null;
  const completedOrders = body.completed_orders_count != null ? (parseInt(body.completed_orders_count) || 0) : 0;
  console.log("[EXPERT-PROFILE] upsert", { userId });
  try {
    await pool.query(
      `INSERT INTO public.palata_expert_profiles (
         user_id, bio, experience_years, education,
         business_trip_ready, accepts_requests,
         palata_registry_verified, palata_registry_number,
         centrsudexpert_verified, centrsudexpert_registry_number,
         completed_orders_count
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id) DO UPDATE SET
         bio                             = EXCLUDED.bio,
         experience_years                = EXCLUDED.experience_years,
         education                       = EXCLUDED.education,
         business_trip_ready             = EXCLUDED.business_trip_ready,
         accepts_requests                = EXCLUDED.accepts_requests,
         palata_registry_verified        = EXCLUDED.palata_registry_verified,
         palata_registry_number          = EXCLUDED.palata_registry_number,
         centrsudexpert_verified         = EXCLUDED.centrsudexpert_verified,
         centrsudexpert_registry_number  = EXCLUDED.centrsudexpert_registry_number,
         completed_orders_count          = EXCLUDED.completed_orders_count,
         updated_at                      = now()`,
      [userId, bio, expYears, education, tripReady, accepts,
       palataOk, palataNum, centrsudOk, centrsudNum, completedOrders],
    );
    console.log("[EXPERT-PROFILE] success", { stage: "upsert", userId });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("[EXPERT-PROFILE] error", { stage: "upsert", message: err.message, code: err.code, constraint: err.constraint });
    res.status(500).json({ success: false, error: "PROFILE_UPSERT_FAILED", message: err.message });
  }
}

app.get("/api/palata/expert-profile", (req, res) => {
  handleExpertProfileList(req, res).catch(err => {
    console.error("[EXPERT-PROFILE] error", { stage: "unhandled_list", stack: err.stack });
    res.status(500).json({ success: false, error: "LIST_FAILED", message: String(err) });
  });
});

app.get("/api/palata/expert-profile/:userId", (req, res) => {
  handleExpertProfileGet(req, res).catch(err => {
    console.error("[EXPERT-PROFILE] error", { stage: "unhandled_get", stack: err.stack });
    res.status(500).json({ success: false, error: "GET_PROFILE_FAILED", message: String(err) });
  });
});

app.post("/api/palata/expert-profile", (req, res) => {
  handleExpertProfileUpsert(req, res).catch(err => {
    console.error("[EXPERT-PROFILE] error", { stage: "unhandled_upsert", stack: err.stack });
    res.status(500).json({ success: false, error: "PROFILE_UPSERT_FAILED", message: String(err) });
  });
});

// ─── Expert Regions ───────────────────────────────────────────────────────────

async function handleExpertRegionsList(req, res) {
  if (!pool) { res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" }); return; }
  const expertIdsRaw = typeof req.query?.expert_ids === "string" ? req.query.expert_ids.trim() : "";
  const expertIds = expertIdsRaw ? expertIdsRaw.split(",").map(s => s.trim()).filter(Boolean) : null;
  console.log("[EXPERT-REGIONS] list", { expertIdsCount: expertIds?.length ?? "all" });
  try {
    let sql = `SELECT er.expert_id, er.region_id, r.name AS region_name
               FROM public.palata_expert_regions er
               LEFT JOIN public.palata_regions r ON r.id = er.region_id`;
    const params = [];
    if (expertIds && expertIds.length > 0) {
      params.push(expertIds);
      sql += ` WHERE er.expert_id = ANY($1)`;
    }
    const result = await pool.query(sql, params);
    console.log("[EXPERT-REGIONS] success", { stage: "list", count: result.rows.length });
    res.status(200).json({ success: true, rows: result.rows });
  } catch (err) {
    console.error("[EXPERT-REGIONS] error", { stage: "list", message: err.message });
    res.status(500).json({ success: false, error: "LIST_FAILED", message: err.message });
  }
}

async function handleExpertRegionsGet(req, res) {
  const expertId = typeof req.params?.expertId === "string" ? req.params.expertId.trim() : "";
  if (!expertId) { res.status(400).json({ success: false, error: "MISSING_EXPERT_ID" }); return; }
  if (!pool) { res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" }); return; }
  console.log("[EXPERT-REGIONS] get", { expertId });
  try {
    const result = await pool.query(
      `SELECT er.region_id, r.name AS region_name
       FROM public.palata_expert_regions er
       LEFT JOIN public.palata_regions r ON r.id = er.region_id
       WHERE er.expert_id = $1`,
      [expertId],
    );
    console.log("[EXPERT-REGIONS] success", { stage: "get", expertId, count: result.rows.length });
    res.status(200).json({ success: true, rows: result.rows });
  } catch (err) {
    console.error("[EXPERT-REGIONS] error", { stage: "get", message: err.message });
    res.status(500).json({ success: false, error: "GET_REGIONS_FAILED", message: err.message });
  }
}

async function handleExpertRegionsReplace(req, res) {
  // 1. Bearer token required
  const authHeader = req.headers["authorization"] ?? "";
  const hasToken = authHeader.startsWith("Bearer ") && authHeader.slice(7).length > 0;
  if (!hasToken) {
    res.status(401).json({ success: false, error: "MISSING_TOKEN" });
    return;
  }
  const token = authHeader.slice(7);

  // 2. Resolve expert_id from token via /api/auth/me
  let meBody;
  let meStatus;
  try {
    const meRes = await fetch(`${AUTH_SERVICE_URL}/api/auth/me`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    meStatus = meRes.status;
    const meText = await meRes.text();
    try { meBody = JSON.parse(meText); } catch { meBody = null; }
  } catch (err) {
    console.error("[EXPERT-REGIONS] auth /me request failed", { error: String(err) });
    res.status(502).json({ success: false, error: "AUTH_SERVICE_UNREACHABLE" });
    return;
  }
  if (meStatus !== 200 || !meBody || meBody.success !== true || !meBody.user?.id) {
    res.status(401).json({ success: false, error: "INVALID_TOKEN" });
    return;
  }
  const expertId = meBody.user.id;

  if (!pool) { res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" }); return; }

  // 3. Deduplicate region_ids via Set
  const body = req.body ?? {};
  const rawIds = Array.isArray(body.region_ids)
    ? body.region_ids.filter(id => typeof id === "string")
    : [];
  const regionIds = [...new Set(rawIds)];

  console.log("[EXPERT-REGIONS] replace", { expertId, count: regionIds.length });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM public.palata_expert_regions WHERE expert_id = $1`,
      [expertId],
    );
    if (regionIds.length > 0) {
      const placeholders = regionIds.map((_, i) => `($1, $${i + 2})`).join(", ");
      await client.query(
        `INSERT INTO public.palata_expert_regions (expert_id, region_id) VALUES ${placeholders}`,
        [expertId, ...regionIds],
      );
    }
    await client.query("COMMIT");
    console.log("[EXPERT-REGIONS] success", { stage: "replace", expertId, count: regionIds.length });
    res.status(200).json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[EXPERT-REGIONS] error", { stage: "replace", message: err.message, code: err.code });
    res.status(500).json({ success: false, error: "REPLACE_FAILED", message: err.message });
  } finally {
    client.release();
  }
}

app.get("/api/palata/expert-regions", (req, res) => {
  handleExpertRegionsList(req, res).catch(err => {
    console.error("[EXPERT-REGIONS] error", { stage: "unhandled_list", stack: err.stack });
    res.status(500).json({ success: false, error: "LIST_FAILED", message: String(err) });
  });
});

app.get("/api/palata/expert-regions/:expertId", (req, res) => {
  handleExpertRegionsGet(req, res).catch(err => {
    console.error("[EXPERT-REGIONS] error", { stage: "unhandled_get", stack: err.stack });
    res.status(500).json({ success: false, error: "GET_REGIONS_FAILED", message: String(err) });
  });
});

app.post("/api/palata/expert-regions", (req, res) => {
  handleExpertRegionsReplace(req, res).catch(err => {
    console.error("[EXPERT-REGIONS] error", { stage: "unhandled_replace", stack: err.stack });
    res.status(500).json({ success: false, error: "REPLACE_FAILED", message: String(err) });
  });
});

// ─── Expert Directions ────────────────────────────────────────────────────────

async function handleExpertDirectionsList(req, res) {
  if (!pool) { res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" }); return; }
  const expertIdsRaw = typeof req.query?.expert_ids === "string" ? req.query.expert_ids.trim() : "";
  const expertIds = expertIdsRaw ? expertIdsRaw.split(",").map(s => s.trim()).filter(Boolean) : null;
  console.log("[EXPERT-DIRECTIONS] list", { expertIdsCount: expertIds?.length ?? "all" });
  try {
    let sql = `SELECT ed.expert_id, ed.expertise_direction_id, d.name AS direction_name
               FROM public.palata_expert_directions ed
               LEFT JOIN public.palata_expertise_directions d ON d.id = ed.expertise_direction_id`;
    const params = [];
    if (expertIds && expertIds.length > 0) {
      params.push(expertIds);
      sql += ` WHERE ed.expert_id = ANY($1)`;
    }
    const result = await pool.query(sql, params);
    console.log("[EXPERT-DIRECTIONS] success", { stage: "list", count: result.rows.length });
    res.status(200).json({ success: true, rows: result.rows });
  } catch (err) {
    console.error("[EXPERT-DIRECTIONS] error", { stage: "list", message: err.message });
    res.status(500).json({ success: false, error: "LIST_FAILED", message: err.message });
  }
}

async function handleExpertDirectionsGet(req, res) {
  const expertId = typeof req.params?.expertId === "string" ? req.params.expertId.trim() : "";
  if (!expertId) { res.status(400).json({ success: false, error: "MISSING_EXPERT_ID" }); return; }
  if (!pool) { res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" }); return; }
  console.log("[EXPERT-DIRECTIONS] get", { expertId });
  try {
    const result = await pool.query(
      `SELECT ed.expertise_direction_id, d.name AS direction_name
       FROM public.palata_expert_directions ed
       LEFT JOIN public.palata_expertise_directions d ON d.id = ed.expertise_direction_id
       WHERE ed.expert_id = $1`,
      [expertId],
    );
    console.log("[EXPERT-DIRECTIONS] success", { stage: "get", expertId, count: result.rows.length });
    res.status(200).json({ success: true, rows: result.rows });
  } catch (err) {
    console.error("[EXPERT-DIRECTIONS] error", { stage: "get", message: err.message });
    res.status(500).json({ success: false, error: "GET_DIRECTIONS_FAILED", message: err.message });
  }
}

async function handleExpertDirectionsReplace(req, res) {
  // 1. Bearer token required
  const authHeader = req.headers["authorization"] ?? "";
  const hasToken = authHeader.startsWith("Bearer ") && authHeader.slice(7).length > 0;
  if (!hasToken) {
    res.status(401).json({ success: false, error: "MISSING_TOKEN" });
    return;
  }
  const token = authHeader.slice(7);

  // 2. Resolve expert_id from token via /api/auth/me
  let meBody;
  let meStatus;
  try {
    const meRes = await fetch(`${AUTH_SERVICE_URL}/api/auth/me`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    meStatus = meRes.status;
    const meText = await meRes.text();
    try { meBody = JSON.parse(meText); } catch { meBody = null; }
  } catch (err) {
    console.error("[EXPERT-DIRECTIONS] auth /me request failed", { error: String(err) });
    res.status(502).json({ success: false, error: "AUTH_SERVICE_UNREACHABLE" });
    return;
  }
  if (meStatus !== 200 || !meBody || meBody.success !== true || !meBody.user?.id) {
    res.status(401).json({ success: false, error: "INVALID_TOKEN" });
    return;
  }
  const expertId = meBody.user.id;

  if (!pool) { res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" }); return; }

  // 3. Deduplicate direction_ids via Set
  const body = req.body ?? {};
  const rawIds = Array.isArray(body.direction_ids)
    ? body.direction_ids.filter(id => typeof id === "string")
    : [];
  const directionIds = [...new Set(rawIds)];

  console.log("[EXPERT-DIRECTIONS] replace", { expertId, count: directionIds.length });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM public.palata_expert_directions WHERE expert_id = $1`,
      [expertId],
    );
    if (directionIds.length > 0) {
      const placeholders = directionIds.map((_, i) => `($1, $${i + 2})`).join(", ");
      await client.query(
        `INSERT INTO public.palata_expert_directions (expert_id, expertise_direction_id) VALUES ${placeholders}`,
        [expertId, ...directionIds],
      );
    }
    await client.query("COMMIT");
    console.log("[EXPERT-DIRECTIONS] success", { stage: "replace", expertId, count: directionIds.length });
    res.status(200).json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[EXPERT-DIRECTIONS] error", { stage: "replace", message: err.message, code: err.code });
    res.status(500).json({ success: false, error: "REPLACE_FAILED", message: err.message });
  } finally {
    client.release();
  }
}

app.get("/api/palata/expert-directions", (req, res) => {
  handleExpertDirectionsList(req, res).catch(err => {
    console.error("[EXPERT-DIRECTIONS] error", { stage: "unhandled_list", stack: err.stack });
    res.status(500).json({ success: false, error: "LIST_FAILED", message: String(err) });
  });
});

app.get("/api/palata/expert-directions/:expertId", (req, res) => {
  handleExpertDirectionsGet(req, res).catch(err => {
    console.error("[EXPERT-DIRECTIONS] error", { stage: "unhandled_get", stack: err.stack });
    res.status(500).json({ success: false, error: "GET_DIRECTIONS_FAILED", message: String(err) });
  });
});

app.post("/api/palata/expert-directions", (req, res) => {
  handleExpertDirectionsReplace(req, res).catch(err => {
    console.error("[EXPERT-DIRECTIONS] error", { stage: "unhandled_replace", stack: err.stack });
    res.status(500).json({ success: false, error: "REPLACE_FAILED", message: String(err) });
  });
});

// ─── Expert Certificates ──────────────────────────────────────────────────────

async function handleExpertCertificateList(req, res) {
  if (!pool) { res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" }); return; }
  const expertIdsRaw = typeof req.query?.expert_ids === "string" ? req.query.expert_ids.trim() : "";
  const expertIds = expertIdsRaw ? expertIdsRaw.split(",").map(s => s.trim()).filter(Boolean) : null;
  const status = typeof req.query?.status === "string" ? req.query.status.trim() : null;
  const directionId = typeof req.query?.direction_id === "string" ? req.query.direction_id.trim() : null;
  const validFrom = typeof req.query?.valid_from === "string" ? req.query.valid_from.trim() : null;
  const validTo = typeof req.query?.valid_to === "string" ? req.query.valid_to.trim() : null;
  const limitRaw = typeof req.query?.limit === "string" ? parseInt(req.query.limit, 10) : null;
  const limit = limitRaw && limitRaw > 0 ? limitRaw : null;
  console.log("[EXPERT-CERT] list", { expertIdsCount: expertIds?.length ?? "all", status, directionId, validFrom, validTo, limit });
  const params = [];
  const conditions = [];
  if (expertIds && expertIds.length > 0) {
    params.push(expertIds);
    conditions.push(`ec.expert_id = ANY($${params.length})`);
  }
  if (status) {
    params.push(status);
    conditions.push(`ec.status = $${params.length}`);
  }
  if (directionId) {
    params.push(directionId);
    conditions.push(`ec.cert_direction_ids @> ARRAY[$${params.length}::uuid]`);
  }
  if (validFrom) {
    params.push(validFrom);
    conditions.push(`ec.cert_valid_to >= $${params.length}`);
  }
  if (validTo) {
    params.push(validTo);
    conditions.push(`ec.cert_valid_to <= $${params.length}`);
  }
  let sql = `SELECT ec.id, ec.expert_id, ec.certificate_number, ec.status, ec.cert_valid_to,
                    ec.cert_expert_name, ec.cert_direction_ids, ec.created_at, ec.updated_at
             FROM public.palata_expert_certificates ec`;
  if (conditions.length > 0) sql += ` WHERE ${conditions.join(" AND ")}`;
  sql += ` ORDER BY ec.cert_valid_to ASC`;
  if (limit) {
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
  }
  try {
    const result = await pool.query(sql, params);
    console.log("[EXPERT-CERT] success", { stage: "list", count: result.rows.length });
    res.status(200).json({ success: true, rows: result.rows });
  } catch (err) {
    console.error("[EXPERT-CERT] error", { stage: "list", message: err.message });
    res.status(500).json({ success: false, error: "LIST_FAILED", message: err.message });
  }
}

async function handleExpertCertificateGet(req, res) {
  const expertId = typeof req.params?.expertId === "string" ? req.params.expertId.trim() : "";
  if (!expertId) { res.status(400).json({ success: false, error: "MISSING_EXPERT_ID" }); return; }
  if (!pool) { res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" }); return; }
  console.log("[EXPERT-CERT] get", { expertId });
  try {
    const result = await pool.query(
      `SELECT ec.id, ec.expert_id, ec.certificate_number, ec.status, ec.cert_valid_to,
              ec.cert_expert_name, ec.cert_direction_ids, ec.created_at, ec.updated_at
       FROM public.palata_expert_certificates ec
       WHERE ec.expert_id = $1
       ORDER BY ec.cert_valid_to ASC`,
      [expertId],
    );
    console.log("[EXPERT-CERT] success", { stage: "get", expertId, count: result.rows.length });
    res.status(200).json({ success: true, rows: result.rows });
  } catch (err) {
    console.error("[EXPERT-CERT] error", { stage: "get", message: err.message });
    res.status(500).json({ success: false, error: "GET_CERT_FAILED", message: err.message });
  }
}

async function handleExpertCertificateReplace(req, res) {
  // 1. Bearer token required
  const authHeader = req.headers["authorization"] ?? "";
  const hasToken = authHeader.startsWith("Bearer ") && authHeader.slice(7).length > 0;
  if (!hasToken) {
    res.status(401).json({ success: false, error: "MISSING_TOKEN" });
    return;
  }
  const token = authHeader.slice(7);

  // 2. Resolve expert_id from token via /api/auth/me
  let meBody;
  let meStatus;
  try {
    const meRes = await fetch(`${AUTH_SERVICE_URL}/api/auth/me`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    meStatus = meRes.status;
    const meText = await meRes.text();
    try { meBody = JSON.parse(meText); } catch { meBody = null; }
  } catch (err) {
    console.error("[EXPERT-CERT] auth /me request failed", { error: String(err) });
    res.status(502).json({ success: false, error: "AUTH_SERVICE_UNREACHABLE" });
    return;
  }
  if (meStatus !== 200 || !meBody || meBody.success !== true || !meBody.user?.id) {
    res.status(401).json({ success: false, error: "INVALID_TOKEN" });
    return;
  }
  const expertId = meBody.user.id;

  if (!pool) { res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" }); return; }

  // 3. Parse certs from body (expert_id from token only, never from body)
  const body = req.body ?? {};
  const rawCerts = Array.isArray(body.certs) ? body.certs : [];
  const certs = rawCerts.filter(c => c && typeof c === "object");

  console.log("[EXPERT-CERT] replace", { expertId, count: certs.length });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM public.palata_expert_certificates WHERE expert_id = $1`,
      [expertId],
    );
    for (const cert of certs) {
      const dirIds = Array.isArray(cert.cert_direction_ids)
        ? cert.cert_direction_ids.filter(id => typeof id === "string")
        : [];
      await client.query(
        `INSERT INTO public.palata_expert_certificates
           (expert_id, certificate_number, status, cert_valid_to, cert_expert_name, cert_direction_ids)
         VALUES ($1, $2, $3, $4, $5, $6::uuid[])`,
        [
          expertId,
          typeof cert.certificate_number === "string" ? cert.certificate_number : null,
          typeof cert.status === "string" ? cert.status : "verified",
          cert.cert_valid_to ?? null,
          typeof cert.cert_expert_name === "string" ? cert.cert_expert_name : null,
          dirIds,
        ],
      );
    }
    await client.query("COMMIT");
    console.log("[EXPERT-CERT] success", { stage: "replace", expertId, count: certs.length });
    res.status(200).json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[EXPERT-CERT] error", { stage: "replace", message: err.message, code: err.code });
    res.status(500).json({ success: false, error: "REPLACE_FAILED", message: err.message });
  } finally {
    client.release();
  }
}

app.get("/api/palata/expert-certificate", (req, res) => {
  handleExpertCertificateList(req, res).catch(err => {
    console.error("[EXPERT-CERT] error", { stage: "unhandled_list", stack: err.stack });
    res.status(500).json({ success: false, error: "LIST_FAILED", message: String(err) });
  });
});

app.get("/api/palata/expert-certificate/:expertId", (req, res) => {
  handleExpertCertificateGet(req, res).catch(err => {
    console.error("[EXPERT-CERT] error", { stage: "unhandled_get", stack: err.stack });
    res.status(500).json({ success: false, error: "GET_CERT_FAILED", message: String(err) });
  });
});

app.post("/api/palata/expert-certificate", (req, res) => {
  handleExpertCertificateReplace(req, res).catch(err => {
    console.error("[EXPERT-CERT] error", { stage: "unhandled_replace", stack: err.stack });
    res.status(500).json({ success: false, error: "REPLACE_FAILED", message: String(err) });
  });
});

// ── GET /api/palata/expert-documents/:expertId — list documents for an expert ──

async function handleExpertDocumentsQuery(req, res) {
  const { expertId } = req.params;
  if (!expertId) {
    return res.status(400).json({ success: false, error: "MISSING_EXPERT_ID" });
  }
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, expert_id, doc_type, bucket_path, file_name, mime_type, size_bytes,
              verified, verified_by, verified_at, created_at, updated_at
       FROM public.palata_expert_documents
       WHERE expert_id = $1
       ORDER BY created_at DESC`,
      [expertId],
    );
    res.json({ success: true, rows });
  } catch (err) {
    console.error("[EXPERT-DOCUMENTS] query failed", { stack: err.stack });
    res.status(500).json({ success: false, error: "QUERY_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.get("/api/palata/expert-documents/:expertId", (req, res) => {
  handleExpertDocumentsQuery(req, res).catch(err => {
    console.error("[EXPERT-DOCUMENTS] query unhandled", { stack: err.stack });
    res.status(500).json({ success: false, error: "HANDLER_FAILED", message: String(err) });
  });
});

// ── POST /api/palata/expert-documents — insert a document record ──

async function handleExpertDocumentsInsert(req, res) {
  const { expert_id, doc_type, bucket_path, file_name, mime_type, size_bytes } = req.body ?? {};
  if (!expert_id || !doc_type || !bucket_path || !file_name) {
    return res.status(400).json({ success: false, error: "MISSING_REQUIRED_FIELDS" });
  }
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO public.palata_expert_documents
         (expert_id, doc_type, bucket_path, file_name, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [expert_id, doc_type, bucket_path, file_name, mime_type ?? null, size_bytes ?? null],
    );
    res.json({ success: true, id: rows[0]?.id });
  } catch (err) {
    console.error("[EXPERT-DOCUMENTS] insert failed", { stack: err.stack });
    res.status(500).json({ success: false, error: "INSERT_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.post("/api/palata/expert-documents", (req, res) => {
  handleExpertDocumentsInsert(req, res).catch(err => {
    console.error("[EXPERT-DOCUMENTS] insert unhandled", { stack: err.stack });
    res.status(500).json({ success: false, error: "HANDLER_FAILED", message: String(err) });
  });
});

// ── DELETE /api/palata/expert-documents/:id — delete a document record ──

async function handleExpertDocumentsDelete(req, res) {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ success: false, error: "MISSING_ID" });
  }
  const client = await pool.connect();
  try {
    await client.query(
      `DELETE FROM public.palata_expert_documents WHERE id = $1`,
      [id],
    );
    res.json({ success: true });
  } catch (err) {
    console.error("[EXPERT-DOCUMENTS] delete failed", { stack: err.stack });
    res.status(500).json({ success: false, error: "DELETE_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.delete("/api/palata/expert-documents/:id", (req, res) => {
  handleExpertDocumentsDelete(req, res).catch(err => {
    console.error("[EXPERT-DOCUMENTS] delete unhandled", { stack: err.stack });
    res.status(500).json({ success: false, error: "HANDLER_FAILED", message: String(err) });
  });
});

// ── GET /api/palata/request-files — list files for a request ──

async function handleRequestFilesQuery(req, res) {
  const { request_id } = req.query;
  if (!request_id) {
    return res.status(400).json({ success: false, error: "MISSING_REQUEST_ID" });
  }
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, request_id, uploader_id, bucket_path, file_name, mime_type, size_bytes, created_at
       FROM public.palata_request_files
       WHERE request_id = $1
       ORDER BY created_at`,
      [request_id],
    );
    res.json({ success: true, rows });
  } catch (err) {
    console.error("[REQUEST-FILES] query failed", { stack: err.stack });
    res.status(500).json({ success: false, error: "QUERY_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.get("/api/palata/request-files", (req, res) => {
  handleRequestFilesQuery(req, res).catch(err => {
    console.error("[REQUEST-FILES] query unhandled", { stack: err.stack });
    res.status(500).json({ success: false, error: "HANDLER_FAILED", message: String(err) });
  });
});

// ── POST /api/palata/request-files — insert a file record ──

async function handleRequestFilesInsert(req, res) {
  const { request_id, uploader_id, bucket_path, file_name, mime_type, size_bytes } = req.body ?? {};
  if (!request_id || !bucket_path || !file_name) {
    return res.status(400).json({ success: false, error: "MISSING_REQUIRED_FIELDS" });
  }
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO public.palata_request_files
         (request_id, uploader_id, bucket_path, file_name, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [request_id, uploader_id ?? null, bucket_path, file_name, mime_type ?? null, size_bytes ?? null],
    );
    res.json({ success: true, id: rows[0]?.id });
  } catch (err) {
    console.error("[REQUEST-FILES] insert failed", { stack: err.stack });
    res.status(500).json({ success: false, error: "INSERT_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.post("/api/palata/request-files", (req, res) => {
  handleRequestFilesInsert(req, res).catch(err => {
    console.error("[REQUEST-FILES] insert unhandled", { stack: err.stack });
    res.status(500).json({ success: false, error: "HANDLER_FAILED", message: String(err) });
  });
});

// ── GET /api/palata/customer-ratings — query customer ratings ──

async function handleCustomerRatingsQuery(req, res) {
  const { request_id, customer_id, customer_ids, expert_id, request_ids } = req.query;

  const conditions = [];
  const params = [];
  let idx = 1;

  if (request_id) {
    conditions.push(`request_id = $${idx}`); params.push(request_id); idx++;
  }
  if (customer_id) {
    conditions.push(`customer_id = $${idx}`); params.push(customer_id); idx++;
  }
  if (expert_id) {
    conditions.push(`expert_id = $${idx}`); params.push(expert_id); idx++;
  }
  if (request_ids) {
    const ids = String(request_ids).split(",").map(s => s.trim()).filter(Boolean);
    if (ids.length > 0) { conditions.push(`request_id = ANY($${idx})`); params.push(ids); idx++; }
  }
  if (customer_ids) {
    const ids = String(customer_ids).split(",").map(s => s.trim()).filter(Boolean);
    if (ids.length > 0) { conditions.push(`customer_id = ANY($${idx})`); params.push(ids); idx++; }
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, request_id, customer_id, expert_id, score, comment, created_at
       FROM public.palata_customer_ratings ${where}`,
      params,
    );
    res.json({ success: true, rows });
  } catch (err) {
    console.error("[CUSTOMER-RATINGS] query failed", { stack: err.stack });
    res.status(500).json({ success: false, error: "QUERY_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.get("/api/palata/customer-ratings", (req, res) => {
  handleCustomerRatingsQuery(req, res).catch(err => {
    console.error("[CUSTOMER-RATINGS] query unhandled", { stack: err.stack });
    res.status(500).json({ success: false, error: "HANDLER_FAILED", message: String(err) });
  });
});

// ── POST /api/palata/customer-ratings — insert a customer rating ──

async function handleCustomerRatingsInsert(req, res) {
  const { request_id, customer_id, expert_id, score, comment } = req.body ?? {};
  if (!request_id || !customer_id || !expert_id || score == null) {
    return res.status(400).json({ success: false, error: "MISSING_REQUIRED_FIELDS" });
  }
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO public.palata_customer_ratings
         (request_id, customer_id, expert_id, score, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [request_id, customer_id, expert_id, score, comment ?? null],
    );
    res.json({ success: true, id: rows[0]?.id });
  } catch (err) {
    console.error("[CUSTOMER-RATINGS] insert failed", { stack: err.stack });
    res.status(500).json({ success: false, error: "INSERT_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.post("/api/palata/customer-ratings", (req, res) => {
  handleCustomerRatingsInsert(req, res).catch(err => {
    console.error("[CUSTOMER-RATINGS] insert unhandled", { stack: err.stack });
    res.status(500).json({ success: false, error: "HANDLER_FAILED", message: String(err) });
  });
});

// ── GET /api/palata/expert-ratings — query expert ratings ──

async function handleExpertRatingsQuery(req, res) {
  const { request_id, customer_id, request_ids } = req.query;

  const conditions = [];
  const params = [];
  let idx = 1;

  if (request_id) {
    conditions.push(`request_id = $${idx}`);
    params.push(request_id);
    idx++;
  }
  if (customer_id) {
    conditions.push(`customer_id = $${idx}`);
    params.push(customer_id);
    idx++;
  }
  if (request_ids) {
    const ids = String(request_ids).split(",").map(s => s.trim()).filter(Boolean);
    if (ids.length > 0) {
      conditions.push(`request_id = ANY($${idx})`);
      params.push(ids);
      idx++;
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, request_id, expert_id, customer_id, score, comment, created_at
       FROM public.palata_expert_ratings
       ${where}`,
      params,
    );
    res.json({ success: true, rows });
  } catch (err) {
    console.error("[EXPERT-RATINGS] query failed", { stack: err.stack });
    res.status(500).json({ success: false, error: "QUERY_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.get("/api/palata/expert-ratings", (req, res) => {
  handleExpertRatingsQuery(req, res).catch(err => {
    console.error("[EXPERT-RATINGS] query unhandled", { stack: err.stack });
    res.status(500).json({ success: false, error: "HANDLER_FAILED", message: String(err) });
  });
});

// ── POST /api/palata/expert-ratings — insert an expert rating ──

async function handleExpertRatingsInsert(req, res) {
  const { request_id, expert_id, customer_id, score, comment } = req.body ?? {};
  if (!request_id || !expert_id || !customer_id || score == null) {
    return res.status(400).json({ success: false, error: "MISSING_REQUIRED_FIELDS" });
  }
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO public.palata_expert_ratings
         (request_id, expert_id, customer_id, score, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [request_id, expert_id, customer_id, score, comment ?? null],
    );
    res.json({ success: true, id: rows[0]?.id });
  } catch (err) {
    console.error("[EXPERT-RATINGS] insert failed", { stack: err.stack });
    res.status(500).json({ success: false, error: "INSERT_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.post("/api/palata/expert-ratings", (req, res) => {
  handleExpertRatingsInsert(req, res).catch(err => {
    console.error("[EXPERT-RATINGS] insert unhandled", { stack: err.stack });
    res.status(500).json({ success: false, error: "HANDLER_FAILED", message: String(err) });
  });
});

// ── POST /api/palata/email-events — log an email event (no auth required) ──

async function handleEmailEventInsert(req, res) {
  const { recipient_id, email_address, template_name, subject, context, sent_at, error: eventError } = req.body ?? {};
  if (!email_address || !template_name || !sent_at) {
    return res.status(400).json({ success: false, error: "MISSING_REQUIRED_FIELDS" });
  }
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO public.palata_email_events
         (recipient_id, email_address, template_name, subject, context, sent_at, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        recipient_id ?? null,
        email_address,
        template_name,
        subject ?? null,
        context != null ? JSON.stringify(context) : null,
        sent_at,
        eventError ?? null,
      ],
    );
    res.json({ success: true, id: rows[0]?.id });
  } catch (err) {
    console.error("[EMAIL-EVENTS] insert failed", { stack: err.stack });
    res.status(500).json({ success: false, error: "INSERT_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.post("/api/palata/email-events", (req, res) => {
  handleEmailEventInsert(req, res).catch(err => {
    console.error("[EMAIL-EVENTS] insert unhandled", { stack: err.stack });
    res.status(500).json({ success: false, error: "HANDLER_FAILED", message: String(err) });
  });
});

// ── GET /api/palata/email-events — two modes: request_id (per-request auth) or admin list ──

async function handleEmailEventsQuery(req, res) {
  const { request_id, template, mode, recipient } = req.query;

  // ── Mode 1: request_id — verify token, check per-request access ─────────────
  if (request_id) {
    const authHeader = req.headers["authorization"] ?? "";
    if (!authHeader.startsWith("Bearer ") || authHeader.slice(7).length === 0) {
      return res.status(401).json({ success: false, error: "MISSING_TOKEN" });
    }
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
      try { meBody = JSON.parse(meText); } catch { meBody = null; }
    } catch {
      return res.status(502).json({ success: false, error: "AUTH_SERVICE_UNREACHABLE" });
    }

    if (meStatus !== 200 || !meBody?.success || !meBody?.user?.id) {
      return res.status(401).json({ success: false, error: "INVALID_TOKEN" });
    }

    const userId = meBody.user.id;
    const role = meBody.user.role;

    const client = await pool.connect();
    try {
      let hasAccess = role === "admin";

      if (!hasAccess) {
        const reqResult = await client.query(
          `SELECT customer_id, assigned_expert_id FROM public.palata_requests WHERE id = $1 LIMIT 1`,
          [request_id],
        );
        if (reqResult.rows.length === 0) {
          return res.status(404).json({ success: false, error: "REQUEST_NOT_FOUND" });
        }
        const r = reqResult.rows[0];
        if (r.customer_id === userId || r.assigned_expert_id === userId) {
          hasAccess = true;
        } else {
          const matchResult = await client.query(
            `SELECT 1 FROM public.palata_request_matches WHERE request_id = $1 AND expert_id = $2 LIMIT 1`,
            [request_id, userId],
          );
          if (matchResult.rows.length > 0) hasAccess = true;
        }
      }

      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "FORBIDDEN" });
      }

      const { rows } = await client.query(
        `SELECT id, recipient_id, email_address, template_name, subject, context, sent_at, error
         FROM public.palata_email_events
         WHERE context @> $1::jsonb
         ORDER BY sent_at DESC
         LIMIT 50`,
        [JSON.stringify({ request_id })],
      );
      res.json({ success: true, rows, total: null });
    } catch (err) {
      console.error("[EMAIL-EVENTS] request_id query failed", { stack: err.stack });
      res.status(500).json({ success: false, error: "QUERY_FAILED", message: String(err) });
    } finally {
      client.release();
    }
    return;
  }

  // ── Mode 2: admin list — requireAdmin, with filters ──────────────────────────
  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return res.status(admin.status).json({ success: false, error: admin.error });
  }

  const conditions = [];
  const params = [];
  let idx = 1;

  if (template) {
    conditions.push(`template_name = $${idx}`);
    params.push(template);
    idx++;
  }
  if (mode === "test") {
    conditions.push(`error = 'TEST_MODE'`);
  } else if (mode === "real") {
    conditions.push(`error IS NULL`);
  }
  if (recipient) {
    conditions.push(`email_address ILIKE $${idx}`);
    params.push(`%${recipient}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, recipient_id, email_address, template_name, subject, context,
              sent_at, delivered_at, opened_at, error
       FROM public.palata_email_events
       ${where}
       ORDER BY sent_at DESC
       LIMIT 300`,
      params,
    );
    const cntRes = await client.query(
      `SELECT COUNT(*)::int AS total FROM public.palata_email_events ${where}`,
      params,
    );
    res.json({ success: true, rows, total: cntRes.rows[0]?.total ?? rows.length });
  } catch (err) {
    console.error("[EMAIL-EVENTS] admin-list query failed", { stack: err.stack });
    res.status(500).json({ success: false, error: "QUERY_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.get("/api/palata/email-events", (req, res) => {
  handleEmailEventsQuery(req, res).catch(err => {
    console.error("[EMAIL-EVENTS] query unhandled", { stack: err.stack });
    res.status(500).json({ success: false, error: "HANDLER_FAILED", message: String(err) });
  });
});

// ── GET /api/palata/specialty-codes — lookup specialty codes by code list ──

async function handleSpecialtyCodesLookup(req, res) {
  const rawCodes = (req.query.codes ?? "").trim();
  if (!rawCodes) {
    return res.json({ success: true, rows: [] });
  }
  const codeList = rawCodes.split(",").map(c => c.trim()).filter(Boolean);
  if (codeList.length === 0) {
    return res.json({ success: true, rows: [] });
  }
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT code, expertise_direction_id
       FROM public.palata_specialty_codes
       WHERE code = ANY($1)`,
      [codeList],
    );
    res.json({ success: true, rows });
  } catch (err) {
    console.error("[SPECIALTY-CODES] query failed", { stack: err.stack });
    res.status(500).json({ success: false, error: "QUERY_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.get("/api/palata/specialty-codes", (req, res) => {
  handleSpecialtyCodesLookup(req, res).catch(err => {
    console.error("[SPECIALTY-CODES] unhandled error", { stack: err.stack });
    res.status(500).json({ success: false, error: "LOOKUP_FAILED", message: String(err) });
  });
});

// ── GET /api/palata/certificates — lookup certificates by number fragment ──

async function handleCertificatesLookup(req, res) {
  const certId = (req.query.cert_id ?? "").trim();
  if (!certId) {
    return res.json({ success: true, rows: [] });
  }
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT certificate_number, expert_full_name, specialty_code, valid_to, is_active
       FROM public.palata_certificates
       WHERE certificate_number ILIKE $1`,
      [`%${certId}%`],
    );
    res.json({ success: true, rows });
  } catch (err) {
    console.error("[CERTIFICATES] query failed", { stack: err.stack });
    res.status(500).json({ success: false, error: "QUERY_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.get("/api/palata/certificates", (req, res) => {
  handleCertificatesLookup(req, res).catch(err => {
    console.error("[CERTIFICATES] unhandled error", { stack: err.stack });
    res.status(500).json({ success: false, error: "LOOKUP_FAILED", message: String(err) });
  });
});

// ── GET /api/palata/regions — list regions from PostgreSQL ──

async function handleRegionsList(_req, res) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, name, sort_order
      FROM public.palata_regions
      ORDER BY sort_order ASC NULLS LAST, name ASC
    `);
    res.json({ success: true, rows });
  } catch (err) {
    console.error("[REGIONS] query failed", { stack: err.stack });
    res.status(500).json({ success: false, error: "QUERY_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.get("/api/palata/regions", (_req, res) => {
  handleRegionsList(_req, res).catch(err => {
    console.error("[REGIONS] unhandled error", { stack: err.stack });
    res.status(500).json({ success: false, error: "LIST_FAILED", message: String(err) });
  });
});

// ── GET /api/palata/expertise-directions — list active expertise directions from PostgreSQL ──

async function handleExpertiseDirectionsList(_req, res) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, name, slug, sort_order, is_active, created_at, updated_at
      FROM public.palata_expertise_directions
      WHERE is_active = true
      ORDER BY sort_order ASC, name ASC
    `);
    res.json({ success: true, rows });
  } catch (err) {
    console.error("[EXPERTISE-DIRECTIONS] query failed", { stack: err.stack });
    res.status(500).json({ success: false, error: "QUERY_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.get("/api/palata/expertise-directions", (_req, res) => {
  handleExpertiseDirectionsList(_req, res).catch(err => {
    console.error("[EXPERTISE-DIRECTIONS] unhandled error", { stack: err.stack });
    res.status(500).json({ success: false, error: "LIST_FAILED", message: String(err) });
  });
});

// ── GET /api/palata/requests/:requestId/detail — read request + matches + contacts + events ──

async function handleRequestDetail(req, res) {
  // 1. Bearer token required
  const authHeader = req.headers["authorization"] ?? "";
  const hasToken = authHeader.startsWith("Bearer ") && authHeader.slice(7).length > 0;
  if (!hasToken) return res.status(401).json({ success: false, error: "MISSING_TOKEN" });

  const token = authHeader.slice(7);

  // 2. Verify token via /api/auth/me
  let meBody;
  try {
    const meRes = await fetch(`${AUTH_SERVICE_URL}/api/auth/me`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const meText = await meRes.text();
    try { meBody = JSON.parse(meText); } catch { meBody = null; }
    if (meRes.status !== 200 || !meBody?.success || !meBody.user?.id) {
      return res.status(401).json({ success: false, error: "INVALID_TOKEN" });
    }
  } catch (err) {
    console.error("[REQUEST-DETAIL] auth/me unreachable", { stack: err.stack });
    return res.status(502).json({ success: false, error: "AUTH_SERVICE_UNREACHABLE" });
  }

  const authUserId = meBody.user.id;
  const { requestId } = req.params;

  const client = await pool.connect();
  try {
    // 3. Resolve caller role
    const userRow = (await client.query(
      `SELECT id, role FROM public.palata_users WHERE id = $1 AND is_active = true LIMIT 1`,
      [authUserId],
    )).rows[0];
    if (!userRow) return res.status(403).json({ success: false, error: "FORBIDDEN" });

    // 4. Fetch the request
    const requestRow = (await client.query(
      `SELECT * FROM public.palata_requests WHERE id = $1 LIMIT 1`,
      [requestId],
    )).rows[0];
    if (!requestRow) return res.json({ success: false, error: "REQUEST_NOT_FOUND" });

    // 5. Access check (mirrors current page access model)
    const isAdmin = userRow.role === "admin";
    const isOwner = userRow.role === "customer" && requestRow.customer_id === authUserId;
    let isMatchedExpert = false;
    if (userRow.role === "expert") {
      const matchCheck = await client.query(
        `SELECT 1 FROM public.palata_request_matches WHERE request_id = $1 AND expert_id = $2 LIMIT 1`,
        [requestId, authUserId],
      );
      isMatchedExpert = matchCheck.rows.length > 0;
    }
    if (!isAdmin && !isOwner && !isMatchedExpert) {
      return res.status(403).json({ success: false, error: "FORBIDDEN" });
    }

    // 6. Four parallel SELECTs
    const [matchesQ, contactsQ, eventsQ] = await Promise.all([
      client.query(
        `SELECT id, request_id, expert_id, matching_round, status, decline_reason, decline_note,
                can_start_from_date, proposed_at, responded_at, created_at, updated_at
         FROM public.palata_request_matches
         WHERE request_id = $1
         ORDER BY matching_round ASC, proposed_at ASC`,
        [requestId],
      ),
      client.query(
        `SELECT id, request_id, expert_id, revealed_at, customer_phone, customer_email,
                expert_phone, expert_email, contact_opened_at, expert_status,
                expert_status_updated_at, failure_reason, expert_comment
         FROM public.palata_request_contacts
         WHERE request_id = $1
         ORDER BY revealed_at ASC`,
        [requestId],
      ),
      client.query(
        `SELECT id, entity_type, entity_id, old_status, new_status, actor_id, note, created_at
         FROM public.palata_status_events
         WHERE entity_type = 'request' AND entity_id = $1
         ORDER BY created_at ASC`,
        [requestId],
      ),
    ]);

    res.json({
      success: true,
      request: requestRow,
      matches:  matchesQ.rows,
      contacts: contactsQ.rows,
      events:   eventsQ.rows,
    });
  } catch (err) {
    console.error("[REQUEST-DETAIL] query failed", { stack: err.stack });
    res.status(500).json({ success: false, error: "QUERY_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.get("/api/palata/requests/:requestId/detail", (req, res) => {
  handleRequestDetail(req, res).catch(err => {
    console.error("[REQUEST-DETAIL] unhandled", { stack: err.stack });
    res.status(500).json({ success: false, error: "HANDLER_FAILED", message: String(err) });
  });
});

// ── POST /api/palata/requests/:requestId/take-work — expert takes request into work ──
async function handleTakeWork(req, res) {
  // 1. Bearer token required
  const authHeader = req.headers["authorization"] ?? "";
  const hasToken = authHeader.startsWith("Bearer ") && authHeader.slice(7).length > 0;
  if (!hasToken) return res.status(401).json({ success: false, error: "MISSING_TOKEN" });
  const token = authHeader.slice(7);

  // 2. Verify token
  let meBody;
  try {
    const meRes = await fetch(`${AUTH_SERVICE_URL}/api/auth/me`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const meText = await meRes.text();
    try { meBody = JSON.parse(meText); } catch { meBody = null; }
    if (meRes.status !== 200 || !meBody?.success || !meBody.user?.id) {
      return res.status(401).json({ success: false, error: "INVALID_TOKEN" });
    }
  } catch (err) {
    console.error("[TAKE-WORK] auth/me unreachable", { stack: err.stack });
    return res.status(502).json({ success: false, error: "AUTH_SERVICE_UNREACHABLE" });
  }

  const expertId = meBody.user.id;
  const { requestId } = req.params;
  const { actionItemId, canStartFrom = null } = req.body ?? {};

  if (!actionItemId) {
    return res.status(400).json({ success: false, error: "MISSING_ACTION_ITEM_ID" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const now = new Date().toISOString();

    // ── 1. Load request (authoritative source) ────────────────────────────
    const requestRow = (await client.query(
      `SELECT id, status, customer_id, title
       FROM public.palata_requests
       WHERE id = $1 LIMIT 1`,
      [requestId],
    )).rows[0];

    if (!requestRow) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "REQUEST_NOT_FOUND" });
    }

    const custId = requestRow.customer_id;
    const requestTitle = requestRow.title;
    const shortId = `#${requestId.slice(0, 8).toUpperCase()}`;
    const orderLabel = requestTitle ? `«${requestTitle}»` : shortId;

    // ── 2. Find this expert's active match ────────────────────────────────
    const matchRow = (await client.query(
      `SELECT id FROM public.palata_request_matches
       WHERE request_id = $1 AND expert_id = $2
       ORDER BY matching_round DESC, proposed_at DESC
       LIMIT 1`,
      [requestId, expertId],
    )).rows[0];

    const matchId = matchRow?.id ?? null;

    // ── 3. Update expert's match → accepted_work ──────────────────────────
    if (matchId) {
      await client.query(
        `UPDATE public.palata_request_matches
         SET status = 'accepted_work', responded_at = $1
         WHERE id = $2`,
        [now, matchId],
      );
    }

    // ── 4. Find other active matches for this request ─────────────────────
    // (mirrors: .neq("expert_id", userId).not("status","in","(declined,closed_by_other_expert,withdrawn,completed)"))
    const otherMatchRows = (await client.query(
      `SELECT id, expert_id, responded_at, status
       FROM public.palata_request_matches
       WHERE request_id = $1
         AND expert_id != $2
         AND status NOT IN ('declined','closed_by_other_expert','withdrawn','completed')`,
      [requestId, expertId],
    )).rows;

    // Only close experts who were actually involved (responded_at set).
    // Auto-matched experts (responded_at = null) are left untouched.
    const involvedMatches = otherMatchRows.filter(m => m.responded_at !== null);

    // ── 5. Close involved matches ─────────────────────────────────────────
    if (involvedMatches.length > 0) {
      const involvedIds = involvedMatches.map(m => m.id);
      await client.query(
        `UPDATE public.palata_request_matches
         SET status = 'closed_by_other_expert'
         WHERE id = ANY($1::uuid[])`,
        [involvedIds],
      );
    }

    // ── 6. Request → in_work ──────────────────────────────────────────────
    await client.query(
      `UPDATE public.palata_requests
       SET status = 'in_work', updated_at = $1
       WHERE id = $2`,
      [now, requestId],
    );

    // ── 7. Contact record → accepted_work ─────────────────────────────────
    await client.query(
      `UPDATE public.palata_request_contacts
       SET expert_status = 'accepted_work', expert_status_updated_at = $1
       WHERE request_id = $2 AND expert_id = $3`,
      [now, requestId, expertId],
    );

    // ── 8. Resolve this expert's action item ──────────────────────────────
    await client.query(
      `UPDATE public.palata_action_items
       SET is_resolved = true, status = 'resolved', resolved_at = $1
       WHERE id = $2`,
      [now, actionItemId],
    );

    // ── 9. Cancel all other open action items for this request ────────────
    // (mirrors cancelRequestActionItems(requestId, exceptId=actionItemId))
    await client.query(
      `UPDATE public.palata_action_items
       SET is_resolved = true, status = 'cancelled', resolved_at = $1
       WHERE request_id = $2
         AND is_resolved = false
         AND id != $3`,
      [now, requestId, actionItemId],
    );

    // ── 10. Notify involved experts: other_expert_took_order ──────────────
    for (const om of involvedMatches) {
      await client.query(
        `INSERT INTO public.palata_action_items
           (request_id, expert_id, customer_id, assigned_to_user_id, assigned_role,
            action_type, title, description, payload, status, is_read, is_resolved)
         VALUES ($1,$2,$3,$4,'expert','other_expert_took_order',
                 'На заказ назначен другой эксперт',$5,$6,'open',false,false)`,
        [
          requestId,
          om.expert_id,
          custId,
          om.expert_id,
          `По заказу ${orderLabel} был выбран другой эксперт.`,
          JSON.stringify({ request_id: requestId }),
        ],
      );
    }

    // ── 11. Action item for customer: expert_started_work ─────────────────
    if (custId) {
      await client.query(
        `INSERT INTO public.palata_action_items
           (request_id, expert_id, customer_id, assigned_to_user_id, assigned_role,
            action_type, title, description, payload, status, is_read, is_resolved)
         VALUES ($1,$2,$3,$3,'customer','expert_started_work',
                 'Эксперт взял заказ в работу',$4,$5,'open',false,false)`,
        [
          requestId,
          expertId,
          custId,
          `Эксперт подтвердил готовность и приступил к заказу ${shortId}`,
          JSON.stringify({ expert_id: expertId, can_start_from: canStartFrom }),
        ],
      );
    }

    // ── 14. Status event (mirrors logStatusEvent) ─────────────────────────
    await client.query(
      `INSERT INTO public.palata_status_events
         (entity_type, entity_id, old_status, new_status, actor_id, note)
       VALUES ('request',$1,'expert_selection','in_work',null,'expert_took_work')`,
      [requestId],
    );

    // ── Fetch customer email for frontend to use in email notifications ───
    let custEmail = null;
    if (custId) {
      const emailRow = (await client.query(
        `SELECT email FROM public.palata_users WHERE id = $1 LIMIT 1`,
        [custId],
      )).rows[0];
      custEmail = emailRow?.email ?? null;
    }

    await client.query("COMMIT");

    return res.json({ success: true, custId, custEmail });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("[TAKE-WORK] tx failed", { stack: err.stack });
    return res.status(500).json({ success: false, error: "TX_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.post("/api/palata/requests/:requestId/take-work", (req, res) => {
  handleTakeWork(req, res).catch(err => {
    console.error("[TAKE-WORK] unhandled", { stack: err.stack });
    res.status(500).json({ success: false, error: "HANDLER_FAILED", message: String(err) });
  });
});

// ── POST /api/palata/requests/:requestId/complete — expert completes work ────────
async function handleCompleteWork(req, res) {
  // 1. Bearer token required
  const authHeader = req.headers["authorization"] ?? "";
  const hasToken = authHeader.startsWith("Bearer ") && authHeader.slice(7).length > 0;
  if (!hasToken) return res.status(401).json({ success: false, error: "MISSING_TOKEN" });
  const token = authHeader.slice(7);

  // 2. Verify token → get expertId
  let meBody;
  try {
    const meRes = await fetch(`${AUTH_SERVICE_URL}/api/auth/me`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const meText = await meRes.text();
    try { meBody = JSON.parse(meText); } catch { meBody = null; }
    if (meRes.status !== 200 || !meBody?.success || !meBody.user?.id) {
      return res.status(401).json({ success: false, error: "INVALID_TOKEN" });
    }
  } catch (err) {
    console.error("[COMPLETE-WORK] auth/me unreachable", { stack: err.stack });
    return res.status(502).json({ success: false, error: "AUTH_SERVICE_UNREACHABLE" });
  }

  const expertId = meBody.user.id;
  const { requestId } = req.params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const completedAt = new Date().toISOString();

    // ── 1. Load request ───────────────────────────────────────────────────
    const requestRow = (await client.query(
      `SELECT id, status, customer_id, title
       FROM public.palata_requests
       WHERE id = $1 LIMIT 1`,
      [requestId],
    )).rows[0];

    if (!requestRow) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "REQUEST_NOT_FOUND" });
    }

    const custId    = requestRow.customer_id;
    const oldStatus = requestRow.status;
    const shortReqId = `#${requestId.slice(0, 8).toUpperCase()}`;

    // ── 2. Find expert's active match ─────────────────────────────────────
    const matchRow = (await client.query(
      `SELECT id FROM public.palata_request_matches
       WHERE request_id = $1 AND expert_id = $2
       ORDER BY matching_round DESC, proposed_at DESC
       LIMIT 1`,
      [requestId, expertId],
    )).rows[0];

    const matchId = matchRow?.id ?? null;

    // ── 3. Match → completed ──────────────────────────────────────────────
    if (matchId) {
      await client.query(
        `UPDATE public.palata_request_matches
         SET status = 'completed', responded_at = $1
         WHERE id = $2`,
        [completedAt, matchId],
      );
    }

    // ── 4. Request → completed ────────────────────────────────────────────
    await client.query(
      `UPDATE public.palata_requests
       SET status = 'completed', updated_at = $1
       WHERE id = $2`,
      [completedAt, requestId],
    );

    // ── 5. Contact record → completed ─────────────────────────────────────
    await client.query(
      `UPDATE public.palata_request_contacts
       SET expert_status = 'completed', expert_status_updated_at = $1
       WHERE request_id = $2 AND expert_id = $3`,
      [completedAt, requestId, expertId],
    );

    // ── 6. Status event (mirrors logEvent) ────────────────────────────────
    await client.query(
      `INSERT INTO public.palata_status_events
         (entity_type, entity_id, old_status, new_status, actor_id, note)
       VALUES ('request', $1, $2, 'completed', null, 'Работа завершена экспертом')`,
      [requestId, oldStatus],
    );

    // ── 7. Action item for customer: expert_completed_order ───────────────
    if (custId) {
      await client.query(
        `INSERT INTO public.palata_action_items
           (request_id, expert_id, customer_id, assigned_to_user_id, assigned_role,
            action_type, title, description, payload, status, is_read, is_resolved)
         VALUES ($1,$2,$3,$3,'customer','expert_completed_order',
                 'Эксперт завершил заказ',
                 'Эксперт завершил работу по заказу. Оцените эксперта.',$4,
                 'open',false,false)`,
        [
          requestId,
          expertId,
          custId,
          JSON.stringify({ request_id: requestId, expert_id: expertId, completed_at: completedAt }),
        ],
      );
    }

    await client.query("COMMIT");

    return res.json({ success: true });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("[COMPLETE-WORK] tx failed", { stack: err.stack });
    return res.status(500).json({ success: false, error: "TX_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.post("/api/palata/requests/:requestId/complete", (req, res) => {
  handleCompleteWork(req, res).catch(err => {
    console.error("[COMPLETE-WORK] unhandled", { stack: err.stack });
    res.status(500).json({ success: false, error: "HANDLER_FAILED", message: String(err) });
  });
});

// ── POST /api/palata/requests/:requestId/select-expert ────────────────────────────
//    source="dashboard" → ExpertsMatchedCard in CustomerDashboard
//    source="detail"    → handleSelectExpert in RequestDetail
async function handleSelectExpert(req, res) {
  const authHeader = req.headers["authorization"] ?? "";
  const hasToken = authHeader.startsWith("Bearer ") && authHeader.slice(7).length > 0;
  if (!hasToken) return res.status(401).json({ success: false, error: "MISSING_TOKEN" });
  const token = authHeader.slice(7);

  let meBody;
  try {
    const meRes = await fetch(`${AUTH_SERVICE_URL}/api/auth/me`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const meText = await meRes.text();
    try { meBody = JSON.parse(meText); } catch { meBody = null; }
    if (meRes.status !== 200 || !meBody?.success || !meBody.user?.id) {
      return res.status(401).json({ success: false, error: "INVALID_TOKEN" });
    }
  } catch (err) {
    console.error("[SELECT-EXPERT] auth/me unreachable", { stack: err.stack });
    return res.status(502).json({ success: false, error: "AUTH_SERVICE_UNREACHABLE" });
  }

  const customerId = meBody.user.id;
  const { requestId } = req.params;
  const { expertId, matchId, actionItemId = null, source, expertName = null } = req.body ?? {};

  if (!expertId || !matchId || !source) {
    return res.status(400).json({ success: false, error: "MISSING_PARAMS" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const now = new Date().toISOString();

    // ── 1. Load request ───────────────────────────────────────────────────
    const requestRow = (await client.query(
      `SELECT id, status, customer_id, title
       FROM public.palata_requests WHERE id = $1 LIMIT 1`,
      [requestId],
    )).rows[0];

    if (!requestRow) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "REQUEST_NOT_FOUND" });
    }
    if (requestRow.customer_id !== customerId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ success: false, error: "NOT_OWNER" });
    }

    // ── Guard: dashboard — request not already closed ─────────────────────
    if (source === "dashboard") {
      const s = requestRow.status;
      if (s === "in_work" || s === "completed" || s === "cancelled") {
        await client.query("ROLLBACK");
        return res.status(409).json({ success: false, error: "REQUEST_ALREADY_CLOSED", freshStatus: s });
      }
    }

    // ── Guard: detail — no expert has accepted_work yet ───────────────────
    if (source === "detail") {
      const inWorkRow = (await client.query(
        `SELECT id FROM public.palata_request_matches
         WHERE request_id = $1 AND status = 'accepted_work' LIMIT 1`,
        [requestId],
      )).rows[0];
      if (inWorkRow) {
        await client.query("ROLLBACK");
        return res.status(409).json({ success: false, error: "EXPERT_ALREADY_TOOK_WORK" });
      }
    }

    const reqTitle   = requestRow.title ?? "";
    const oldStatus  = requestRow.status;
    const shortReqId = `#${requestId.slice(0, 8).toUpperCase()}`;
    const noteName   = expertName ?? expertId.slice(0, 8);

    // ── 2. Load customer contact info ─────────────────────────────────────
    const custRow = (await client.query(
      `SELECT email, phone FROM public.palata_users WHERE id = $1 LIMIT 1`,
      [customerId],
    )).rows[0];
    const custEmail = custRow?.email ?? null;
    const custPhone = custRow?.phone ?? null;

    // ── 3. Load expert email ──────────────────────────────────────────────
    const expertRow = (await client.query(
      `SELECT email FROM public.palata_users WHERE id = $1 LIMIT 1`,
      [expertId],
    )).rows[0];
    const expertEmail = expertRow?.email ?? null;

    // ── 4. Update match status ────────────────────────────────────────────
    //   dashboard → contacts_opened  |  detail → proposed
    const matchStatus = source === "dashboard" ? "contacts_opened" : "proposed";
    await client.query(
      `UPDATE public.palata_request_matches
       SET status = $1, responded_at = $2
       WHERE id = $3`,
      [matchStatus, now, matchId],
    );

    // ── 5. Update request (dashboard only) ───────────────────────────────
    if (source === "dashboard") {
      await client.query(
        `UPDATE public.palata_requests
         SET assigned_expert_id = $1, status = 'expert_selection', updated_at = $2
         WHERE id = $3`,
        [expertId, now, requestId],
      );
    }

    // ── 6. Upsert palata_request_contacts ─────────────────────────────────
    const existingContactRow = (await client.query(
      `SELECT id FROM public.palata_request_contacts
       WHERE request_id = $1 AND expert_id = $2 LIMIT 1`,
      [requestId, expertId],
    )).rows[0];

    if (existingContactRow) {
      await client.query(
        `UPDATE public.palata_request_contacts
         SET revealed_at = $1, customer_email = $2, customer_phone = $3,
             expert_email = $4, expert_phone = NULL
         WHERE id = $5`,
        [now, custEmail, custPhone, expertEmail, existingContactRow.id],
      );
    } else {
      // Ignore insert errors — contacts are a convenience; match status is source of truth
      await client.query(
        `INSERT INTO public.palata_request_contacts
           (request_id, expert_id, revealed_at,
            customer_email, customer_phone, expert_email, expert_phone)
         VALUES ($1,$2,$3,$4,$5,$6,NULL)
         ON CONFLICT DO NOTHING`,
        [requestId, expertId, now, custEmail, custPhone, expertEmail],
      );
    }

    // ── 7. Resolve action item (if provided) ──────────────────────────────
    if (actionItemId) {
      await client.query(
        `UPDATE public.palata_action_items
         SET is_resolved = true, status = 'resolved', resolved_at = $1
         WHERE id = $2`,
        [now, actionItemId],
      );
    }

    // ── 8. Insert action item for expert: customer_selected_you ──────────
    if (source === "dashboard") {
      await client.query(
        `INSERT INTO public.palata_action_items
           (request_id, expert_id, customer_id, assigned_to_user_id, assigned_role,
            action_type, title, description, payload, status, is_read, is_resolved)
         VALUES ($1,$2,$3,$2,'expert','customer_selected_you',
                 'Заказчик выбрал вас',
                 'Заказчик выбрал вас для работы над заказом. Ознакомьтесь с деталями и примите решение.',
                 $4,'open',false,false)`,
        [requestId, expertId, customerId,
         JSON.stringify({ customer_id: customerId, request_id: requestId })],
      );
    } else {
      await client.query(
        `INSERT INTO public.palata_action_items
           (request_id, expert_id, customer_id, assigned_to_user_id, assigned_role,
            action_type, title, description, payload, status, is_read, is_resolved)
         VALUES ($1,$2,$3,$2,'expert','customer_selected_you',$4,$5,$6,'open',false,false)`,
        [
          requestId, expertId, customerId,
          `Вас выбрали по заказу «${reqTitle}»`,
          `Заказчик выбрал вас для связи по заказу ${shortReqId}`,
          JSON.stringify({ request_id: requestId, expert_id: expertId, customer_id: customerId, contact_opened_at: now }),
        ],
      );
    }

    // ── 9. Insert status event ────────────────────────────────────────────
    if (source === "dashboard") {
      await client.query(
        `INSERT INTO public.palata_status_events
           (entity_type, entity_id, old_status, new_status, actor_id, note)
         VALUES ('request',$1,'matching','expert_selection',null,$2)`,
        [requestId, `Заказчик выбрал эксперта: ${noteName}`],
      );
    } else {
      await client.query(
        `INSERT INTO public.palata_status_events
           (entity_type, entity_id, old_status, new_status, actor_id, note)
         VALUES ('request',$1,$2,'expert_selected_by_customer',null,$3)`,
        [requestId, oldStatus, `Заказчик выбрал эксперта ${noteName}`],
      );
    }

    await client.query("COMMIT");
    return res.json({ success: true });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("[SELECT-EXPERT] tx failed", { stack: err.stack });
    return res.status(500).json({ success: false, error: "TX_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.post("/api/palata/requests/:requestId/select-expert", (req, res) => {
  handleSelectExpert(req, res).catch(err => {
    console.error("[SELECT-EXPERT] unhandled", { stack: err.stack });
    res.status(500).json({ success: false, error: "HANDLER_FAILED", message: String(err) });
  });
});

// ── GET /api/palata/requests/customer — customer's own request list ──────────────
async function handleCustomerRequests(req, res) {
  const authHeader = req.headers["authorization"] ?? "";
  const hasToken = authHeader.startsWith("Bearer ") && authHeader.slice(7).length > 0;
  if (!hasToken) return res.status(401).json({ success: false, error: "MISSING_TOKEN" });
  const token = authHeader.slice(7);

  let meBody;
  try {
    const meRes = await fetch(`${AUTH_SERVICE_URL}/api/auth/me`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const meText = await meRes.text();
    try { meBody = JSON.parse(meText); } catch { meBody = null; }
    if (meRes.status !== 200 || !meBody?.success || !meBody.user?.id) {
      return res.status(401).json({ success: false, error: "INVALID_TOKEN" });
    }
  } catch (err) {
    console.error("[CUSTOMER-REQUESTS] auth/me unreachable", { stack: err.stack });
    return res.status(502).json({ success: false, error: "AUTH_SERVICE_UNREACHABLE" });
  }

  const authUserId = meBody.user.id;
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, title, status, expertise_type, expertise_direction_id, matching_round, urgency, created_at
       FROM public.palata_requests
       WHERE customer_id = $1
       ORDER BY created_at DESC`,
      [authUserId],
    );
    return res.json({ success: true, rows });
  } catch (err) {
    console.error("[CUSTOMER-REQUESTS] query failed", { stack: err.stack });
    return res.status(500).json({ success: false, error: "QUERY_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.get("/api/palata/requests/customer", (req, res) => {
  handleCustomerRequests(req, res).catch(err => {
    console.error("[CUSTOMER-REQUESTS] unhandled", { stack: err.stack });
    res.status(500).json({ success: false, error: "HANDLER_FAILED", message: String(err) });
  });
});

// ── GET /api/palata/requests/expert/matches — expert's matches with embedded request info ──
async function handleExpertMatches(req, res) {
  const authHeader = req.headers["authorization"] ?? "";
  const hasToken = authHeader.startsWith("Bearer ") && authHeader.slice(7).length > 0;
  if (!hasToken) return res.status(401).json({ success: false, error: "MISSING_TOKEN" });
  const token = authHeader.slice(7);

  let meBody;
  try {
    const meRes = await fetch(`${AUTH_SERVICE_URL}/api/auth/me`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const meText = await meRes.text();
    try { meBody = JSON.parse(meText); } catch { meBody = null; }
    if (meRes.status !== 200 || !meBody?.success || !meBody.user?.id) {
      return res.status(401).json({ success: false, error: "INVALID_TOKEN" });
    }
  } catch (err) {
    console.error("[EXPERT-MATCHES] auth/me unreachable", { stack: err.stack });
    return res.status(502).json({ success: false, error: "AUTH_SERVICE_UNREACHABLE" });
  }

  const authUserId = meBody.user.id;
  const statusFilter = typeof req.query.status === "string" && req.query.status.length > 0
    ? req.query.status : null;

  const client = await pool.connect();
  try {
    const params = [authUserId];
    const statusClause = statusFilter ? `AND m.status = $${params.push(statusFilter)}` : "";
    const { rows } = await client.query(
      `SELECT
         m.id, m.request_id, m.status, m.matching_round, m.decline_reason, m.responded_at,
         JSON_BUILD_OBJECT(
           'title',                  r.title,
           'expertise_direction_id', r.expertise_direction_id,
           'urgency',                r.urgency,
           'customer_id',            r.customer_id,
           'status',                 r.status
         ) AS palata_requests
       FROM public.palata_request_matches m
       JOIN public.palata_requests r ON r.id = m.request_id
       WHERE m.expert_id = $1 ${statusClause}
       ORDER BY m.matching_round ASC`,
      params,
    );
    return res.json({ success: true, rows });
  } catch (err) {
    console.error("[EXPERT-MATCHES] query failed", { stack: err.stack });
    return res.status(500).json({ success: false, error: "QUERY_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.get("/api/palata/requests/expert/matches", (req, res) => {
  handleExpertMatches(req, res).catch(err => {
    console.error("[EXPERT-MATCHES] unhandled", { stack: err.stack });
    res.status(500).json({ success: false, error: "HANDLER_FAILED", message: String(err) });
  });
});

// ── GET /api/palata/requests/expert/market — market orders + expert's own match statuses ──
async function handleExpertMarket(req, res) {
  const authHeader = req.headers["authorization"] ?? "";
  const hasToken = authHeader.startsWith("Bearer ") && authHeader.slice(7).length > 0;
  if (!hasToken) return res.status(401).json({ success: false, error: "MISSING_TOKEN" });
  const token = authHeader.slice(7);

  let meBody;
  try {
    const meRes = await fetch(`${AUTH_SERVICE_URL}/api/auth/me`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const meText = await meRes.text();
    try { meBody = JSON.parse(meText); } catch { meBody = null; }
    if (meRes.status !== 200 || !meBody?.success || !meBody.user?.id) {
      return res.status(401).json({ success: false, error: "INVALID_TOKEN" });
    }
  } catch (err) {
    console.error("[EXPERT-MARKET] auth/me unreachable", { stack: err.stack });
    return res.status(502).json({ success: false, error: "AUTH_SERVICE_UNREACHABLE" });
  }

  const authUserId = meBody.user.id;
  const client = await pool.connect();
  try {
    const [ordersRes, matchesRes] = await Promise.all([
      client.query(
        `SELECT id, title, status, expertise_direction_id, region_id, requires_travel, description, created_at, customer_id
         FROM public.palata_requests
         WHERE status NOT IN ('cancelled', 'completed', 'in_work')
         ORDER BY created_at DESC
         LIMIT 200`,
      ),
      client.query(
        `SELECT request_id, expert_id, status
         FROM public.palata_request_matches
         WHERE expert_id = $1`,
        [authUserId],
      ),
    ]);
    return res.json({ success: true, orders: ordersRes.rows, myMatches: matchesRes.rows });
  } catch (err) {
    console.error("[EXPERT-MARKET] query failed", { stack: err.stack });
    return res.status(500).json({ success: false, error: "QUERY_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.get("/api/palata/requests/expert/market", (req, res) => {
  handleExpertMarket(req, res).catch(err => {
    console.error("[EXPERT-MARKET] unhandled", { stack: err.stack });
    res.status(500).json({ success: false, error: "HANDLER_FAILED", message: String(err) });
  });
});

// ── GET /api/palata/admin/requests — admin list of all requests ──────────────────
async function handleAdminRequests(req, res) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return res.status(admin.status).json({ success: false, error: admin.error });

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, title, status, expertise_type, expertise_direction_id, matching_round, budget_min, budget_max, created_at
       FROM public.palata_requests
       ORDER BY created_at DESC`,
    );
    return res.json({ success: true, rows });
  } catch (err) {
    console.error("[ADMIN-REQUESTS] query failed", { stack: err.stack });
    return res.status(500).json({ success: false, error: "QUERY_FAILED", message: String(err) });
  } finally {
    client.release();
  }
}

app.get("/api/palata/admin/requests", (req, res) => {
  handleAdminRequests(req, res).catch(err => {
    console.error("[ADMIN-REQUESTS] unhandled", { stack: err.stack });
    res.status(500).json({ success: false, error: "HANDLER_FAILED", message: String(err) });
  });
});

// ── POST /api/palata/requests — create a new request (palata_requests + status event) ──

async function handleCreateRequest(req, res) {
  // 1. Optional Bearer auth: resolve customer_id from token if present
  const authHeader = req.headers["authorization"] ?? "";
  const hasToken = authHeader.startsWith("Bearer ") && authHeader.slice(7).length > 0;
  let customerId = null;
  if (hasToken) {
    const token = authHeader.slice(7);
    try {
      const meRes = await fetch(`${AUTH_SERVICE_URL}/api/auth/me`, {
        method: "GET",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const meBody = await meRes.json().catch(() => null);
      if (meRes.status === 200 && meBody?.success === true && meBody?.user?.id) {
        customerId = meBody.user.id;
      }
    } catch (authErr) {
      console.warn("[REQUEST-CREATE] auth/me failed, treating as anonymous", { message: authErr.message });
    }
  }

  // 2. Validate body
  const body = req.body ?? {};
  const {
    expertise_direction_id,
    region_id,
    description,
    customer_name,
    customer_phone,
    customer_email,
    urgency,
    requires_travel,
    materials_available,
  } = body;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!expertise_direction_id || !UUID_RE.test(String(expertise_direction_id))) {
    return res.status(400).json({ success: false, error: "VALIDATION_FAILED", message: "expertise_direction_id обязателен и должен быть UUID" });
  }
  if (!region_id || !UUID_RE.test(String(region_id))) {
    return res.status(400).json({ success: false, error: "VALIDATION_FAILED", message: "region_id обязателен и должен быть UUID" });
  }
  if (!description || !String(description).trim()) {
    return res.status(400).json({ success: false, error: "VALIDATION_FAILED", message: "description обязателен" });
  }
  if (!customer_name || !String(customer_name).trim()) {
    return res.status(400).json({ success: false, error: "VALIDATION_FAILED", message: "customer_name обязателен" });
  }
  const phoneVal = customer_phone ? String(customer_phone).trim() : "";
  const emailVal = customer_email ? String(customer_email).trim() : "";
  if (!phoneVal && !emailVal) {
    return res.status(400).json({ success: false, error: "VALIDATION_FAILED", message: "Необходимо указать хотя бы один из: customer_phone, customer_email" });
  }
  const VALID_URGENCY = ["normal", "urgent", "very_urgent"];
  const resolvedUrgency = urgency ?? "normal";
  if (!VALID_URGENCY.includes(String(resolvedUrgency))) {
    return res.status(400).json({ success: false, error: "VALIDATION_FAILED", message: "urgency должен быть одним из: normal, urgent, very_urgent" });
  }
  const resolvedRequiresTravel = Boolean(requires_travel);

  if (!pool) {
    return res.status(503).json({ success: false, error: "DB_UNAVAILABLE", message: "База данных недоступна" });
  }

  // 3. Transaction: INSERT palata_requests + INSERT palata_status_events
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const newId = randomUUID();
    const newTitle = "Заказ " + newId.slice(0, 8).toUpperCase();

    const insertRes = await client.query(
      `INSERT INTO public.palata_requests (
         id,
         customer_id,
         status,
         title,
         description,
         expertise_direction_id,
         region_id,
         urgency,
         requires_travel,
         materials_available,
         customer_name,
         customer_phone,
         customer_email
       ) VALUES ($1, $2, 'new', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, region_id, title`,
      [
        newId,
        customerId,
        newTitle,
        String(description).trim() || null,
        String(expertise_direction_id),
        String(region_id),
        String(resolvedUrgency),
        resolvedRequiresTravel,
        materials_available ? String(materials_available).trim() || null : null,
        String(customer_name).trim(),
        phoneVal || null,
        emailVal || null,
      ]
    );

    const row = insertRes.rows[0];

    await client.query(
      `INSERT INTO public.palata_status_events
         (entity_type, entity_id, old_status, new_status, actor_id, note)
       VALUES ('request', $1, NULL, 'new', $2, NULL)`,
      [row.id, customerId]
    );

    await client.query("COMMIT");

    console.log("[REQUEST-CREATE] success", { requestId: row.id, customerId });
    return res.status(201).json({
      success: true,
      request: {
        id: row.id,
        region_id: row.region_id,
        title: row.title,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[REQUEST-CREATE] error", { message: err.message, code: err.code });
    return res.status(500).json({ success: false, error: "REQUEST_CREATE_FAILED", message: err.message });
  } finally {
    client.release();
  }
}

app.post("/api/palata/requests", (req, res) => {
  handleCreateRequest(req, res).catch(err => {
    console.error("[REQUEST-CREATE] unhandled error", { stack: err.stack });
    res.status(500).json({ success: false, error: "REQUEST_CREATE_FAILED", message: String(err) });
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
