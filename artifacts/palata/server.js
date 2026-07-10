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

app.use(express.json());

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
      `SELECT table_name, column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('palata_certificates_import', 'palata_certificate_import_logs')
       ORDER BY table_name, ordinal_position`,
    );
    const byTable = { palata_certificates_import: [], palata_certificate_import_logs: [] };
    for (const row of result.rows) {
      if (byTable[row.table_name]) {
        byTable[row.table_name].push({ column_name: row.column_name, data_type: row.data_type });
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

async function handleCertImport(req, res) {
  console.log("[CERT-IMPORT] start");

  let admin;
  try {
    admin = await requireAdmin(req);
  } catch (err) {
    console.error("[CERT-IMPORT] error", { stage: "auth", message: err.message });
    res.status(500).json({ success: false, error: "AUTH_CHECK_FAILED" });
    return;
  }

  if (!admin.ok) {
    res.status(admin.status).json({ success: false, error: admin.error });
    return;
  }

  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  const fileName = typeof req.body?.file_name === "string" ? req.body.file_name : null;

  if (!rows) {
    res.status(400).json({ success: false, error: "MISSING_ROWS" });
    return;
  }

  console.log("[CERT-IMPORT] parsed rows", { count: rows.length, fileName });

  if (!pool) {
    res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("[CERT-IMPORT] transaction started");

    await client.query("TRUNCATE TABLE public.palata_certificates_import");
    console.log("[CERT-IMPORT] staging cleared");

    let activeCount = 0;
    let expiredCount = 0;
    let parseErrorCount = 0;

    for (const r of rows) {
      if (r.certificate_status === "Активный") activeCount++;
      else if (r.certificate_status === "Истёкший") expiredCount++;
      if (r._dateParseError) parseErrorCount++;

      await client.query(
        `INSERT INTO public.palata_certificates_import
           (certificate_number, expert_full_name, specialty_text, certificate_period,
            codes, directions, valid_from, valid_to, certificate_status, load_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          r.certificate_number ?? null,
          r.expert_full_name ?? null,
          r.specialty_text ?? null,
          r.certificate_period ?? null,
          r.codes ?? null,
          r.directions ?? null,
          r.valid_from ?? null,
          r.valid_to ?? null,
          r.certificate_status ?? null,
          r.load_status ?? "Загружен",
        ],
      );
    }
    console.log("[CERT-IMPORT] rows inserted", { count: rows.length });

    const logResult = await client.query(
      `INSERT INTO public.palata_certificate_import_logs
         (created_by, file_name, total_rows, active_count, expired_count,
          parse_error_count, linked_experts_count, unlinked_experts_count, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, created_at`,
      [
        admin.userId,
        fileName,
        rows.length,
        activeCount,
        expiredCount,
        parseErrorCount,
        0,
        0,
        "success",
        null,
      ],
    );
    console.log("[CERT-IMPORT] log inserted", { id: logResult.rows[0]?.id });

    await client.query("COMMIT");
    console.log("[CERT-IMPORT] commit");

    res.status(200).json({
      success: true,
      total: rows.length,
      active: activeCount,
      expired: expiredCount,
      parse_errors: parseErrorCount,
      log_id: logResult.rows[0]?.id,
      created_at: logResult.rows[0]?.created_at,
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
      console.log("[CERT-IMPORT] rollback");
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
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      table: err.table,
      column: err.column,
    });
  } finally {
    client.release();
  }
}

app.post("/api/palata/cert-import", (req, res) => {
  handleCertImport(req, res).catch((err) => {
    const stack = err instanceof Error ? err.stack : String(err);
    console.error("[CERT-IMPORT] error", { stage: "unhandled", stack });
    res.status(500).json({ success: false, error: String(err) });
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
