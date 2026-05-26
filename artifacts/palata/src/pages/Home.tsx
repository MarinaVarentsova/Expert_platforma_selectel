import { Link } from "wouter";

const cards = [
  {
    to: "/customer",
    role: "Заказчик",
    description:
      "Разместите заявку на судебную экспертизу. Система подберёт квалифицированного эксперта.",
    color: "bg-blue-50 border-blue-200",
    badge: "bg-blue-100 text-blue-700",
  },
  {
    to: "/expert",
    role: "Эксперт",
    description:
      "Принимайте заказы по своей специализации и региону. Управляйте своим профилем.",
    color: "bg-green-50 border-green-200",
    badge: "bg-green-100 text-green-700",
  },
  {
    to: "/admin",
    role: "Администратор",
    description: "Управляйте заявками, экспертами и процессом подбора.",
    color: "bg-amber-50 border-amber-200",
    badge: "bg-amber-100 text-amber-700",
  },
];

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <div className="mb-14 text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">
          Палата судебных экспертов
        </h1>
        <p className="text-lg text-slate-500 max-w-xl mx-auto">
          Платформа для подбора независимых судебных экспертов под конкретную задачу
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map(({ to, role, description, color, badge }) => (
          <Link
            key={to}
            href={to}
            className={
              "block rounded-xl border p-6 transition-shadow hover:shadow-md cursor-pointer " +
              color
            }
          >
            <span
              className={
                "inline-block rounded-full px-3 py-0.5 text-xs font-semibold mb-4 " +
                badge
              }
            >
              {role}
            </span>
            <p className="text-sm text-slate-700 leading-relaxed">
              {description}
            </p>
            <p className="mt-4 text-sm font-medium text-slate-800">
              Перейти →
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-16 rounded-xl border border-slate-200 bg-slate-50 p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
          Статус системы
        </p>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-sm text-slate-600">Supabase подключён</span>
        </div>
      </div>
    </div>
  );
}
