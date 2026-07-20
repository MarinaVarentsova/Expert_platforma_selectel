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

type AuthFetchMeta = {
  email?: string;
  project_code?: string;
};

async function authFetch<T>(
  path: string,
  options: RequestInit,
  meta: AuthFetchMeta = {},
): Promise<T | AuthError> {
  const method = options.method ?? "GET";
  console.log("[AUTH-CLIENT] request start", {
    url: path,
    method,
    email: meta.email,
    project_code: meta.project_code,
  });

  let res: Response;
  try {
    res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (err) {
    console.error("[AUTH-CLIENT] network error", {
      url: path,
      method,
      error: String(err),
    });
    return { success: false, message: `Network error: ${String(err)}` };
  }

  const contentType = res.headers.get("content-type") ?? "";
  console.log("[AUTH-CLIENT] response", {
    url: path,
    method,
    status: res.status,
    ok: res.ok,
    contentType,
  });

  let rawText: string;
  try {
    rawText = await res.text();
  } catch (err) {
    console.error("[AUTH-CLIENT] failed to read response body", {
      url: path,
      method,
      error: String(err),
    });
    return {
      success: false,
      message: `Auth service response body could not be read (HTTP ${res.status})`,
      status: res.status,
    };
  }

  let body: unknown;
  try {
    body = JSON.parse(rawText);
  } catch {
    console.error("[AUTH-CLIENT] non-json body preview", {
      url: path,
      method,
      status: res.status,
      contentType,
      preview: rawText.slice(0, 500),
    });
    return {
      success: false,
      message: `Auth service returned non-JSON response (HTTP ${res.status})`,
      status: res.status,
    };
  }

  if (!res.ok) {
    const b = (typeof body === "object" && body !== null) ? body as Record<string, unknown> : {};
    const msg = String(b["message"] ?? b["error"] ?? `HTTP ${res.status}`);
    console.error("[AUTH-CLIENT] error response body", {
      url: path,
      method,
      status: res.status,
      message: msg,
    });
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
  return authFetch<RegisterResult>(
    "/api/auth/register",
    {
      method: "POST",
      body: JSON.stringify({
        project_code: PROJECT_CODE,
        email: payload.email,
        password: payload.password,
        full_name: payload.full_name,
        phone: payload.phone ?? null,
      }),
    },
    { email: payload.email, project_code: PROJECT_CODE },
  );
}

/**
 * Log in with email and password.
 * On success, stores the access_token in localStorage automatically.
 */
export async function login(
  email: string,
  password: string,
): Promise<LoginResult | AuthError> {
  const result = await authFetch<LoginResult>(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ project_code: PROJECT_CODE, email, password }),
    },
    { email, project_code: PROJECT_CODE },
  );

  if (result.success && "access_token" in result) {
    console.log("[AUTH-CLIENT] login success", { user_id: result.user_id });
    setToken(result.access_token);
  } else {
    console.error("[AUTH-CLIENT] login failed", { email, project_code: PROJECT_CODE, message: result.message, status: result.status });
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

  return authFetch<MeResult>(
    "/api/auth/me",
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tok}`,
      },
    },
    { project_code: PROJECT_CODE },
  );
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
    { project_code: PROJECT_CODE },
  );
}

/**
 * Clear the stored token (client-side logout).
 * Auth-service has no session to invalidate server-side.
 */
export function logout(): void {
  clearToken();
}

// ── Password reset ────────────────────────────────────────────────────────────

export type ForgotPasswordResult = {
  success: true;
  message: string;
};

export type ResetPasswordResult = {
  success: true;
  email: string;
  message: string;
};

/**
 * Request a password-reset link for the given email.
 * POST /api/auth/forgot-password
 */
export async function forgotPassword(
  email: string,
): Promise<ForgotPasswordResult | AuthError> {
  return authFetch<ForgotPasswordResult>(
    "/api/auth/forgot-password",
    {
      method: "POST",
      body: JSON.stringify({ project_code: PROJECT_CODE, email }),
    },
    { email, project_code: PROJECT_CODE },
  );
}

/**
 * Exchange a reset token for a new password.
 * POST /api/auth/reset-password
 */
export async function resetPassword(
  token: string,
  password: string,
  passwordConfirmation: string,
): Promise<ResetPasswordResult | AuthError> {
  return authFetch<ResetPasswordResult>(
    "/api/auth/reset-password",
    {
      method: "POST",
      body: JSON.stringify({
        project_code: PROJECT_CODE,
        token,
        password,
        password_confirmation: passwordConfirmation,
      }),
    },
    { project_code: PROJECT_CODE },
  );
}
