// ─── Data ───────────────────────────────────────────────────────────────────

const STATS = [
  { value: "150+",   label: "Экспертов" },
  { value: "74",     label: "Региона" },
  { value: "1 000+", label: "Дел закрыто" },
  { value: "100%",   label: "Верифицированы" },
];

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
    num: "1",
    title: "ДТП, залив, ущерб имуществу",
    desc: "Оценка ущерба, причин повреждений, объёма восстановительных работ.",
  },
  {
    num: "2",
    title: "Спор в суде или до суда",
    desc: "Подбор специалиста под предмет спора, документы и поставленные вопросы.",
  },
  {
    num: "3",
    title: "Проверка экспертного заключения",
    desc: "Анализ методики, исходных данных, логики исследования и выводов.",
  },
  {
    num: "4",
    title: "Строительные дефекты и качество строительства",
    desc: "Проверка качества работ, дефектов, соответствия проекту и нормативам.",
  },
];

const WHY_PLATFORM = [
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
];

const EXPERT_STEPS = [
  {
    n: "1",
    text: "Оформите сертификат Палаты судебных экспертов по своему направлению.",
    link: { href: "https://xn--80aaaio3ae2acfmjkg3n.xn--p1ai/", label: "Перейти на сайт Палаты →" },
  },
  { n: "2", text: "Зарегистрируйтесь на платформе и заполните профиль эксперта." },
  { n: "3", text: "Начните получать интересные заказы для реализации профессиональных навыков." },
];

const MATCHING_STEPS = [
  { n: "1", text: "Заказчик описывает ситуацию своими словами." },
  { n: "2", text: "Система определяет направление исследования и профиль специалиста." },
  { n: "3", text: "Заказчик изучает специалистов и данные в профиле." },
  { n: "4", text: "Заказчик выбирает специалиста и связывается с ним напрямую." },
];

// ─── Shared primitives ───────────────────────────────────────────────────────

const W = "max-w-6xl mx-auto px-4 sm:px-6 lg:px-8";

/** Horizontal card grid that collapses to single-column on mobile */
function CardGrid({ cols = 4, children }: { cols?: 2 | 3 | 4; children: React.ReactNode }) {
  const colCls =
    cols === 2 ? "grid-cols-1 sm:grid-cols-2" :
    cols === 3 ? "grid-cols-1 sm:grid-cols-3" :
                 "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
  return (
    <div className={`grid ${colCls} divide-y sm:divide-y-0 sm:divide-x divide-[#D0D0D0] border border-[#D0D0D0]`}>
      {children}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

import React from "react";

export default function Home() {
  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ════════════════════════════════════════════════════
          PLATFORM — Hero + Stats
      ════════════════════════════════════════════════════ */}
      <section id="platform" className="scroll-mt-[72px]">

        {/* Hero */}
        <div className={`${W} pt-10 pb-10 sm:pt-14 sm:pb-14`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 xl:gap-14 items-center">

            {/* Left text */}
            <div className="order-2 lg:order-1">
              <div className="inline-flex items-center gap-2 border border-[#D0D0D0] text-[#666666] text-xs font-medium px-3 py-1.5 rounded-full mb-6">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Закрытая профессиональная платформа
              </div>

              <h1 className="text-4xl sm:text-5xl xl:text-6xl font-bold text-[#111111] leading-[1.08] tracking-tight mb-4">
                Платформа,<br />
                которая <span className="text-[#0F4C9A]">находит</span><br />
                нужного эксперта
              </h1>

              <p className="text-base sm:text-lg text-[#666666] leading-relaxed max-w-md mb-8">
                Автоматизированный подбор аккредитованных судебных экспертов по специализации, региону и репутации.
              </p>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => scrollTo("customers")}
                  className="px-5 py-2.5 rounded-full bg-[#0F4C9A] text-white text-sm font-semibold hover:bg-[#002B5C] transition-colors"
                >
                  Найти эксперта
                </button>
                <button
                  onClick={() => scrollTo("experts")}
                  className="px-5 py-2.5 rounded-full border border-[#002B5C]/30 text-[#002B5C] text-sm font-medium hover:border-[#002B5C] hover:bg-[#002B5C]/5 transition-colors"
                >
                  Для экспертов
                </button>
              </div>
            </div>

            {/* Right — video */}
            <div className="order-1 lg:order-2">
              <div className="rounded-2xl overflow-hidden shadow-xl border border-[#D0D0D0]" style={{ aspectRatio: "16/9" }}>
                <iframe
                  src="/palata-promo/"
                  className="w-full h-full block"
                  style={{ border: "none" }}
                  allow="autoplay"
                  title="Как работает платформа"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="border-t border-[#D0D0D0] bg-[#F4F4F4]">
          <div className={`${W} py-8 sm:py-10`}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
              {STATS.map(({ value, label }) => (
                <div key={label} className="text-center">
                  <p className="text-2xl sm:text-3xl font-bold text-[#002B5C] tabular-nums">{value}</p>
                  <p className="text-xs text-[#666666] mt-1 uppercase tracking-wide">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </section>

      {/* ════════════════════════════════════════════════════
          CUSTOMERS — Нужен эксперт / Подбор / Ситуации / Почему
      ════════════════════════════════════════════════════ */}
      <section id="customers" className="scroll-mt-[72px]">

        {/* Баннер 1 — Нужен эксперт? */}
        <div className="bg-white border-t border-[#D0D0D0]">
          <div className={`${W} py-14 sm:py-20`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1 h-5 bg-[#C0392B] shrink-0" />
              <p className="text-xs font-semibold text-[#002B5C] uppercase tracking-widest">
                Профессиональная платформа подбора экспертов
              </p>
            </div>

            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-[#111111] leading-[1.05] tracking-tight mb-5">
              Нужен эксперт?
            </h2>

            <p className="text-lg sm:text-xl font-bold text-[#111111] mb-4 leading-snug max-w-2xl">
              Опишите ситуацию — система подберёт подходящего специалиста
            </p>

            <p className="text-sm sm:text-base text-[#555555] leading-relaxed max-w-2xl">
              Не важно, требуется ли независимое исследование, рецензия, заключение специалиста
              или судебная экспертиза. Система помогает определить подходящее направление и
              подобрать специалистов по профилю задачи.
            </p>
          </div>
        </div>

        {/* Баннер 2 — Описание задачи / Критерии */}
        <div className="border-t border-[#D0D0D0]">
          <div className={`${W}`}>
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#D0D0D0]">

              {/* Left — white */}
              <div className="py-10 sm:py-14 lg:pr-10 xl:pr-16 bg-white">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#002B5C] mb-1">
                  ОПИСАНИЕ ЗАДАЧИ
                </p>
                <p className="text-base font-bold text-[#111111] mb-6">
                  Подбор по содержанию обращения
                </p>

                <div className="border border-[#C0C0C0] rounded-lg p-4 mb-2 bg-white min-h-[100px]">
                  <p className="text-sm text-[#888888] leading-relaxed">
                    Опишите обстоятельства, документы, объект исследования и цель обращения.
                    Юридическую квалификацию запроса можно не указывать.
                  </p>
                </div>
                <div className="h-0.5 bg-[#C0392B] mb-8" />

                <p className="text-[10px] font-bold uppercase tracking-widest text-[#002B5C] mb-4">
                  ПРИМЕРЫ ОПИСАНИЯ
                </p>
                <ol className="space-y-3">
                  {EXAMPLES.map((ex, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-sm font-bold text-[#111111] shrink-0">{i + 1}.</span>
                      <p className="text-sm text-[#444444] leading-relaxed">{ex}</p>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Right — dark navy */}
              <div className="py-10 sm:py-14 lg:pl-10 xl:pl-16 bg-[#002B5C]">
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
        </div>

        {/* Баннер 3 — Не знаете какая экспертиза? */}
        <div className="bg-white border-t border-[#D0D0D0]">
          <div className={`${W} py-14 sm:py-20`}>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#111111] leading-[1.1] tracking-tight mb-4">
              Не знаете какая экспертиза нужна?<br />
              Это нормально.
            </h2>
            <p className="text-sm sm:text-base text-[#666666] mb-10">
              Выберите ситуацию. Система поможет подобрать специалиста нужного профиля.
            </p>

            <CardGrid cols={4}>
              {SITUATIONS.map((s) => (
                <div key={s.num} className="p-6 bg-white border-t-2 border-t-[#0F4C9A]">
                  <p className="text-xs font-bold text-[#0F4C9A] mb-3 tracking-wide">{s.num}</p>
                  <p className="text-sm font-bold text-[#111111] leading-snug mb-2">{s.title}</p>
                  <p className="text-xs text-[#666666] leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </CardGrid>
          </div>
        </div>

        {/* Почему заказчики выбирают платформу? */}
        <div className="bg-[#F4F4F4] border-t border-[#D0D0D0]">
          <div className={`${W} py-14 sm:py-20`}>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#111111] leading-[1.1] tracking-tight mb-10">
              Почему заказчики выбирают платформу?
            </h2>

            <CardGrid cols={4}>
              {WHY_PLATFORM.map(({ title, desc }) => (
                <div key={title} className="p-6 bg-white">
                  <div className="w-6 h-0.5 bg-[#C0392B] mb-5" />
                  <p className="text-sm font-bold text-[#111111] leading-snug mb-3">{title}</p>
                  <p className="text-xs text-[#666666] leading-relaxed">{desc}</p>
                </div>
              ))}
            </CardGrid>
          </div>
        </div>

      </section>

      {/* ════════════════════════════════════════════════════
          EXPERTS — Как начать / Как устроен подбор
      ════════════════════════════════════════════════════ */}
      <section id="experts" className="scroll-mt-[72px] bg-[#F4F4F4] border-t border-[#D0D0D0]">
        <div className={`${W} py-14 sm:py-20`}>

          {/* Overline */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-5 bg-[#C0392B] shrink-0" />
            <p className="text-xs font-semibold text-[#002B5C] uppercase tracking-widest">
              Для экспертов
            </p>
          </div>

          <h2 className="text-4xl sm:text-5xl font-black text-[#111111] leading-[1.05] tracking-tight mb-10">
            Как начать работу на платформе?
          </h2>

          <CardGrid cols={3}>
            {EXPERT_STEPS.map(({ n, text, link }) => (
              <div key={n} className="p-6 bg-white">
                <p className="text-xs font-bold text-[#0F4C9A] mb-4 tracking-wide">{n}</p>
                <p className="text-sm font-bold text-[#111111] leading-snug">{text}</p>
                {link && (
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-3 text-xs font-semibold text-[#0F4C9A] hover:text-[#002B5C] underline underline-offset-2 transition-colors"
                  >
                    {link.label}
                  </a>
                )}
              </div>
            ))}
          </CardGrid>

          <h2 className="text-3xl sm:text-4xl font-black text-[#111111] leading-[1.1] tracking-tight mt-14 mb-8">
            Как устроен подбор?
          </h2>

          <CardGrid cols={4}>
            {MATCHING_STEPS.map(({ n, text }) => (
              <div key={n} className="p-6 bg-white">
                <p className="text-xs font-bold text-[#0F4C9A] mb-4 tracking-wide">{n}</p>
                <p className="text-sm font-bold text-[#111111] leading-snug">{text}</p>
              </div>
            ))}
          </CardGrid>

        </div>
      </section>

      {/* ════════════════════════════════════════════════════
          PALATA-ORG
      ════════════════════════════════════════════════════ */}
      <section id="palata-org" className="scroll-mt-[72px] bg-[#002B5C]">
        <div className={`${W} py-14 sm:py-20`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 xl:gap-16 items-start">

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

            <div className="space-y-5 lg:pt-14">
              <p className="text-sm sm:text-base text-white/80 leading-relaxed">
                Палата судебных экспертов занимается сертификацией специалистов и развитием профессионального сообщества экспертов.
              </p>
              <p className="text-sm sm:text-base text-white/80 leading-relaxed">
                Платформа позволяет заказчикам находить специалистов с подтверждённой квалификацией и актуальными документами.
              </p>
              <p className="text-sm sm:text-base text-white/80 leading-relaxed">
                Акцент сделан на прозрачности информации о специалистах: документы, квалификация, сертификаты и профессиональные статусы отображаются в профиле.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="border-t border-white/10 py-4 bg-[#002B5C]">
        <div className={`${W} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2`}>
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
