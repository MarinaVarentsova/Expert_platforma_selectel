import { Link } from "wouter";
import { FileText, Search, UserCheck, Users, MapPin, Star, ArrowRight, ShieldCheck, Gavel } from "lucide-react";

const STEPS = [
  {
    Icon: FileText,
    step: "01",
    title: "Подайте заявку",
    desc: "Опишите задачу, укажите специализацию и регион. Система зафиксирует требования.",
  },
  {
    Icon: Search,
    step: "02",
    title: "Автоматический подбор",
    desc: "Алгоритм ранжирует верифицированных экспертов по рейтингу, опыту и доступности.",
  },
  {
    Icon: UserCheck,
    step: "03",
    title: "Эксперт принимает дело",
    desc: "Вы получаете квалифицированного специалиста с подтверждёнными регистровыми данными.",
  },
];

const CARDS = [
  {
    to: "/customer/new-request",
    role: "Заказчик",
    description: "Подайте заявку на судебную экспертизу. Система автоматически подберёт квалифицированного специалиста по вашему региону и направлению.",
    Icon: Gavel,
    iconBg: "bg-gradient-to-br from-indigo-500 to-indigo-700",
    cta: "Подать заявку",
  },
  {
    to: "/expert",
    role: "Эксперт",
    description: "Принимайте заказы по своей специализации и региону. Управляйте профилем, документами и репутацией на платформе.",
    Icon: ShieldCheck,
    iconBg: "bg-gradient-to-br from-emerald-500 to-teal-700",
    cta: "Личный кабинет",
  },
  {
    to: "/admin",
    role: "Администратор",
    description: "Управляйте заявками, экспертным пулом и процессом подбора. Полная аналитика в реальном времени.",
    Icon: Users,
    iconBg: "bg-gradient-to-br from-violet-500 to-purple-700",
    cta: "Панель управления",
  },
];

const FEATURES = [
  { Icon: ShieldCheck, label: "Верификация", desc: "Только эксперты с подтверждёнными реестровыми номерами" },
  { Icon: Star,        label: "Рейтинг",     desc: "Рейтинговая система на основе реальных отзывов заказчиков" },
  { Icon: MapPin,      label: "Регионы",     desc: "74 субъекта РФ, выездные экспертизы по всей стране" },
  { Icon: FileText,    label: "Документы",   desc: "Хранение материалов дела и файлов внутри платформы" },
];

export default function Home() {
  return (
    <div className="min-h-screen">

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="hero-gradient relative overflow-hidden py-28 px-6">
        {/* Dot grid overlay */}
        <div className="absolute inset-0 dot-grid opacity-100" />

        {/* Glowing orbs */}
        <div className="absolute top-16 left-1/3 w-[32rem] h-[32rem] rounded-full bg-indigo-700/25 blur-[80px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full bg-violet-700/20 blur-[60px] pointer-events-none" />

        <div className="relative max-w-3xl mx-auto text-center">

          {/* Status pill */}
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/15 text-indigo-200 text-xs font-medium px-4 py-1.5 rounded-full mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Платформа аккредитованных судебных экспертов РФ
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-white mb-5 tracking-tight leading-[1.08]">
            Палата судебных<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-violet-300">
              экспертов
            </span>
          </h1>

          <p className="text-lg text-slate-300 max-w-xl mx-auto leading-relaxed mb-10">
            Профессиональная workflow-платформа для независимых судебно-экспертных назначений
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/customer/new-request">
              <button className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 active:bg-indigo-600 text-white font-semibold px-7 py-3 rounded-xl transition-all shadow-lg shadow-indigo-900/40">
                Подать заявку
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
            <Link href="/admin">
              <button className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/20 text-white font-medium px-7 py-3 rounded-xl transition-all">
                Панель администратора
              </button>
            </Link>
          </div>

          {/* Stats strip */}
          <div className="mt-14 pt-8 border-t border-white/10 grid grid-cols-3 gap-8 max-w-sm mx-auto">
            <div>
              <p className="text-3xl font-bold text-white">150+</p>
              <p className="text-xs text-indigo-300 mt-0.5 uppercase tracking-wide">экспертов</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-white">74</p>
              <p className="text-xs text-indigo-300 mt-0.5 uppercase tracking-wide">региона</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-white">1 000+</p>
              <p className="text-xs text-indigo-300 mt-0.5 uppercase tracking-wide">дел закрыто</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────── */}
      <section className="bg-white py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 mb-2">Как работает сервис</p>
            <h2 className="text-2xl font-bold text-slate-900">Три шага до результата</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {STEPS.map(({ Icon, step, title, desc }, i) => (
              <div key={step} className="flex flex-col items-start">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-100 flex-shrink-0">
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="hidden md:block flex-1 h-px bg-gradient-to-r from-indigo-200 to-transparent ml-2" />
                  )}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-1">{step}</div>
                <p className="text-base font-semibold text-slate-900 mb-2">{title}</p>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Role cards ──────────────────────────────────────────────── */}
      <section className="bg-slate-50 py-20 px-6 border-t border-slate-100">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 mb-2">Участники платформы</p>
            <h2 className="text-2xl font-bold text-slate-900">Выберите свою роль</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {CARDS.map(({ to, role, description, Icon, iconBg, cta }) => (
              <Link key={to} href={to}>
                <div className="h-full bg-white rounded-2xl border border-slate-100 p-6 hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer group shadow-sm">
                  <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center mb-5 shadow-sm group-hover:shadow-md transition-shadow`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 group-hover:text-indigo-500 transition-colors">
                    {role}
                  </p>
                  <p className="text-sm text-slate-600 leading-relaxed mb-5">{description}</p>
                  <div className="flex items-center gap-1 text-sm font-semibold text-indigo-600 group-hover:gap-2 transition-all">
                    {cta}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features strip ──────────────────────────────────────────── */}
      <section className="bg-white py-16 px-6 border-t border-slate-100">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {FEATURES.map(({ Icon, label, desc }) => (
              <div key={label} className="flex flex-col items-start">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center mb-3">
                  <Icon className="w-4.5 h-4.5 text-indigo-600" />
                </div>
                <p className="text-sm font-semibold text-slate-800 mb-1">{label}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── System status bar ───────────────────────────────────────── */}
      <div className="bg-slate-900 py-3.5 px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Статус системы</p>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-slate-400">Supabase подключён · Система работает штатно</span>
          </div>
        </div>
      </div>

    </div>
  );
}
