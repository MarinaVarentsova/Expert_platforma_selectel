import { Router, type Request, type Response } from "express";

const router = Router();

const UPSTREAM = (process.env["AUTH_SERVICE_URL"] ?? "").replace(/\/$/, "");
const DEBUG_VERSION = "auth-proxy-debug-2026-07-09-1";

if (!UPSTREAM) {
  console.warn("[AUTH-PROXY] AUTH_SERVICE_URL is not set — /api/auth/* will return 503");
}

async function proxyRequest(req: Request, res: Response): Promise<void> {
  const hasAuthHeader = Boolean(req.headers["authorization"]);

  console.log("[AUTH-PROXY] incoming", {
    method: req.method,
    originalUrl: req.originalUrl,
    path: req.path,
    hasAuthorizationHeader: hasAuthHeader,
    contentType: req.headers["content-type"] ?? null,
  });

  if (!UPSTREAM) {
    console.error("[AUTH-PROXY] no upstream configured, returning 503");
    res.status(503).json({ success: false, error: "Auth service not configured" });
    return;
  }

  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const upstreamUrl = `${UPSTREAM}/api${req.path}${qs}`;

  console.log("[AUTH-PROXY] targetUrl =", upstreamUrl);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const auth = req.headers["authorization"];
  if (auth) headers["Authorization"] = auth as string;

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    init.body = JSON.stringify(req.body);
  }

  let upstream: Response;
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

  let body: unknown;
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

  res.status(upstream.status).json(body);
}

router.get("/debug/auth-proxy", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "api-server",
    version: DEBUG_VERSION,
    upstream: UPSTREAM || null,
    hasUpstream: Boolean(UPSTREAM),
  });
});

router.all(/^\/auth(.*)$/, (req: Request, res: Response) => {
  proxyRequest(req, res).catch((err: unknown) => {
    const stack = err instanceof Error ? err.stack : String(err);
    console.error("[AUTH-PROXY] ERROR stack =", stack);
    res.status(500).json({ success: false, error: String(err) });
  });
});

export default router;
