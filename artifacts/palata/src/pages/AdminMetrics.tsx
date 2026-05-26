import { useEffect, useState } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabaseClient";

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
  byRegion: Array<{ region: string; count: number }>;
  byExpertise: Array<{ expertise: string; count: number }>;
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

      // Requests where ALL matches in any round are declined (and no accepted)
      const byRequest: Record<string, MatchRow[]> = {};
      for (const m of matches) {
        (byRequest[m.request_id] ??= []).push(m);
      }
      const allDeclined = Object.entries(byRequest).filter(([, ms]) =>
        ms.length > 0 && ms.every(m => m.status === "declined" || m.status === "withdrawn")
      ).length;

      const byRegion = groupCount(requests, r => r.region);
      const byExpertise = groupCount(requests, r => r.expertise_type);

      const metrics: Metrics = {
        requests: {
          total: requests.length,
          draft: cnt("draft"),
          pending: cnt("pending"),
          matching: cnt("matching"),
          in_progress: cnt("in_progress"),
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
        byRegion,
        byExpertise,
      };

      setState({ kind: "ok", metrics });
    }

    load();
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <span className="inline-block rounded-full px-3 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 mb-2">
            Администратор
          </span>
          <h1 className="text-2xl font-bold text-slate-800">Метрики заказов</h1>
          <p className="text-sm text-slate-500 mt-1">Данные из Supabase в реальном времени</p>
        </div>
        <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-800 transition-colors">
          ← Все заявки
        </Link>
      </div>

      {state.kind === "loading" && (
        <p className="text-sm text-slate-400 py-8">Загрузка данных…</p>
      )}
      {state.kind === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 max-w-xl">
          <p className="text-sm font-semibold text-red-700 mb-1">Ошибка Supabase</p>
          <p className="text-xs text-red-600">{state.message}</p>
        </div>
      )}

      {state.kind === "ok" && <MetricsBody m={state.metrics} />}
    </div>
  );
}

function MetricsBody({ m }: { m: Metrics }) {
  return (
    <div className="space-y-8">

      {/* Заявки */}
      <Section title="Заявки">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Всего заявок"       value={m.requests.total}       accent="text-slate-800" />
          <Stat label="Черновики"          value={m.requests.draft}        accent="text-slate-500" />
          <Stat label="Идёт подбор"        value={m.requests.pending}      accent="text-yellow-600" />
          <Stat label="Выбор эксперта"     value={m.requests.matching}     accent="text-blue-600" />
          <Stat label="В работе"           value={m.requests.in_progress}  accent="text-indigo-600" />
          <Stat label="Выполнены"          value={m.requests.completed}    accent="text-green-600" />
          <Stat label="Неактуальны"        value={m.requests.cancelled}    accent="text-slate-400" />
          <Stat label="Ошибка подбора"     value={m.requests.failed}       accent="text-red-500" />
          <Stat label="Все эксперты отказали" value={m.requests.all_declined} accent="text-red-600" />
          <Stat label="Отказов экспертов"  value={m.matches.total_declines} accent="text-orange-600" />
        </div>
      </Section>

      {/* Эксперты */}
      <Section title="Эксперты">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Всего экспертов"    value={m.experts.total}          accent="text-slate-800" />
          <Stat label="Активные"           value={m.experts.active}         accent="text-green-600" />
          <Stat label="Реестр Палаты СЭ"   value={m.experts.palata_verified} accent="text-blue-600" />
          <Stat label="Центр судэксперт"   value={m.experts.centr_verified}  accent="text-indigo-600" />
          <Stat
            label="Средний рейтинг (профиль)"
            value={m.experts.avg_rating != null ? `★ ${m.experts.avg_rating}` : "—"}
            accent="text-amber-600"
            raw
          />
          <Stat
            label="Средний рейтинг (оценки)"
            value={m.ratings.avg_expert != null ? `★ ${m.ratings.avg_expert}` : "—"}
            accent="text-amber-500"
            raw
          />
          <Stat
            label="Ср. оценка заказчиков"
            value={m.ratings.avg_customer != null ? `★ ${m.ratings.avg_customer}` : "—"}
            accent="text-teal-600"
            raw
          />
        </div>
      </Section>

      {/* По регионам */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <BreakdownTable
          title="Заявки по регионам"
          rows={m.byRegion}
          total={m.requests.total}
        />
        <BreakdownTable
          title="Заявки по направлениям"
          rows={m.byExpertise}
          total={m.requests.total}
        />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Stat({ label, value, accent, raw }: { label: string; value: number | string; accent: string; raw?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-400 mb-1 leading-tight">{label}</p>
      <p className={`text-2xl font-bold ${accent}`}>
        {raw ? value : typeof value === "number" ? value.toLocaleString("ru-RU") : value}
      </p>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
  total,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
  total: number;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
        <p className="text-xs font-semibold text-slate-600">{title}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-400 text-center">Нет данных</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {rows.map(({ label, count }) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={label} className="px-4 py-2.5 flex items-center gap-3">
                <p className="text-sm text-slate-700 flex-1 truncate">{label}</p>
                <div className="w-20 bg-slate-100 rounded-full h-1.5 shrink-0">
                  <div
                    className="bg-amber-400 h-1.5 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-sm font-semibold text-slate-700 w-5 text-right shrink-0">{count}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
