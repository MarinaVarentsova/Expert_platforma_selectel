import { Router, type Request, type Response } from "express";

const router = Router();

const UPSTREAM = (process.env["AUTH_SERVICE_URL"] ?? "").replace(/\/$/, "");

if (!UPSTREAM) {
  console.warn("[auth-proxy] AUTH_SERVICE_URL is not set — /api/auth/* will return 503");
}

async function proxyRequest(req: Request, res: Response): Promise<void> {
  if (!UPSTREAM) {
    res.status(503).json({ success: false, error: "Auth service not configured" });
    return;
  }

  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const upstreamUrl = `${UPSTREAM}/api${req.path}${qs}`;

  // eslint-disable-next-line no-console
  console.log("AUTH PROXY TARGET =", upstreamUrl, "| req.method =", req.method, "| req.path =", req.path, "| UPSTREAM =", UPSTREAM);

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
    res.status(502).json({ success: false, error: `Auth service unreachable: ${String(err)}` });
    return;
  }

  let body: unknown;
  const ct = upstream.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    body = await upstream.json();
  } else {
    body = await upstream.text();
  }

  res.status(upstream.status).json(body);
}

router.all(/^\/auth(.*)$/, (req: Request, res: Response) => {
  proxyRequest(req, res).catch((err: unknown) => {
    res.status(500).json({ success: false, error: String(err) });
  });
});

export default router;
