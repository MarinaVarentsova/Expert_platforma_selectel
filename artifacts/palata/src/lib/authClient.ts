const AUTH_SERVICE_URL = (import.meta.env.VITE_AUTH_SERVICE_URL as string | undefined)
  ?.replace(/\/$/, "") ?? "";

const PROJECT_CODE = "palata";
const TOKEN_KEY    = "palata_access_token";

// ── Token helpers ────────────────────────────────────────────────────────────

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ── Request/Response types ───────────────────────────────────────────────────

export type RegisterPayload = {
  email: string;
  password: string;
  full_name: string;
  phone?: string | null;
};

export type RegisterResult = {
  success: true;
  user_id: string;
  project_id: string;
  status: "pending_email" | string;
  email_verified: boolean;
  verification_token: string;
};

export type LoginResult = {
  success: true;
  access_token: string;
  user_id: string;
};

export type MeResult = {
  success: true;
  user_id: string;
  email: string;
  email_verified: boolean;
  project_code: string;
};

export type AuthError = {
  success: false;
  message: string;
  status?: number;
};

// ── Internal fetch helper ────────────────────────────────────────────────────

async function authFetch<T>(
  path: string,
  options: RequestInit,
): Promise<T | AuthError> {
  if (!AUTH_SERVICE_URL) {
    return { success: false, message: "VITE_AUTH_SERVICE_URL is not configured" };
  }

  let res: Response;
  try {
    res = await fetch(`${AUTH_SERVICE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (err) {
    return { success: false, message: `Network error: ${String(err)}` };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      success: false,
      message: `Auth service returned non-JSON response (HTTP ${res.status})`,
      status: res.status,
    };
  }

  if (!res.ok) {
    const b = (typeof body === "object" && body !== null) ? body as Record<string, unknown> : {};
    const msg = String(b["message"] ?? b["error"] ?? `HTTP ${res.status}`);
    return { success: false, message: msg, status: res.status };
  }

  return body as T;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Register a new user with the auth-service.
 * Returns the raw response including `user_id` and `verification_token`.
 */
export async function register(
  payload: RegisterPayload,
): Promise<RegisterResult | AuthError> {
  return authFetch<RegisterResult>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      project_code: PROJECT_CODE,
      email: payload.email,
      password: payload.password,
      full_name: payload.full_name,
      phone: payload.phone ?? null,
    }),
  });
}

/**
 * Log in with email and password.
 * On success, stores the access_token in localStorage automatically.
 */
export async function login(
  email: string,
  password: string,
): Promise<LoginResult | AuthError> {
  const result = await authFetch<LoginResult>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ project_code: PROJECT_CODE, email, password }),
  });

  if (result.success && "access_token" in result) {
    setToken(result.access_token);
  }

  return result;
}

/**
 * Fetch the current user's identity from the auth-service.
 * Uses the provided token (or falls back to the stored token).
 */
export async function me(token?: string): Promise<MeResult | AuthError> {
  const tok = token ?? getToken();
  if (!tok) {
    return { success: false, message: "No access token" };
  }

  return authFetch<MeResult>("/api/auth/me", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tok}`,
    },
  });
}

/**
 * Verify an email confirmation token.
 * GET /api/auth/verify?token=...
 * May return an access_token if the service issues one on verification.
 */
export type VerifyResult = {
  success: true;
  user_id?: string;
  access_token?: string;
  email_verified?: boolean;
};

export async function verify(token: string): Promise<VerifyResult | AuthError> {
  return authFetch<VerifyResult>(
    `/api/auth/verify?token=${encodeURIComponent(token)}`,
    { method: "GET" },
  );
}

/**
 * Clear the stored token (client-side logout).
 * Auth-service has no session to invalidate server-side.
 */
export function logout(): void {
  clearToken();
}
