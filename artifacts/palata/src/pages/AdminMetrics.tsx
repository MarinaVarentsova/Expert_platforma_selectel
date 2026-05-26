import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdminLayout from "@/components/AdminLayout";
import { TrendingUp, Users, Star, XCircle } from "lucide-react";

type RequestRow = {
  id: string;
  status: string;
  region: string;
  expertise_type: string;
};

type ExpertRow = {
  user_id: string;
  status: string;
  palata_registry_verified: boolean;
  centrsudexpert_verified: boolean;
  avg_customer_rating: number | null;
};

type MatchRow = {
  request_id: string;
  expert_id: string;
  status: string;
};

type ConversionMetric = {
  label: string;
  numerator: number;
  denominator: number;
  pct: number;
};

type Metrics = {
  requests: {
    total: number;
    draft: number;
    pending: number;
    matching: number;
    in_progress: number;
    completed: number;
    cancelled: number;
    failed: number;
    all_declined: number;
  };
  experts: {
    total: number;
    active: number;
    palata_verified: number;
    centr_verified: number;
    avg_rating: number | null;
  };
  matches: {
    total_declines: number;
  };
  ratings: {
    avg_expert: number | null;
    avg_customer: number | null;
  };
  conversions: ConversionMetric[];
  byRegion: Array<{ label: string; count: number }>;
  byExpertise: Array<{ label: string; count: number }>;
};

type State =
  | { kind: "loading" }
  | { kind: "ok"; metrics: Metrics }
  | { kind: "error"; message: string };

function avg(nums: (number | null)[]): number | null {
  const valid = nums.filter((n): n is number => n != null);
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100;
}

function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function computeConversions(requests: RequestRow[]): ConversionMetric[] {
  const total = requests.length;
  const inProgress = requests.filter(r => r.status === "in_progress" || r.status === "in_work").length;
  const completed = requests.filter(r => r.status === "completed").length;
  const everWorked = inProgress + completed;

  return [
    {
      label: "Конверсия в работу",
      numerator: everWorked,
      denominator: total,
      pct: pct(everWorked, total),
    },
    {
      label: "Выполнение из взятых в работу",
      numerator: completed,
      denominator: everWorked,
      pct: pct(completed, everWorked),
    },
  ];
}

function groupCount<T>(arr: T[], key: (item: T) => string): Array<{ label: string; count: number }> {
  const map: Record<string, number> = {};
  for (const item of arr) {
    const k = key(item);
    map[k] = (map[k] ?? 0) + 1;
  }
  return Object.entries(map)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export default function AdminMetrics() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    async function load() {
      const [reqRes, expRes, matchRes, expRatRes, custRatRes] = await Promise.all([
        supabase.from("palata_requests").select("id, status, region, expertise_type"),
        supabase.from("palata_expert_profiles").select("user_id, status, palata_registry_verified, centrsudexpert_verified, avg_customer_rating"),
        supabase.from("palata_request_matches").select("request_id, expert_id, status"),
        supabase.from("palata_expert_ratings").select("score"),
        supabase.from("palata_customer_ratings").select("score"),
      ]);

      if (reqRes.error) { setState({ kind: "error", message: reqRes.error.message }); return; }
      if (expRes.error) { setState({ kind: "error", message: expRes.error.message }); return; }

      const requests = (reqRes.data as RequestRow[]) ?? [];
      const experts = (expRes.data as ExpertRow[]) ?? [];
      const matches = (matchRes.data as MatchRow[]) ?? [];
      const expRatings = (expRatRes.data ?? []) as { score: number }[];
      const custRatings = (custRatRes.data ?? []) as { score: number }[];

      const cnt = (status: string) => requests.filter(r => r.status === status).length;

      const byRequest: Record<string, MatchRow[]> = {};
      for (const m of matches) {
        (byRequest[m.request_id] ??= []).push(m);
      }
      const allDeclined = Object.entries(byRequest).filter(([, ms]) =>
        ms.length > 0 && ms.every(m => m.status === "declined" || m.status === "withdrawn")
      ).length;

      const metrics: Metrics = {
        requests: {
          total: requests.length,
          draft: cnt("draft"),
          pending: cnt("pending"),
          matching: cnt("matching"),
          in_progress: cnt("in_progress") + cnt("in_work"),
          completed: cnt("completed"),
          cancelled: cnt("cancelled"),
          failed: cnt("failed"),
          all_declined: allDeclined,
        },
        experts: {
          total: experts.length,
          active: experts.filter(e => e.status === "active").length,
          palata_verified: experts.filter(e => e.palata_registry_verified).length,
          centr_verified: experts.filter(e => e.centrsudexpert_verified).length,
          avg_rating: avg(experts.map(e => e.avg_customer_rating)),
        },
        matches: {
          total_declines: matches.filter(m => m.status === "declined").length,
        },
        ratings: {
          avg_expert: avg(expRatings.map(r => r.score)),
          avg_customer: avg(custRatings.map(r => r.score)),
        },
        conversions: computeConversions(requests),
        byRegion: groupCount(requests, r => r.region),
        byExpertise: groupCount(requests, r => r.expertise_type),
      };

      setState({ kind: "ok", metrics });
    }

    load();
  }, []);

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Метрики платформы</h1>
            <p className="text-xs text-slate-400 mt-0.5">Данные Supabase в реальном времени</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </div>
        </div>

        {state.kind === "loading" && (
          <div className="flex items-center gap-3 py-12 text-sm text-slate-400">
            <div className="h-4 w-4 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
            Загрузка данных…
          </div>
        )}
        {state.kind === "error" && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 max-w-xl">
            <p className="text-sm font-semibold text-red-700 mb-1">Ошибка Supabase</p>
            <p className="text-xs text-red-600 font-mono">{state.message}</p>
          </div>
        )}
        {state.kind === "ok" && <MetricsBody m={state.metrics} />}
      </div>
    </AdminLayout>
  );
}

function MetricsBody({ m }: { m: Metrics }) {
  return (
    <div className="space-y-10">

      {/* ── Requests KPI ─────────────────────────────────────────── */}
      <Section title="Заявки" Icon={TrendingUp} iconColor="text-indigo-500">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Всего" value={m.requests.total} size="lg" colorClass="kpi-indigo" />
          <StatCard label="Идёт подбор" value={m.requests.pending} colorClass="kpi-yellow" />
          <StatCard label="В работе" value={m.requests.in_progress} colorClass="kpi-cyan" />
          <StatCard label="Выполнены" value={m.requests.completed} colorClass="kpi-emerald" />
          <StatCard label="Ошибка подбора" value={m.requests.failed} colorClass="kpi-red" />
          <StatCard label="Черновики" value={m.requests.draft} colorClass="kpi-slate" />
          <StatCard label="Выбор эксперта" value={m.requests.matching} colorClass="kpi-cyan" />
          <StatCard label="Неактуальны" value={m.requests.cancelled} colorClass="kpi-slate" />
          <StatCard label="Все отказали" value={m.requests.all_declined} colorClass="kpi-red" />
          <StatCard label="Отказов экспертов" value={m.matches.total_declines} colorClass="kpi-red" />
        </div>
      </Section>

      {/* ── Experts KPI ──────────────────────────────────────────── */}
      <Section title="Эксперты" Icon={Users} iconColor="text-emerald-500">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Всего экспертов" value={m.experts.total} size="lg" colorClass="kpi-indigo" />
          <StatCard label="Активные" value={m.experts.active} colorClass="kpi-emerald" />
          <StatCard label="Реестр Палаты СЭ" value={m.experts.palata_verified} colorClass="kpi-indigo" />
          <StatCard label="Центр судэксперт" value={m.experts.centr_verified} colorClass="kpi-cyan" />
          <StatCard
            label="Средний рейтинг (профиль)"
            value={m.experts.avg_rating != null ? m.experts.avg_rating : "—"}
            colorClass="kpi-yellow"
            raw
          />
          <StatCard
            label="Рейтинг (оценки экспертов)"
            value={m.ratings.avg_expert != null ? m.ratings.avg_expert : "—"}
            colorClass="kpi-yellow"
            raw
          />
          <StatCard
            label="Оценка заказчиков"
            value={m.ratings.avg_customer != null ? m.ratings.avg_customer : "—"}
            colorClass="kpi-emerald"
            raw
          />
        </div>
      </Section>

      {/* ── Conversions ──────────────────────────────────────────── */}
      <Section title="Воронка и конверсии" Icon={Star} iconColor="text-amber-500">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {m.conversions.map((c) => (
            <ConversionCard key={c.label} metric={c} />
          ))}
        </div>
      </Section>

      {/* ── Breakdown tables ─────────────────────────────────────── */}
      <Section title="Распределение" Icon={XCircle} iconColor="text-slate-400">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <BreakdownTable title="По регионам"     rows={m.byRegion}    total={m.requests.total} />
          <BreakdownTable title="По направлениям" rows={m.byExpertise} total={m.requests.total} />
        </div>
      </Section>

    </div>
  );
}

function Section({
  title, children, Icon, iconColor,
}: {
  title: string;
  children: React.ReactNode;
  Icon: React.ElementType;
  iconColor: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        <div className="flex-1 h-px bg-slate-100 ml-2" />
      </div>
      {children}
    </div>
  );
}

function StatCard({
  label, value, colorClass, size, raw,
}: {
  label: string;
  value: number | string;
  colorClass: string;
  size?: "lg";
  raw?: boolean;
}) {
  return (
    <div className={`kpi-card ${colorClass}`}>
      <p className="text-[11px] text-slate-500 leading-tight mb-2">{label}</p>
      <p className={`font-bold text-slate-900 tabular-nums ${size === "lg" ? "text-3xl" : "text-2xl"}`}>
        {raw ? value : typeof value === "number" ? value.toLocaleString("ru-RU") : value}
      </p>
    </div>
  );
}

function ConversionCard({ metric: c }: { metric: ConversionMetric }) {
  const barColor =
    c.pct >= 66 ? "bg-gradient-to-r from-emerald-400 to-emerald-500" :
    c.pct >= 33 ? "bg-gradient-to-r from-amber-400 to-amber-500" :
    "bg-gradient-to-r from-red-400 to-red-500";
  const textColor =
    c.pct >= 66 ? "text-emerald-600" :
    c.pct >= 33 ? "text-amber-500" :
    "text-red-500";
  const bgColor =
    c.pct >= 66 ? "kpi-emerald" :
    c.pct >= 33 ? "kpi-yellow" :
    "kpi-red";

  return (
    <div className={`kpi-card ${bgColor}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">{c.label}</p>
      <p className={`text-4xl font-bold mb-4 tabular-nums ${textColor}`}>{c.pct}%</p>
      <div className="w-full bg-slate-100 rounded-full h-2 mb-3 overflow-hidden">
        <div
          className={`${barColor} h-2 rounded-full transition-all duration-700`}
          style={{ width: `${c.pct}%` }}
        />
      </div>
      <div className="flex items-baseline gap-1.5 text-sm text-slate-500">
        <span className="font-bold text-slate-800">{c.numerator.toLocaleString("ru-RU")}</span>
        <span className="text-slate-300">/</span>
        <span>{c.denominator.toLocaleString("ru-RU")}</span>
        <span className="text-slate-300 text-xs ml-auto">
          {c.denominator === 0 ? "нет данных" : `${c.numerator} из ${c.denominator}`}
        </span>
      </div>
    </div>
  );
}

function BreakdownTable({
  title, rows, total,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
  total: number;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-700">{title}</p>
        <p className="text-xs text-slate-400">{rows.length} позиций</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-300 text-center">Нет данных</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {rows.slice(0, 10).map(({ label, count }) => {
            const share = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={label} className="px-5 py-2.5 flex items-center gap-3 hover:bg-slate-50/50 transition-colors">
                <p className="text-sm text-slate-700 flex-1 truncate">{label}</p>
                <div className="w-24 bg-slate-100 rounded-full h-1.5 shrink-0 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-indigo-400 to-indigo-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${share}%` }}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <p className="text-sm font-semibold text-slate-700 w-5 text-right">{count}</p>
                  <p className="text-xs text-slate-300 w-8">{share}%</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
