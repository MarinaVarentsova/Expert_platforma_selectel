import { Link, useLocation } from "wouter";
import { Scale } from "lucide-react";

const LINKS = [
  { to: "/",         label: "Главная",       exact: true },
  { to: "/login",    label: "Вход",          exact: true },
  { to: "/customer", label: "ЛК заказчика",  exact: false },
  { to: "/expert",   label: "ЛК эксперта",   exact: false },
];

const ADMIN_LINK = { to: "/admin", label: "Администратор" };

export default function Nav() {
  const [location] = useLocation();

  function isActive(to: string, exact = false) {
    if (exact) return location === to;
    return location === to || location.startsWith(to + "/");
  }

  const isAdmin = isActive("/admin");

  return (
    <nav className="border-b border-slate-200 bg-white/95 backdrop-blur-sm sticky top-0 z-30 shadow-sm">
      <div className="max-w-full px-6 flex items-center h-14 gap-2">

        {/* Brand */}
        <Link href="/">
          <div className="flex items-center gap-2.5 mr-6 cursor-pointer select-none group">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-sm group-hover:shadow-indigo-200 transition-shadow">
              <Scale className="w-4 h-4 text-white" strokeWidth={2} />
            </div>
            <span className="text-sm font-bold text-slate-900 tracking-tight leading-none">
              Палата СЭ
            </span>
          </div>
        </Link>

        {/* Main links */}
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
        </div>

        {/* Admin entry */}
        <div className="flex items-center pl-3 ml-1 border-l border-slate-100">
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
        </div>

      </div>
    </nav>
  );
}
