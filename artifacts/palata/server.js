import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

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

const pool = PALATA_DATABASE_URL
  ? new pg.Pool({ connectionString: PALATA_DATABASE_URL })
  : null;

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
  });
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

  console.log("[PALATA-USER] auth /me result", { user_id: meBody.user_id, email: meBody.email });

  if (!pool) {
    console.error("[PALATA-USER] not found reason = PALATA_DATABASE_URL not configured");
    res.status(503).json({ success: false, error: "DATABASE_NOT_CONFIGURED" });
    return;
  }

  console.log("[PALATA-USER] db query palata_users by id", { userId: meBody.user_id });

  let result;
  try {
    result = await pool.query(
      `SELECT id, email, full_name, phone, role, is_active
       FROM public.palata_users
       WHERE id = $1
         AND is_active = true
       LIMIT 1`,
      [meBody.user_id],
    );
  } catch (err) {
    console.error("[PALATA-USER] db query error", { error: String(err) });
    res.status(500).json({ success: false, error: "DB_QUERY_FAILED" });
    return;
  }

  const row = result.rows[0];

  if (!row) {
    console.log("[PALATA-USER] not found reason = no active palata_users row for id", { userId: meBody.user_id });
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
