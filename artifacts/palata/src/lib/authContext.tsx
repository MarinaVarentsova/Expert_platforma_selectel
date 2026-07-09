import {
  createContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { supabase } from "./supabaseClient";
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

async function fetchPalataUser(userId: string): Promise<PalataUser | null> {
  console.log("[PALATA-SESSION] querying palata_users", { userId });
  const { data, error } = await supabase
    .from("palata_users")
    .select("id, role, full_name, email, is_active")
    .eq("id", userId)
    .single();

  if (error || !data) {
    console.error("[PALATA-SESSION] palata_users not found", {
      userId,
      error: error ? String(error.message ?? error) : "no data",
    });
    return null;
  }
  console.log("[PALATA-SESSION] palata_users found", {
    userId,
    role: (data as PalataUser).role,
    is_active: (data as PalataUser).is_active,
  });
  return data as PalataUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ kind: "loading" });

  const applyToken = useCallback(async (token: string) => {
    const meResult = await authMe(token);
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
      user = await fetchPalataUser(userId);
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
    console.log("[PALATA-SESSION] /me result", {
      success: meResult.success,
      user_id: meResult.success ? meResult.user_id : undefined,
      status: meResult.success ? undefined : meResult.status,
    });
    if (!meResult.success) {
      console.error("[PALATA-SESSION] /me failed, logging out", { message: meResult.message });
      authLogout();
      return { error: meResult.message };
    }

    const user = await fetchPalataUser(meResult.user_id);
    if (!user) {
      console.error("[PALATA-SESSION] no palata_users profile — cannot redirect", { user_id: meResult.user_id });
      authLogout();
      return { error: "Профиль пользователя не найден. Обратитесь в поддержку." };
    }

    console.log("[PALATA-SESSION] signIn success, redirect target by role", { role: user.role });
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

