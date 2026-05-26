import { Link, useLocation } from "wouter";

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
    <nav className="border-b border-slate-200 bg-white sticky top-0 z-30">
      <div className="max-w-full px-6 flex items-center h-14 gap-1">

        {/* Brand */}
        <Link href="/">
          <span className="text-sm font-bold text-slate-900 tracking-tight mr-5 cursor-pointer select-none">
            Палата СЭ
          </span>
        </Link>

        {/* Main links */}
        <div className="flex items-center gap-0.5 flex-1">
          {LINKS.map(({ to, label, exact }) => {
            const active = isActive(to, exact);
            return (
              <Link key={to} href={to}>
                <span className={`
                  inline-block px-3 py-1.5 rounded-md text-sm transition-colors cursor-pointer select-none
                  ${active
                    ? "text-indigo-700 font-semibold bg-indigo-50"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }
                `}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Admin entry */}
        <div className="flex items-center border-l border-slate-200 pl-3 ml-1">
          <Link href={ADMIN_LINK.to}>
            <span className={`
              inline-block px-3 py-1.5 rounded-md text-sm transition-colors cursor-pointer select-none
              ${isAdmin
                ? "text-indigo-700 font-semibold bg-indigo-50"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              }
            `}>
              {ADMIN_LINK.label}
            </span>
          </Link>
        </div>

      </div>
    </nav>
  );
}
