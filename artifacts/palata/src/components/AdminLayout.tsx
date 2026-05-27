import { Link, useLocation } from "wouter";
import { LayoutDashboard, BarChart3, Users, Settings } from "lucide-react";

const TABS = [
  { to: "/admin",          label: "Все заказы", Icon: LayoutDashboard, exact: true },
  { to: "/admin/metrics",  label: "Метрики",    Icon: BarChart3,       exact: false },
  { to: "/admin/experts",  label: "Эксперты",   Icon: Users,           exact: false },
  { to: "/admin/settings", label: "Настройки",  Icon: Settings,        exact: false },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  function isActive(tab: { to: string; exact: boolean }) {
    return tab.exact
      ? location === tab.to
      : location === tab.to || location.startsWith(tab.to + "/");
  }

  return (
    <>
      {/* Admin sub-header */}
      <div className="bg-white border-b border-[#e5dfd7]">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between pt-4 pb-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]">
              Панель управления
            </p>
            <div className="flex items-center gap-1.5 pb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-[#a8a29e] font-medium">Live</span>
            </div>
          </div>

          <div className="flex items-end mt-3 gap-0.5">
            {TABS.map(tab => {
              const active = isActive(tab);
              return (
                <Link key={tab.to} href={tab.to}>
                  <span className={[
                    "inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium border-b-2 transition-all select-none rounded-t-lg",
                    active
                      ? "border-[#e8891a] text-[#1c1714] bg-[#f2ece2]"
                      : "border-transparent text-[#a8a29e] hover:text-[#2e2a27] hover:border-[#ddd6ce] hover:bg-[#f9f6f1]",
                  ].join(" ")}>
                    <tab.Icon className={["w-3.5 h-3.5", active ? "text-[#e8891a]" : "text-[#c4bdb4]"].join(" ")} />
                    {tab.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="min-h-[calc(100vh-theme(spacing.14)-theme(spacing.12))]">{children}</div>
    </>
  );
}
