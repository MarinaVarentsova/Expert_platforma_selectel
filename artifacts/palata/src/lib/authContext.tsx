import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

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
  | { kind: "authenticated"; session: Session; user: PalataUser };

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

  const applySession = useCallback(async (session: Session | null) => {
    if (!session) {
      setState({ kind: "unauthenticated" });
      return;
    }
    const user = await fetchPalataUser(session.user.id);
    if (!user) {
      setState({ kind: "unauthenticated" });
      return;
    }
    setState({ kind: "authenticated", session, user });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error("[auth] getSession error:", error.message);
        if (error.message.includes("Refresh Token") || error.message.includes("refresh_token")) {
          supabase.auth.signOut().catch(() => {});
        }
        setState({ kind: "unauthenticated" });
        return;
      }
      applySession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        applySession(session);
      },
    );

    return () => subscription.unsubscribe();
  }, [applySession]);

  const signIn = useCallback(async (
    email: string,
    password: string,
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
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
