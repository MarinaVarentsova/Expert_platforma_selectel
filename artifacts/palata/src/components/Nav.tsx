import { Link, useLocation } from "wouter";

const links = [
  { to: "/",         label: "Главная" },
  { to: "/login",    label: "Вход" },
  { to: "/customer", label: "ЛК заказчика" },
  { to: "/expert",   label: "ЛК эксперта" },
  { to: "/admin",    label: "Админка" },
];

export default function Nav() {
  const [location] = useLocation();
  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="max-w-5xl mx-auto px-6 flex items-center gap-1 h-14">
        <span className="text-sm font-semibold text-slate-800 mr-4 shrink-0">
          Палата СЭ
        </span>
        {links.map(({ to, label }) => {
          const active = location === to;
          return (
            <Link
              key={to}
              href={to}
              className={
                "px-3 py-1.5 rounded text-sm transition-colors " +
                (active
                  ? "bg-slate-900 text-white font-medium"
                  : "text-slate-600 hover:bg-slate-100")
              }
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
