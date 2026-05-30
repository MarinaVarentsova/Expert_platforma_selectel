import { Link, useLocation } from "wouter";
import { LayoutDashboard, BarChart3, Users, Settings, Activity, CalendarClock, Mail } from "lucide-react";

const TABS = [
  { to: "/admin",               label: "Все заказы",    Icon: LayoutDashboard, exact: true },
  { to: "/admin/metrics",       label: "Метрики",       Icon: BarChart3,       exact: false },
  { to: "/admin/experts",       label: "Эксперты",      Icon: Users,           exact: false },
  { to: "/admin/action-items",  label: "Action Items",  Icon: Activity,        exact: false },
  { to: "/admin/events",        label: "События",       Icon: CalendarClock,   exact: false },
  { to: "/admin/email-events",  label: "Email Events",  Icon: Mail,            exact: false },
  { to: "/admin/settings",      label: "Настройки",     Icon: Settings,        exact: false },
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
      <div className="bg-white border-b border-[#D0D0D0]">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between pt-4 pb-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#666666]">
              Панель управления
            </p>
            <div className="flex items-center gap-1.5 pb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-[#666666] font-medium">Live</span>
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
                      ? "border-[#0F4C9A] text-[#111111] bg-[#F4F4F4]"
                      : "border-transparent text-[#666666] hover:text-[#002B5C] hover:border-[#D0D0D0] hover:bg-[#f5faf6]",
                  ].join(" ")}>
                    <tab.Icon className={["w-3.5 h-3.5", active ? "text-[#0F4C9A]" : "text-[#D0D0D0]"].join(" ")} />
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
