import { Link, useLocation } from "wouter";
import { Scale, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useState, useRef, useEffect } from "react";

const LINKS = [
  { to: "/",         label: "Главная",       exact: true },
  { to: "/customer", label: "ЛК заказчика",  exact: false },
  { to: "/expert",   label: "ЛК эксперта",   exact: false },
];

const ADMIN_LINK = { to: "/admin", label: "Администратор" };

export default function Nav() {
  const [location] = useLocation();
  const { state, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isLoggedIn = state.kind === "authenticated";
  const user = isLoggedIn ? state.user : null;

  function isActive(to: string, exact = false) {
    if (exact) return location === to;
    return location === to || location.startsWith(to + "/");
  }

  const isAdmin = isActive("/admin");

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <nav className="border-b border-slate-200 bg-white/95 backdrop-blur-sm sticky top-0 z-30 shadow-sm">
      <div className="max-w-full px-6 flex items-center h-14 gap-2">

        {/* Brand */}
        <Link href="/">
          <div className="flex items-center gap-2.5 mr-6 cursor-pointer select-none group">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-sm group-hover:shadow-indigo-200 transition-shadow">
              <Scale className="w-4 h-4 text-white" strokeWidth={2} />
            </div>
            <span className="text-sm font-bold text-slate-900 tracking-tight">
              Палата СЭ
            </span>
          </div>
        </Link>

        {/* Main nav links */}
        <div className="flex items-center gap-0.5 flex-1">
          {LINKS.map(({ to, label, exact }) => {
            const active = isActive(to, exact);
            return (
              <Link key={to} href={to}>
                <span className={[
                  "inline-block px-3 py-1.5 rounded-lg text-sm transition-all cursor-pointer select-none",
                  active
                    ? "text-indigo-700 font-semibold bg-indigo-50 ring-1 ring-indigo-100"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50",
                ].join(" ")}>
                  {label}
                </span>
              </Link>
            );
          })}

          {/* Show login link only when not authenticated */}
          {!isLoggedIn && (
            <Link href="/login">
              <span className={[
                "inline-block px-3 py-1.5 rounded-lg text-sm transition-all cursor-pointer select-none",
                isActive("/login", true)
                  ? "text-indigo-700 font-semibold bg-indigo-50 ring-1 ring-indigo-100"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-50",
              ].join(" ")}>
                Вход
              </span>
            </Link>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 pl-3 ml-1 border-l border-slate-100">

          {/* Admin link */}
          <Link href={ADMIN_LINK.to}>
            <span className={[
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer select-none",
              isAdmin
                ? "text-indigo-700 bg-indigo-50 ring-1 ring-indigo-100"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50",
            ].join(" ")}>
              <span className={["h-1.5 w-1.5 rounded-full", isAdmin ? "bg-indigo-500" : "bg-slate-300"].join(" ")} />
              {ADMIN_LINK.label}
            </span>
          </Link>

          {/* User menu (when logged in) */}
          {isLoggedIn && user && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium"
              >
                <RoleAvatar role={user.role} />
                <span className="max-w-32 truncate">{user.full_name ?? user.email}</span>
                <ChevronDown className={["w-3 h-3 text-slate-400 transition-transform", menuOpen ? "rotate-180" : ""].join(" ")} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50">
                  <div className="px-3 py-2.5 border-b border-slate-50">
                    <p className="text-xs font-semibold text-slate-800 truncate">{user.full_name ?? "—"}</p>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">{user.email}</p>
                    <RoleBadge role={user.role} />
                  </div>
                  <button
                    onClick={() => { setMenuOpen(false); signOut(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Выйти
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Login button when NOT logged in */}
          {!isLoggedIn && state.kind !== "loading" && (
            <Link href="/login">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-all cursor-pointer shadow-sm">
                Войти
              </span>
            </Link>
          )}

        </div>
      </div>
    </nav>
  );
}

function RoleAvatar({ role }: { role: string }) {
  const colors: Record<string, string> = {
    customer: "bg-indigo-100 text-indigo-700",
    expert:   "bg-emerald-100 text-emerald-700",
    admin:    "bg-violet-100 text-violet-700",
  };
  const letters: Record<string, string> = {
    customer: "З",
    expert:   "Э",
    admin:    "А",
  };
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${colors[role] ?? "bg-slate-100 text-slate-500"}`}>
      {letters[role] ?? "?"}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    customer: "bg-indigo-50 text-indigo-600",
    expert:   "bg-emerald-50 text-emerald-600",
    admin:    "bg-violet-50 text-violet-600",
  };
  const labels: Record<string, string> = {
    customer: "Заказчик",
    expert:   "Эксперт",
    admin:    "Администратор",
  };
  return (
    <span className={`inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ${styles[role] ?? "bg-slate-50 text-slate-500"}`}>
      {labels[role] ?? role}
    </span>
  );
}
