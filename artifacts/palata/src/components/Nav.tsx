import { Link, useLocation } from "wouter";

const links = [
  { to: "/",              label: "Главная",    group: "main" },
  { to: "/login",         label: "Вход",       group: "main" },
  { to: "/customer",      label: "ЛК заказчика", group: "main" },
  { to: "/expert",        label: "ЛК эксперта",  group: "main" },
  { to: "/admin",         label: "Админка",    group: "admin" },
  { to: "/admin/metrics", label: "Метрики",    group: "admin" },
];

export default function Nav() {
  const [location] = useLocation();

  function isActive(to: string) {
    if (to === "/") return location === "/";
    return location === to || location.startsWith(to + "/");
  }

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="max-w-full px-6 flex items-center gap-1 h-14">
        <span className="text-sm font-semibold text-slate-800 mr-4 shrink-0">
          Палата СЭ
        </span>

        {/* Main links */}
        <div className="flex items-center gap-1 flex-1">
          {links.filter(l => l.group === "main").map(({ to, label }) => (
            <Link
              key={to}
              href={to}
              className={
                "px-3 py-1.5 rounded text-sm transition-colors " +
                (isActive(to)
                  ? "bg-slate-900 text-white font-medium"
                  : "text-slate-600 hover:bg-slate-100")
              }
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Admin group — separated by divider */}
        <div className="flex items-center gap-1 border-l border-slate-200 pl-3 ml-2">
          {links.filter(l => l.group === "admin").map(({ to, label }) => (
            <Link
              key={to}
              href={to}
              className={
                "px-3 py-1.5 rounded text-sm transition-colors " +
                (isActive(to)
                  ? "bg-amber-500 text-white font-medium"
                  : "text-amber-700 hover:bg-amber-50")
              }
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
