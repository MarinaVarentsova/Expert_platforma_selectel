import { Link, useLocation } from "wouter";

const TABS = [
  { to: "/admin",          label: "Все заказы",  exact: true },
  { to: "/admin/metrics",  label: "Метрики",     exact: false },
  { to: "/admin/experts",  label: "Эксперты",    exact: false },
  { to: "/admin/settings", label: "Настройки",   exact: false },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  function isActive(tab: { to: string; exact: boolean }) {
    return tab.exact ? location === tab.to : location === tab.to || location.startsWith(tab.to + "/");
  }

  return (
    <>
      <div className="bg-white border-b border-slate-200">
        <div className="px-6">
          <p className="pt-4 pb-0 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            Панель управления
          </p>
          <div className="flex items-end mt-2 gap-0">
            {TABS.map(tab => {
              const active = isActive(tab);
              return (
                <Link key={tab.to} href={tab.to}>
                  <span className={`
                    inline-block px-4 py-3 text-sm font-medium border-b-2 transition-colors select-none
                    ${active
                      ? "border-indigo-600 text-indigo-700"
                      : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                    }
                  `}>
                    {tab.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div>{children}</div>
    </>
  );
}
