import { FileText, Search, UserCheck } from "lucide-react";

// ─── Platform section data ─────────────────────────────────────────────────

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

// ─── For-customers section data ────────────────────────────────────────────

const CRITERIA = [
  "направление исследования и специализация;",
  "подтверждённая квалификация специалиста;",
  "наличие сертификатов Палаты судебных экспертов;",
  "статус СРО ЦСЭ, если специалист является членом СРО;",
  "сведения и документы в профиле эксперта.",
];

const EXAMPLES = [
  "В новом доме, в который только что заселились, появилась трещина в стене от пола до потолка. Нужно понять причину и выбрать специалиста.",
  "После ДТП нужно оценить повреждения автомобиля и понять, какой специалист подойдёт для расчёта ущерба и проверки документов.",
];

const SITUATIONS = [
  {
    num: "01",
    title: "ДТП, залив, ущерб имуществу",
    desc: "Оценка ущерба, причин повреждений, объёма восстановительных работ.",
  },
  {
    num: "02",
    title: "Спор в суде или до суда",
    desc: "Подбор специалиста под предмет спора, документы и поставленные вопросы.",
  },
  {
    num: "03",
    title: "Проверка экспертного заключения",
    desc: "Анализ методики, исходных данных, логики исследования и выводов.",
  },
  {
    num: "04",
    title: "Строительные дефекты и качество строительства",
    desc: "Проверка качества работ, дефектов, соответствия проекту и нормативам.",
  },
];

// ─── For-experts section data ──────────────────────────────────────────────

const EXPERT_BENEFITS = [
  {
    num: "01",
    title: "Заказы по вашей специализации",
    desc: "Платформа автоматически присылает заявки, которые соответствуют вашим направлениям и регионам работы.",
  },
  {
    num: "02",
    title: "Верифицированный профиль",
    desc: "Профиль с реестровым номером Палаты или ЦСЭ — сигнал доверия для заказчика.",
  },
  {
    num: "03",
    title: "Управление репутацией",
    desc: "Рейтинг, отзывы и завершённые дела формируют вашу репутацию на платформе.",
  },
  {
    num: "04",
    title: "Удобный личный кабинет",
    desc: "Все заявки, контакты с заказчиками и статусы дел — в одном месте.",
  },
];

// ─── Component ─────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ══════════════════════════════════════════════════════════════
          PLATFORM SECTION — keep as is
      ══════════════════════════════════════════════════════════════ */}
      <section id="platform" className="scroll-mt-[72px]">

        {/* Hero */}
        <div className="px-4 sm:px-6 pt-12 sm:pt-16 pb-0 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 items-center">

            <div className="pb-8 lg:pb-16">
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

              <p className="text-base sm:text-lg text-[#666666] leading-relaxed max-w-md">
                Автоматизированный подбор аккредитованных судебных экспертов по специализации, региону и репутации.
              </p>
            </div>

            <div className="mb-8 lg:mb-0">
              <div className="bg-[#111111] rounded-2xl overflow-hidden shadow-2xl" style={{ aspectRatio: "4/3" }}>
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/8">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#666666]/70" />
                  <span className="ml-3 text-[10px] font-mono text-white/25 tracking-widest uppercase">// PALATA MATCHING ENGINE</span>
                </div>
                <div className="p-4 sm:p-6 font-mono">
                  <div className="text-[11px] text-white/40 mb-4 tracking-wider">ПОДБОР ЭКСПЕРТА · ЗАПРОС #2847</div>
                  {[
                    { name: "Иванов А.С.",  type: "Строительно-техническая", region: "Москва", score: 98, status: "✓ ПОДОБРАН" },
                    { name: "Петрова Е.В.", type: "Строительно-техническая", region: "Москва", score: 91, status: "→ в очереди" },
                    { name: "Сидоров П.Н.", type: "Строительно-техническая", region: "МО",     score: 87, status: "→ в очереди" },
                  ].map((e, i) => (
                    <div key={i} className={`mb-3 rounded-lg p-3 ${i === 0 ? "bg-[#0F4C9A]/20 border border-[#0F4C9A]/40" : "bg-white/4"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-semibold ${i === 0 ? "text-[#6BA3E8]" : "text-white/60"}`}>{e.name}</span>
                        <span className={`text-[10px] font-bold ${i === 0 ? "text-[#6BA3E8]" : "text-white/30"}`}>{e.status}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-white/35">{e.type} · {e.region}</span>
                        <div className="flex items-center gap-1.5">
                          <div className="h-1 w-14 rounded-full bg-white/10 overflow-hidden">
                            <div className={`h-full rounded-full ${i === 0 ? "bg-[#0F4C9A]" : "bg-white/25"}`} style={{ width: `${e.score}%` }} />
                          </div>
                          <span className={`text-[10px] font-mono ${i === 0 ? "text-[#6BA3E8]" : "text-white/40"}`}>{e.score}</span>
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
        </div>

        {/* Stats */}
        <div className="border-t border-[#D0D0D0] py-10 sm:py-14 px-4 sm:px-6 bg-[#F4F4F4]">
          <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
            {STATS.map(({ value, label }) => (
              <div key={label} className="text-center">
                <p className="text-2xl sm:text-3xl font-bold text-[#002B5C] tabular-nums">{value}</p>
                <p className="text-xs text-[#666666] mt-1 uppercase tracking-wide">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div className="bg-white border-t border-[#D0D0D0] py-16 sm:py-20 px-4 sm:px-6">
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
                    {i < STEPS.length - 1 && <div className="hidden md:block flex-1 h-px bg-[#D0D0D0]" />}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#0F4C9A] mb-1">{step}</div>
                  <p className="text-base font-semibold text-[#111111] mb-2">{title}</p>
                  <p className="text-sm text-[#666666] leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Promo video */}
        <div className="border-t border-[#D0D0D0] bg-[#F4F4F4]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
            <div className="text-center mb-8">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F4C9A] mb-2">Платформа в действии</p>
              <h2 className="text-xl sm:text-2xl font-bold text-[#111111]">Как работает подбор эксперта</h2>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-xl border border-[#D0D0D0]" style={{ aspectRatio: "16/9" }}>
              <iframe
                src="/palata-promo/"
                className="w-full h-full"
                style={{ border: "none" }}
                allow="autoplay"
                title="Как работает платформа"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          CUSTOMERS SECTION — Баннер 1 + 2 + 3
      ══════════════════════════════════════════════════════════════ */}
      <section id="customers" className="scroll-mt-[72px]">

        {/* ── Баннер 1: Нужен эксперт? ── */}
        <div className="bg-white border-t border-[#D0D0D0] px-4 sm:px-8 lg:px-16 py-16 sm:py-20">
          <div className="max-w-5xl mx-auto">
            {/* Overline */}
            <div className="flex items-center gap-0 mb-6">
              <div className="w-1 h-5 bg-[#C0392B] mr-3" />
              <p className="text-xs font-semibold text-[#002B5C] uppercase tracking-widest">
                Профессиональная платформа подбора экспертов
              </p>
            </div>

            <h2 className="text-5xl sm:text-6xl lg:text-7xl font-black text-[#111111] leading-[1.05] tracking-tight mb-5">
              Нужен эксперт?
            </h2>

            <p className="text-xl sm:text-2xl font-bold text-[#111111] mb-5 leading-snug max-w-2xl">
              Опишите ситуацию — система подберёт<br className="hidden sm:block" />
              подходящего специалиста
            </p>

            <p className="text-base text-[#555555] leading-relaxed max-w-2xl">
              Не важно, требуется ли независимое исследование, рецензия, заключение специалиста
              или судебная экспертиза. Система помогает определить подходящее направление и
              подобрать специалистов по профилю задачи.
            </p>
          </div>
        </div>

        {/* ── Баннер 2: Описание задачи ── */}
        <div className="border-t border-[#D0D0D0]">
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2">

            {/* Left — white */}
            <div className="px-8 sm:px-12 py-12 sm:py-16 bg-white border-r border-[#D0D0D0]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#002B5C] mb-1">
                ОПИСАНИЕ ЗАДАЧИ
              </p>
              <p className="text-base font-bold text-[#111111] mb-6">
                Подбор по содержанию обращения
              </p>

              {/* Mock text area */}
              <div className="border border-[#C0C0C0] rounded p-4 mb-2 bg-white min-h-[120px]">
                <p className="text-sm text-[#888888] leading-relaxed">
                  Опишите обстоятельства, документы, объект
                  исследования и цель обращения. Юридическую
                  квалификацию запроса можно не указывать.
                </p>
              </div>
              <div className="h-0.5 bg-[#C0392B] mb-8" />

              <p className="text-[10px] font-bold uppercase tracking-widest text-[#002B5C] mb-4">
                ПРИМЕРЫ ОПИСАНИЯ
              </p>
              <ol className="space-y-4">
                {EXAMPLES.map((ex, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-sm font-bold text-[#111111] shrink-0">{i + 1}.</span>
                    <p className="text-sm text-[#444444] leading-relaxed">{ex}</p>
                  </li>
                ))}
              </ol>
            </div>

            {/* Right — dark navy */}
            <div className="px-8 sm:px-12 py-12 sm:py-16 bg-[#002B5C]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-6">
                ЧТО УЧИТЫВАЕТСЯ ПРИ ПОДБОРЕ
              </p>
              <ul className="space-y-4">
                {CRITERIA.map((item, i) => (
                  <li key={i} className="flex gap-3 items-start">
                    <span className="mt-1.5 shrink-0 w-2 h-2 bg-[#C0392B] rounded-sm" />
                    <p className="text-sm text-white/90 leading-relaxed">{item}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ── Баннер 3: Не знаете какая экспертиза нужна? ── */}
        <div className="bg-white border-t border-[#D0D0D0] px-4 sm:px-8 lg:px-16 py-16 sm:py-20">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#111111] leading-[1.1] tracking-tight mb-4">
              Не знаете какая экспертиза нужна?<br />
              Это нормально.
            </h2>
            <p className="text-base text-[#666666] mb-10">
              Выберите ситуацию. Система поможет подобрать специалиста нужного профиля.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 border border-[#D0D0D0]">
              {SITUATIONS.map((s, i) => (
                <div
                  key={s.num}
                  className={`p-6 bg-white border-t-2 border-t-[#0F4C9A] ${i < SITUATIONS.length - 1 ? "border-r border-r-[#D0D0D0]" : ""}`}
                >
                  <p className="text-xs font-bold text-[#0F4C9A] mb-3 tracking-wide">{s.num}</p>
                  <p className="text-sm font-bold text-[#111111] leading-snug mb-3">{s.title}</p>
                  <p className="text-xs text-[#666666] leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Почему заказчики выбирают платформу ── */}
        <div className="bg-[#F4F4F4] border-t border-[#D0D0D0] px-4 sm:px-8 lg:px-16 py-16 sm:py-20">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#111111] leading-[1.1] tracking-tight mb-10">
              Почему заказчики выбирают платформу
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 border border-[#D0D0D0]">
              {[
                {
                  title: "Проверка документов",
                  desc: "Перед размещением специалисты проходят проверку документов и квалификации.",
                },
                {
                  title: "Сертификация",
                  desc: "На платформе представлены специалисты, имеющие сертификаты Палаты судебных экспертов.",
                },
                {
                  title: "СРО ЦСЭ",
                  desc: "Для членов СРО ЦСЭ статус отображается в профиле специалиста.",
                },
                {
                  title: "Прямой контакт",
                  desc: "После подбора заказчик взаимодействует со специалистом напрямую.",
                },
              ].map(({ title, desc }, i, arr) => (
                <div key={title} className={`p-6 bg-white ${i < arr.length - 1 ? "border-r border-r-[#D0D0D0]" : ""}`}>
                  <div className="w-6 h-0.5 bg-[#C0392B] mb-5" />
                  <p className="text-sm font-bold text-[#111111] leading-snug mb-3">{title}</p>
                  <p className="text-xs text-[#666666] leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          EXPERTS SECTION
      ══════════════════════════════════════════════════════════════ */}
      <section id="experts" className="scroll-mt-[72px] bg-[#F4F4F4] border-t border-[#D0D0D0]">
        <div className="px-4 sm:px-8 lg:px-16 py-16 sm:py-20 max-w-5xl mx-auto">
          {/* Overline */}
          <div className="flex items-center gap-0 mb-6">
            <div className="w-1 h-5 bg-[#C0392B] mr-3" />
            <p className="text-xs font-semibold text-[#002B5C] uppercase tracking-widest">
              Для экспертов
            </p>
          </div>

          <h2 className="text-4xl sm:text-5xl font-black text-[#111111] leading-[1.05] tracking-tight mb-4">
            Работайте на платформе
          </h2>
          <p className="text-base text-[#666666] mb-12 max-w-2xl">
            Получайте заявки по своей специализации, управляйте репутацией и развивайте практику
            вместе с профессиональным сообществом.
          </p>

          {/* Benefits cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 border border-[#D0D0D0] mb-12">
            {EXPERT_BENEFITS.map((b, i) => (
              <div
                key={b.num}
                className={`p-6 bg-white border-t-2 border-t-[#002B5C] ${i < EXPERT_BENEFITS.length - 1 ? "border-r border-r-[#D0D0D0]" : ""}`}
              >
                <p className="text-xs font-bold text-[#002B5C] mb-3 tracking-wide">{b.num}</p>
                <p className="text-sm font-bold text-[#111111] leading-snug mb-3">{b.title}</p>
                <p className="text-xs text-[#666666] leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>

          {/* How to start — tezises */}
          <h2 className="text-3xl sm:text-4xl font-black text-[#111111] leading-[1.1] tracking-tight mb-8">
            Как начать работу
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 border border-[#D0D0D0] mb-16">
            <div className="p-6 bg-white border-r border-[#D0D0D0]">
              <p className="text-xs font-bold text-[#0F4C9A] mb-4 tracking-wide">1</p>
              <p className="text-sm font-bold text-[#111111] leading-snug">
                Оформите сертификат Палаты судебных экспертов по своему направлению.
              </p>
              <a
                href="https://xn--80aaaio3ae2acfmjkg3n.xn--p1ai/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-xs font-semibold text-[#0F4C9A] hover:text-[#002B5C] underline underline-offset-2 transition-colors"
              >
                Перейти на сайт Палаты →
              </a>
            </div>
            <div className="p-6 bg-white border-r border-[#D0D0D0]">
              <p className="text-xs font-bold text-[#0F4C9A] mb-4 tracking-wide">2</p>
              <p className="text-sm font-bold text-[#111111] leading-snug">
                Зарегистрируйтесь на платформе и заполните профиль эксперта.
              </p>
            </div>
            <div className="p-6 bg-white">
              <p className="text-xs font-bold text-[#0F4C9A] mb-4 tracking-wide">3</p>
              <p className="text-sm font-bold text-[#111111] leading-snug">
                Начните получать интересные заказы для реализации профессиональных навыков.
              </p>
            </div>
          </div>

          {/* How matching works */}
          <h2 className="text-3xl sm:text-4xl font-black text-[#111111] leading-[1.1] tracking-tight mb-8">
            Как устроен подбор
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 border border-[#D0D0D0]">
            {[
              { n: "1", text: "Заказчик описывает ситуацию своими словами." },
              { n: "2", text: "Система определяет направление исследования и профиль специалиста." },
              { n: "3", text: "Заказчик изучает специалистов и данные в профиле." },
              { n: "4", text: "Заказчик выбирает специалиста и связывается с ним напрямую." },
            ].map(({ n, text }, i, arr) => (
              <div key={n} className={`p-6 bg-white ${i < arr.length - 1 ? "border-r border-r-[#D0D0D0]" : ""}`}>
                <p className="text-xs font-bold text-[#0F4C9A] mb-4 tracking-wide">{n}</p>
                <p className="text-sm font-bold text-[#111111] leading-snug">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          PALATA-ORG SECTION
      ══════════════════════════════════════════════════════════════ */}
      <section id="palata-org" className="scroll-mt-[72px] bg-[#002B5C]">
        <div className="px-4 sm:px-8 lg:px-16 py-16 sm:py-20 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">

            {/* Left */}
            <div>
              <a
                href="https://xn--80aaaio3ae2acfmjkg3n.xn--p1ai/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mb-6 cursor-pointer group"
              >
                <div className="w-1 h-5 bg-[#C0392B]" />
                <span className="text-xs font-semibold text-white/70 uppercase tracking-widest group-hover:text-white transition-colors">
                  Профессиональное сообщество
                </span>
              </a>
              <h2 className="text-4xl sm:text-5xl font-black text-white leading-[1.05] tracking-tight">
                Палата<br />судебных<br />экспертов<br />с 2014 года
              </h2>
            </div>

            {/* Right */}
            <div className="space-y-5 lg:pt-14">
              <p className="text-sm text-white/80 leading-relaxed">
                Палата судебных экспертов занимается сертификацией специалистов и развитием профессионального сообщества экспертов.
              </p>
              <p className="text-sm text-white/80 leading-relaxed">
                Платформа позволяет заказчикам находить специалистов с подтверждённой квалификацией и актуальными документами.
              </p>
              <p className="text-sm text-white/80 leading-relaxed">
                Акцент сделан на прозрачности информации о специалистах: документы, квалификация, сертификаты и профессиональные статусы отображаются в профиле.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <div className="border-t border-white/10 py-4 px-4 sm:px-6 bg-[#002B5C]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
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
