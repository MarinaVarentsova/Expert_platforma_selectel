import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth, type PalataRole, type PalataUser } from "./authContext";

const ROLE_HOME: Record<PalataRole, string> = {
  customer: "/customer",
  expert:   "/expert",
  admin:    "/admin",
};

export type RoleGuardResult =
  | { status: "loading" }
  | { status: "redirecting" }
  | { status: "ok"; user: PalataUser };

/**
 * Protects a page by role.
 * - Not authenticated  → redirect to /login
 * - Wrong role         → redirect to the user's own dashboard
 * - Correct role       → return { status: "ok", user }
 *
 * Pass `required = null` to only require authentication (any role).
 */
export function useRequireRole(required: PalataRole | null = null): RoleGuardResult {
  const { state } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (state.kind === "loading") return;

    if (state.kind === "unauthenticated") {
      navigate("/login");
      return;
    }

    if (required !== null && state.user.role !== required) {
      navigate(ROLE_HOME[state.user.role]);
    }
  }, [state, navigate, required]);

  if (state.kind === "loading") return { status: "loading" };
  if (state.kind === "unauthenticated") return { status: "redirecting" };
  if (required !== null && state.user.role !== required) return { status: "redirecting" };

  return { status: "ok", user: state.user };
}
