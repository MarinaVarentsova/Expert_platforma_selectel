import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? "3000");
const AUTH_SERVICE_URL = (process.env.AUTH_SERVICE_URL ?? "http://q1rwqqgfbmvyhwgsdr701t0h.161.104.50.164.sslip.io").replace(/\/$/, "");
const STATIC_DIR = path.resolve(__dirname, "dist/public");

if (!process.env.AUTH_SERVICE_URL) {
  console.warn(
    "[AUTH-PROXY] AUTH_SERVICE_URL env var not set — falling back to default:",
    AUTH_SERVICE_URL,
  );
}

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

app.all(/^\/api\/auth(\/.*)?$/, (req, res) => {
  proxyAuthRequest(req, res).catch((err) => {
    const stack = err instanceof Error ? err.stack : String(err);
    console.error("[AUTH-PROXY] ERROR stack =", stack);
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
