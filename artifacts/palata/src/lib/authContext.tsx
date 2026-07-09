import {
  createContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  login as authLogin,
  logout as authLogout,
  me as authMe,
  getToken,
} from "./authClient";

export type PalataRole = "customer" | "expert" | "admin";

export type PalataUser = {
  id: string;
  role: PalataRole;
  full_name: string | null;
  email: string;
  is_active: boolean;
};

export type AuthState =
  | { kind: "loading" }
  | { kind: "unauthenticated" }
  | { kind: "authenticated"; user: PalataUser };

export type AuthContextValue = {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

function redirectTargetForRole(role: PalataRole): string {
  if (role === "admin") return "/admin";
  if (role === "expert") return "/expert";
  return "/customer";
}

async function fetchPalataUser(token: string): Promise<PalataUser | null> {
  console.log("[PALATA-SESSION] requesting /api/palata/users/me");

  let res: Response;
  try {
    res = await fetch("/api/palata/users/me", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.error("[PALATA-SESSION] /api/palata/users/me network error", { error: String(err) });
    return null;
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  const success = Boolean(body && typeof body === "object" && (body as Record<string, unknown>)["success"] === true);
  const role = success ? ((body as Record<string, unknown>)["user"] as PalataUser | undefined)?.role : undefined;

  console.log("[PALATA-SESSION] palata user response", {
    status: res.status,
    success,
    role: role ?? null,
  });

  if (!success) {
    console.error("[PALATA-SESSION] palata user lookup failed", {
      status: res.status,
      error: body && typeof body === "object" ? (body as Record<string, unknown>)["error"] : "unknown",
    });
    return null;
  }

  return (body as { user: PalataUser }).user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ kind: "loading" });

  const applyToken = useCallback(async (token: string) => {
    const meResult = await authMe(token);
    console.log("[PALATA-SESSION] auth me result", {
      user_id: meResult.success ? meResult.user_id : null,
      email: meResult.success ? meResult.email : null,
    });
    if (!meResult.success) {
      authLogout();
      setState({ kind: "unauthenticated" });
      return;
    }

    const userId = meResult.user_id;
    const t0 = Date.now();
    console.log("[profile] load start", { userId });
    const profileTimer = setTimeout(() => {
      console.warn("[profile] load slow warning", { userId, elapsedMs: Date.now() - t0 });
    }, 5000);

    let user: PalataUser | null;
    try {
      user = await fetchPalataUser(token);
    } catch (err) {
      clearTimeout(profileTimer);
      console.error("[profile] load error", { userId, error: String(err) });
      authLogout();
      setState({ kind: "unauthenticated" });
      return;
    }
    clearTimeout(profileTimer);

    console.log("[profile] load result", {
      role: user?.role ?? null,
      userId,
      error: user ? null : "no profile found in palata_users",
      elapsedMs: Date.now() - t0,
    });

    if (!user) {
      authLogout();
      setState({ kind: "unauthenticated" });
      return;
    }

    console.log("[PALATA-SESSION] redirect target =", redirectTargetForRole(user.role));
    setState({ kind: "authenticated", user });
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setState({ kind: "unauthenticated" });
      return;
    }
    applyToken(token);
  }, [applyToken]);

  const signIn = useCallback(async (
    email: string,
    password: string,
  ): Promise<{ error: string | null }> => {
    console.log("[PALATA-SESSION] signIn start", { email });

    const loginResult = await authLogin(email, password);
    console.log("[PALATA-SESSION] access_token received", {
      success: loginResult.success,
      hasToken: loginResult.success && "access_token" in loginResult,
    });
    if (!loginResult.success) {
      console.error("[PALATA-SESSION] login failed, aborting signIn", { message: loginResult.message });
      return { error: loginResult.message };
    }

    const token = loginResult.access_token;
    const meResult = await authMe(token);
    console.log("[PALATA-SESSION] auth me result", {
      user_id: meResult.success ? meResult.user_id : null,
      email: meResult.success ? meResult.email : null,
    });
    if (!meResult.success) {
      console.error("[PALATA-SESSION] /me failed, logging out", { message: meResult.message });
      authLogout();
      return { error: meResult.message };
    }

    const user = await fetchPalataUser(token);
    if (!user) {
      console.error("[PALATA-SESSION] no palata_users profile — cannot redirect", { user_id: meResult.user_id });
      authLogout();
      return { error: "Профиль пользователя не найден. Обратитесь в поддержку." };
    }

    console.log("[PALATA-SESSION] redirect target =", redirectTargetForRole(user.role));
    setState({ kind: "authenticated", user });
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    authLogout();
    setState({ kind: "unauthenticated" });
    window.location.href = "/";
  }, []);

  return (
    <AuthContext.Provider value={{ state, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

