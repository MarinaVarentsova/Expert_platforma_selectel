import { Link, useLocation } from "wouter";
import { LogOut, ChevronDown, Menu, X } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import type { PalataRole } from "@/lib/authContext";
import { useState, useRef, useEffect } from "react";

type NavLink = { to: string; label: string };

const ROLE_LINKS: Record<PalataRole, NavLink[]> = {
  customer: [
    { to: "/customer", label: "ЛК заказчика" },
  ],
  expert: [
    { to: "/expert", label: "ЛК эксперта" },
  ],
  admin: [
    { to: "/admin",          label: "Панель" },
    { to: "/admin/metrics",  label: "Метрики" },
    { to: "/admin/experts",  label: "Эксперты" },
    { to: "/admin/settings", label: "Настройки" },
  ],
};

export default function Nav() {
  const [location] = useLocation();
  const { state, signOut } = useAuth();
  const [menuOpen, setMenuOpen]     = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isLoading       = state.kind === "loading";
  const isAuthenticated = state.kind === "authenticated";
  const user            = isAuthenticated ? state.user : null;
  const links: NavLink[] = isAuthenticated ? (ROLE_LINKS[user!.role] ?? []) : [];

  function isActive(to: string) {
    return location === to || location.startsWith(to + "/");
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  /* Close mobile menu on route change */
  useEffect(() => { setMobileOpen(false); }, [location]);

  return (
    <>
      <nav className="sticky top-0 z-30 border-b border-[#D0D0D0] bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-14 gap-2">

          {/* Brand */}
          <Link href="/">
            <div className="flex items-center mr-4 sm:mr-8 cursor-pointer select-none">
              <span className="text-sm font-bold text-[#111111] tracking-tight">Палата СЭ</span>
            </div>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden sm:flex items-center gap-1 flex-1">
            {links.map(({ to, label }) => {
              const active = isActive(to);
              return (
                <Link key={to} href={to}>
                  <span className={[
                    "inline-block px-3 py-1.5 rounded-full text-sm transition-all cursor-pointer select-none",
                    active
                      ? "text-[#002B5C] font-semibold bg-[#002B5C]/10"
                      : "text-[#666666] hover:text-[#002B5C] hover:bg-[#002B5C]/8",
                  ].join(" ")}>
                    {label}
                  </span>
                </Link>
              );
            })}

            {!isLoading && !isAuthenticated && (
              <>
                <Link href="/">
                  <span className={[
                    "inline-block px-3 py-1.5 rounded-full text-sm transition-all cursor-pointer select-none",
                    location === "/"
                      ? "text-[#002B5C] font-semibold bg-[#002B5C]/10"
                      : "text-[#666666] hover:text-[#002B5C] hover:bg-[#002B5C]/8",
                  ].join(" ")}>
                    Главная
                  </span>
                </Link>
                <Link href="/login">
                  <span className={[
                    "inline-block px-3 py-1.5 rounded-full text-sm transition-all cursor-pointer select-none",
                    isActive("/login")
                      ? "text-[#002B5C] font-semibold bg-[#002B5C]/10"
                      : "text-[#666666] hover:text-[#002B5C] hover:bg-[#002B5C]/8",
                  ].join(" ")}>
                    Войти
                  </span>
                </Link>
                <Link href="/register">
                  <span className={[
                    "inline-block px-3 py-1.5 rounded-full text-sm transition-all cursor-pointer select-none",
                    isActive("/register")
                      ? "text-[#002B5C] font-semibold bg-[#002B5C]/10"
                      : "text-[#666666] hover:text-[#002B5C] hover:bg-[#002B5C]/8",
                  ].join(" ")}>
                    Зарегистрироваться
                  </span>
                </Link>
              </>
            )}
          </div>

          {/* Spacer for mobile */}
          <div className="flex-1 sm:hidden" />

          {/* Right side */}
          <div className="flex items-center gap-2">

            {/* Desktop user menu */}
            {isAuthenticated && user && (
              <div className="relative hidden sm:block" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(v => !v)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all bg-white border border-[#D0D0D0] text-[#002B5C] font-medium hover:border-[#0F4C9A] hover:shadow-sm"
                >
                  <RoleAvatar role={user.role} />
                  <span className="max-w-[128px] truncate">{user.full_name ?? user.email}</span>
                  <ChevronDown className={["w-3 h-3 text-[#666666] transition-transform", menuOpen ? "rotate-180" : ""].join(" ")} />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-lg border border-[#D0D0D0] py-1 z-50">
                    <div className="px-3 py-2.5 border-b border-[#E9E9E9]">
                      <p className="text-xs font-semibold text-[#111111] truncate">{user.full_name ?? "—"}</p>
                      <p className="text-[10px] text-[#666666] truncate mt-0.5">{user.email}</p>
                      <RoleBadge role={user.role} />
                    </div>
                    <button
                      onClick={() => { setMenuOpen(false); signOut(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-700 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Выйти
                    </button>
                  </div>
                )}
              </div>
            )}


            {/* Mobile hamburger */}
            <button
              className="sm:hidden p-2 rounded-lg text-[#111111] hover:bg-[#F4F4F4] transition-colors"
              onClick={() => setMobileOpen(v => !v)}
              aria-label={mobileOpen ? "Закрыть меню" : "Открыть меню"}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="sm:hidden fixed inset-0 z-20 bg-white top-14 overflow-y-auto">
          <div className="border-b border-[#D0D0D0]">
            <div className="px-4 py-3 space-y-1">
              {links.map(({ to, label }) => (
                <Link key={to} href={to}>
                  <span className={[
                    "block px-4 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer",
                    isActive(to)
                      ? "bg-[#002B5C]/10 text-[#002B5C] font-semibold"
                      : "text-[#111111] hover:bg-[#F4F4F4]",
                  ].join(" ")}>
                    {label}
                  </span>
                </Link>
              ))}
              {!isLoading && !isAuthenticated && (
                <>
                  <Link href="/">
                    <span className={[
                      "block px-4 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer",
                      location === "/"
                        ? "bg-[#002B5C]/10 text-[#002B5C] font-semibold"
                        : "text-[#111111] hover:bg-[#F4F4F4]",
                    ].join(" ")}>
                      Главная
                    </span>
                  </Link>
                  <Link href="/login">
                    <span className={[
                      "block px-4 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer",
                      isActive("/login")
                        ? "bg-[#002B5C]/10 text-[#002B5C] font-semibold"
                        : "text-[#111111] hover:bg-[#F4F4F4]",
                    ].join(" ")}>
                      Войти
                    </span>
                  </Link>
                  <Link href="/register">
                    <span className={[
                      "block px-4 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer",
                      isActive("/register")
                        ? "bg-[#002B5C]/10 text-[#002B5C] font-semibold"
                        : "text-[#111111] hover:bg-[#F4F4F4]",
                    ].join(" ")}>
                      Зарегистрироваться
                    </span>
                  </Link>
                </>
              )}
            </div>
          </div>

          {isAuthenticated && user && (
            <div className="px-4 py-4">
              <div className="flex items-center gap-3 mb-4 p-3 bg-[#F4F4F4] rounded-xl">
                <RoleAvatar role={user.role} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#111111] truncate">{user.full_name ?? "—"}</p>
                  <p className="text-xs text-[#666666] truncate">{user.email}</p>
                  <RoleBadge role={user.role} />
                </div>
              </div>
              <button
                onClick={() => { setMobileOpen(false); signOut(); }}
                className="flex items-center gap-2 w-full px-4 py-3 rounded-xl text-sm text-red-700 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Выйти из системы
              </button>
            </div>
          )}

        </div>
      )}
    </>
  );
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

function RoleAvatar({ role }: { role: string }) {
  const colors: Record<string, string> = {
    customer: "bg-amber-100 text-amber-800",
    expert:   "bg-blue-100 text-blue-800",
    admin:    "bg-stone-200 text-stone-700",
  };
  const letters: Record<string, string> = {
    customer: "З", expert: "Э", admin: "А",
  };
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${colors[role] ?? "bg-stone-100 text-stone-500"}`}>
      {letters[role] ?? "?"}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    customer: "bg-amber-50 text-amber-800 border border-amber-200",
    expert:   "bg-blue-50 text-blue-800 border border-blue-200",
    admin:    "bg-stone-100 text-stone-700 border border-stone-200",
  };
  const labels: Record<string, string> = {
    customer: "Заказчик", expert: "Эксперт", admin: "Администратор",
  };
  return (
    <span className={`inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ${styles[role] ?? "bg-stone-50 text-stone-500"}`}>
      {labels[role] ?? role}
    </span>
  );
}
