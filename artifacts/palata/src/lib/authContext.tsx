import {
  createContext,
  useContext,
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

type AuthContextValue = {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchPalataUser(userId: string): Promise<PalataUser | null> {
  const { data, error } = await supabase
    .from("palata_users")
    .select("id, role, full_name, email, is_active")
    .eq("id", userId)
    .single();

  if (error || !data) return null;
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
    const loginResult = await authLogin(email, password);
    if (!loginResult.success) {
      return { error: loginResult.message };
    }

    const token = loginResult.access_token;
    const meResult = await authMe(token);
    if (!meResult.success) {
      authLogout();
      return { error: meResult.message };
    }

    const user = await fetchPalataUser(meResult.user_id);
    if (!user) {
      authLogout();
      return { error: "Профиль пользователя не найден. Обратитесь в поддержку." };
    }

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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function useCurrentUser(): PalataUser | null {
  const { state } = useAuth();
  return state.kind === "authenticated" ? state.user : null;
}
