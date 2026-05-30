import { Link } from "wouter";
import { FileText, Search, UserCheck, ShieldCheck, Star, MapPin, ArrowRight } from "lucide-react";

const STATS = [
  { value: "150+",   label: "Экспертов" },
  { value: "74",     label: "Региона" },
  { value: "1 000+", label: "Дел закрыто" },
  { value: "100%",   label: "Верифицированы" },
];

const STEPS = [
  {
    Icon: FileText,
    step: "01",
    title: "Создайте заказ",
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
    desc: "Вы получаете квалифицированного специалиста с подтверждёнными реестровыми данными.",
  },
];

const FEATURES = [
  { Icon: ShieldCheck, label: "Верификация",  desc: "Только эксперты с подтверждёнными реестровыми номерами" },
  { Icon: Star,        label: "Рейтинг",      desc: "Рейтинговая система на основе реальных отзывов заказчиков" },
  { Icon: MapPin,      label: "74 региона",   desc: "Выездные экспертизы по всей территории России" },
  { Icon: FileText,    label: "Документы",    desc: "Хранение материалов дела и файлов внутри платформы" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="px-4 sm:px-6 pt-12 sm:pt-16 pb-0 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 items-center">

          {/* Left — headline + CTA */}
          <div className="pb-8 lg:pb-16">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 border border-[#D0D0D0] text-[#666666] text-xs font-medium px-3 py-1.5 rounded-full mb-6 sm:mb-8">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Закрытая профессиональная платформа
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#111111] leading-[1.08] tracking-tight mb-4 sm:mb-5">
              Платформа,<br />
              которая{" "}
              <span className="text-[#0F4C9A]">находит</span>
              <br />
              нужного эксперта
            </h1>

            <p className="text-base sm:text-lg text-[#666666] leading-relaxed mb-6 sm:mb-8 max-w-md">
              Автоматизированный подбор аккредитованных судебных экспертов по специализации, региону и репутации.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link href="/customer/new-request">
                <button className="inline-flex items-center gap-2 bg-[#002B5C] hover:bg-[#003a7a] text-white font-semibold px-5 sm:px-6 py-2.5 sm:py-3 rounded-full transition-all shadow-sm text-sm sm:text-base">
                  Создать заказ
                  <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
              <Link href="/login">
                <button className="inline-flex items-center gap-2 bg-white border border-[#0F4C9A] hover:bg-[#F4F4F4] text-[#0F4C9A] font-medium px-5 sm:px-6 py-2.5 sm:py-3 rounded-full transition-all text-sm sm:text-base">
                  Войти в кабинет
                </button>
              </Link>
              <Link href="/register">
                <button className="inline-flex items-center gap-2 bg-white border border-[#D0D0D0] hover:bg-[#F4F4F4] text-[#111111] font-medium px-5 sm:px-6 py-2.5 sm:py-3 rounded-full transition-all text-sm sm:text-base">
                  Зарегистрироваться
                </button>
              </Link>
            </div>
          </div>

          {/* Right — dark panel (terminal-style), visible on all sizes */}
          <div className="mb-8 lg:mb-0">
            <div className="bg-[#111111] rounded-2xl overflow-hidden shadow-2xl" style={{ aspectRatio: "4/3" }}>
              {/* Terminal header */}
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/8">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#666666]/70" />
                <span className="ml-3 text-[10px] font-mono text-white/25 tracking-widest uppercase">// PALATA MATCHING ENGINE</span>
              </div>

              {/* Content */}
              <div className="p-4 sm:p-6 font-mono">
                <div className="text-[11px] text-white/40 mb-4 tracking-wider">ПОДБОР ЭКСПЕРТА · ЗАПРОС #2847</div>

                {/* Matching rows */}
                {[
                  { name: "Иванов А.С.",  type: "Строительно-техническая", region: "Москва", score: 98, status: "✓ ПОДОБРАН" },
                  { name: "Петрова Е.В.", type: "Строительно-техническая", region: "Москва", score: 91, status: "→ в очереди" },
                  { name: "Сидоров П.Н.", type: "Строительно-техническая", region: "МО",     score: 87, status: "→ в очереди" },
                ].map((e, i) => (
                  <div
                    key={i}
                    className={`mb-3 rounded-lg p-3 ${i === 0 ? "bg-[#0F4C9A]/20 border border-[#0F4C9A]/40" : "bg-white/4"}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-semibold ${i === 0 ? "text-[#6BA3E8]" : "text-white/60"}`}>
                        {e.name}
                      </span>
                      <span className={`text-[10px] font-bold ${i === 0 ? "text-[#6BA3E8]" : "text-white/30"}`}>
                        {e.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-white/35">{e.type} · {e.region}</span>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1 w-14 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${i === 0 ? "bg-[#0F4C9A]" : "bg-white/25"}`}
                            style={{ width: `${e.score}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-mono ${i === 0 ? "text-[#6BA3E8]" : "text-white/40"}`}>
                          {e.score}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="mt-4 pt-4 border-t border-white/8 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] text-white/30 font-mono">Система работает · 3 эксперта уведомлены</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────── */}
      <section className="border-t border-[#D0D0D0] py-10 sm:py-14 px-4 sm:px-6 bg-[#F4F4F4]">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
          {STATS.map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-2xl sm:text-3xl font-bold text-[#002B5C] tabular-nums">{value}</p>
              <p className="text-xs text-[#666666] mt-1 uppercase tracking-wide">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="bg-white border-t border-[#D0D0D0] py-16 sm:py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">

          <div className="text-center mb-10 sm:mb-14">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F4C9A] mb-2">Как работает сервис</p>
            <h2 className="text-xl sm:text-2xl font-bold text-[#111111]">Три шага до результата</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map(({ Icon, step, title, desc }, i) => (
              <div key={step} className="flex flex-col">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-xl bg-[#F4F4F4] border border-[#D0D0D0] flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-[#002B5C]" />
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="hidden md:block flex-1 h-px bg-[#D0D0D0]" />
                  )}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#0F4C9A] mb-1">{step}</div>
                <p className="text-base font-semibold text-[#111111] mb-2">{title}</p>
                <p className="text-sm text-[#666666] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Role CTAs ─────────────────────────────────────────────────── */}
      <section className="border-t border-[#D0D0D0] py-16 sm:py-20 px-4 sm:px-6 bg-[#F4F4F4]">
        <div className="max-w-4xl mx-auto">

          <div className="text-center mb-8 sm:mb-10">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F4C9A] mb-2">Участники платформы</p>
            <h2 className="text-xl sm:text-2xl font-bold text-[#111111]">Выберите свою роль</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">

            <Link href="/customer/new-request">
              <div className="h-full bg-white rounded-2xl border border-[#D0D0D0] p-5 sm:p-6 hover:border-[#0F4C9A] hover:shadow-md transition-all cursor-pointer group">
                <div className="w-10 h-10 rounded-xl bg-[#F4F4F4] border border-[#D0D0D0] flex items-center justify-center mb-4 sm:mb-5">
                  <span className="text-lg">⚖️</span>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#666666] mb-2 group-hover:text-[#0F4C9A] transition-colors">Заказчик</p>
                <p className="text-sm text-[#666666] leading-relaxed mb-4 sm:mb-5">
                  Создайте заказ на судебную экспертизу. Система автоматически подберёт квалифицированного специалиста.
                </p>
                <div className="flex items-center gap-1 text-sm font-semibold text-[#002B5C] group-hover:gap-2 transition-all">
                  Создать заказ <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </Link>

            <Link href="/expert">
              <div className="h-full bg-white rounded-2xl border border-[#D0D0D0] p-5 sm:p-6 hover:border-[#0F4C9A] hover:shadow-md transition-all cursor-pointer group">
                <div className="w-10 h-10 rounded-xl bg-[#F4F4F4] border border-[#D0D0D0] flex items-center justify-center mb-4 sm:mb-5">
                  <span className="text-lg">🛡️</span>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#666666] mb-2 group-hover:text-[#0F4C9A] transition-colors">Эксперт</p>
                <p className="text-sm text-[#666666] leading-relaxed mb-4 sm:mb-5">
                  Принимайте заказы по своей специализации. Управляйте профилем и репутацией на платформе.
                </p>
                <div className="flex items-center gap-1 text-sm font-semibold text-[#002B5C] group-hover:gap-2 transition-all">
                  Личный кабинет <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </Link>

            <Link href="/admin">
              <div className="h-full bg-white rounded-2xl border border-[#D0D0D0] p-5 sm:p-6 hover:border-[#0F4C9A] hover:shadow-md transition-all cursor-pointer group sm:col-span-2 md:col-span-1">
                <div className="w-10 h-10 rounded-xl bg-[#F4F4F4] border border-[#D0D0D0] flex items-center justify-center mb-4 sm:mb-5">
                  <span className="text-lg">📊</span>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#666666] mb-2 group-hover:text-[#0F4C9A] transition-colors">Администратор</p>
                <p className="text-sm text-[#666666] leading-relaxed mb-4 sm:mb-5">
                  Управляйте заказами и экспертным пулом. Полная аналитика платформы в реальном времени.
                </p>
                <div className="flex items-center gap-1 text-sm font-semibold text-[#002B5C] group-hover:gap-2 transition-all">
                  Панель управления <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </Link>

          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section className="bg-white border-t border-[#D0D0D0] py-12 sm:py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
            {FEATURES.map(({ Icon, label, desc }) => (
              <div key={label}>
                <div className="w-9 h-9 rounded-xl bg-[#F4F4F4] border border-[#D0D0D0] flex items-center justify-center mb-3">
                  <Icon className="w-4 h-4 text-[#002B5C]" />
                </div>
                <p className="text-sm font-semibold text-[#111111] mb-1">{label}</p>
                <p className="text-xs text-[#666666] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer bar ───────────────────────────────────────────────── */}
      <div className="border-t border-[#D0D0D0] py-3.5 px-4 sm:px-6 bg-[#002B5C]">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Статус системы</p>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-white/50">Supabase подключён · Система работает штатно</span>
          </div>
        </div>
      </div>

    </div>
  );
}
