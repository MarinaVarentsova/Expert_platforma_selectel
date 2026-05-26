import { Link } from "wouter";

const CARDS = [
  {
    to: "/customer",
    role: "Заказчик",
    description: "Разместите заявку на судебную экспертизу. Система подберёт квалифицированного эксперта.",
  },
  {
    to: "/expert",
    role: "Эксперт",
    description: "Принимайте заказы по своей специализации и региону. Управляйте своим профилем.",
  },
  {
    to: "/admin",
    role: "Администратор",
    description: "Управляйте заявками, экспертами и процессом подбора.",
  },
];

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-16">

      <div className="mb-14 text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-4 tracking-tight">
          Палата судебных экспертов
        </h1>
        <p className="text-base text-slate-500 max-w-lg mx-auto leading-relaxed">
          Платформа для подбора независимых судебных экспертов под конкретную задачу
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CARDS.map(({ to, role, description }) => (
          <Link key={to} href={to}>
            <div className="block h-full bg-white rounded-xl border border-slate-200 p-6 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer group">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3 group-hover:text-indigo-500 transition-colors">
                {role}
              </p>
              <p className="text-sm text-slate-600 leading-relaxed mb-5">
                {description}
              </p>
              <p className="text-sm font-medium text-indigo-600 group-hover:text-indigo-700 transition-colors">
                Перейти
              </p>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-12 rounded-xl border border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Статус системы</p>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <span className="text-xs text-slate-500">Supabase подключён</span>
        </div>
      </div>

    </div>
  );
}
