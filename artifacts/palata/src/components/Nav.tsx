import { Link, useLocation } from "wouter";
import { LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useState, useRef, useEffect } from "react";

const LINKS = [
  { to: "/customer", label: "ЛК заказчика",  exact: false },
  { to: "/expert",   label: "ЛК эксперта",   exact: false },
  { to: "/admin",    label: "Панель",         exact: false },
];

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
    <nav className="sticky top-0 z-30 border-b border-[#ddd6ce] bg-[#f2ece2]/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 flex items-center h-14 gap-2">

        {/* Brand */}
        <Link href="/">
          <div className="flex items-center gap-2.5 mr-8 cursor-pointer select-none group">
            <div className="w-8 h-8 rounded-full bg-[#2e2a27] flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-[#e8891a] tracking-tight">СЭ</span>
            </div>
            <span className="text-sm font-bold text-[#1c1714] tracking-tight">
              Палата СЭ
            </span>
          </div>
        </Link>

        {/* Main nav links */}
        <div className="flex items-center gap-1 flex-1">
          {LINKS.map(({ to, label, exact }) => {
            const active = isActive(to, exact);
            return (
              <Link key={to} href={to}>
                <span className={[
                  "inline-block px-3 py-1.5 rounded-full text-sm transition-all cursor-pointer select-none",
                  active
                    ? "text-[#1c1714] font-semibold bg-[#2e2a27]/10"
                    : "text-[#78716c] hover:text-[#1c1714] hover:bg-[#2e2a27]/6",
                ].join(" ")}>
                  {label}
                </span>
              </Link>
            );
          })}

          {!isLoggedIn && (
            <Link href="/login">
              <span className={[
                "inline-block px-3 py-1.5 rounded-full text-sm transition-all cursor-pointer select-none",
                isActive("/login", true)
                  ? "text-[#1c1714] font-semibold bg-[#2e2a27]/10"
                  : "text-[#78716c] hover:text-[#1c1714] hover:bg-[#2e2a27]/6",
              ].join(" ")}>
                Вход
              </span>
            </Link>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">

          {/* User menu when logged in */}
          {isLoggedIn && user && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all bg-white border border-[#d6cfc4] text-[#2e2a27] font-medium hover:border-[#bab3aa] hover:shadow-sm"
              >
                <RoleAvatar role={user.role} />
                <span className="max-w-32 truncate">{user.full_name ?? user.email}</span>
                <ChevronDown className={["w-3 h-3 text-[#a8a29e] transition-transform", menuOpen ? "rotate-180" : ""].join(" ")} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-lg border border-[#e5dfd7] py-1 z-50">
                  <div className="px-3 py-2.5 border-b border-[#f0ebe3]">
                    <p className="text-xs font-semibold text-[#1c1714] truncate">{user.full_name ?? "—"}</p>
                    <p className="text-[10px] text-[#a8a29e] truncate mt-0.5">{user.email}</p>
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

          {/* Login button when not logged in */}
          {!isLoggedIn && state.kind !== "loading" && (
            <Link href="/login">
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold bg-[#2e2a27] hover:bg-[#1c1714] text-[#f2ece2] transition-all cursor-pointer shadow-sm">
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
    customer: "bg-amber-100 text-amber-800",
    expert:   "bg-emerald-100 text-emerald-800",
    admin:    "bg-stone-200 text-stone-700",
  };
  const letters: Record<string, string> = {
    customer: "З",
    expert:   "Э",
    admin:    "А",
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
    expert:   "bg-emerald-50 text-emerald-800 border border-emerald-200",
    admin:    "bg-stone-100 text-stone-700 border border-stone-200",
  };
  const labels: Record<string, string> = {
    customer: "Заказчик",
    expert:   "Эксперт",
    admin:    "Администратор",
  };
  return (
    <span className={`inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ${styles[role] ?? "bg-stone-50 text-stone-500"}`}>
      {labels[role] ?? role}
    </span>
  );
}
