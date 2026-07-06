import { useContext } from "react";
import { AuthContext } from "./authContext";
import type { AuthContextValue, PalataUser } from "./authContext";

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function useCurrentUser(): PalataUser | null {
  const { state } = useAuth();
  return state.kind === "authenticated" ? state.user : null;
}
