import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdminLayout from "@/components/AdminLayout";
import { useRequireRole } from "@/lib/useRequireRole";

// ─── Status maps (single source of truth) ─────────────────────────────────────

const S_NEW      = new Set(["new", "draft"]);
const S_MATCH    = new Set(["pending", "matching"]);
const S_SEL      = new Set(["expert_selection"]);
const S_WORK     = new Set(["in_progress", "in_work"]);
const S_DONE     = new Set(["completed"]);
const S_CANCEL   = new Set(["cancelled"]);
const S_FAIL     = new Set(["failed"]);
const S_INACTIVE = new Set(["cancelled", "failed", "declined"]);

const LABEL_MAP: Record<string, string> = {
  avtotechnicheskaya:          "Автотехническая",
  zemleustroitelnaya:          "Землеустроительная",
  pocherkovedcheskaya:         "Почерковедческая",
  "finansovo-ekonomicheskaya": "Финансово-экономическая",
  "kompyuterno-tehnicheskaya": "Компьютерно-техническая",
  "stroitelno-tehnicheskaya":  "Строительно-техническая",
  "pozharno-tehnicheskaya":    "Пожарно-техническая",
  tovaroved:                   "Товароведческая",
  psihologicheskaya:           "Психологическая",
  lingvisticheskaya:           "Лингвистическая",
  Moskva:                      "Москва",
  "Sankt-Peterburg":           "Санкт-Петербург",
  Krasnodar:                   "Краснодар",
  "Nizhny Novgorod":           "Нижний Новгород",
  Ekaterinburg:                "Екатеринбург",
  Kazan:                       "Казань",
  "Rostov-na-Donu":            "Ростов-на-Дону",
  Novosibirsk:                 "Новосибирск",
  Samara:                      "Самара",
  Voronezh:                    "Воронеж",
};
function humanLabel(s: string) { return LABEL_MAP[s] ?? s; }

// ─── Raw data types ────────────────────────────────────────────────────────────

type ReqRow = {
  id: string;
  status: string;
  region: string;
  expertise_type: string;
  created_at: string;
  updated_at: string;
  customer_id: string | null;
};

type ExpertRow = {
  user_id: string;
  palata_registry_verified: boolean;
  centrsudexpert_verified: boolean;
  regions: string[];
  specializations: string[];
};

type MatchRow = { request_id: string; expert_id: string; status: string };
type EventRow = { entity_id: string; entity_type: string; new_status: string; created_at: string };

// ─── Computed metrics ─────────────────────────────────────────────────────────

type Distribution = Array<{ label: string; count: number }>;

type Metrics = {
  // Zone 1
  total: number;
  completed: number;
  completedPct: number;
  avgCompletionDays: number | null;

  // Zone 2 — reference panel
  avgRatingExpert: number | null;
  avgRatingCustomer: number | null;
  totalCustomers: number;
  activeCustomers: number;
  activeCustomersPct: number;
  totalExperts: number;
  activeExperts: number;
  activeExpertsPct: number;
  palataVerified: number;
  centrVerified: number;

  // Zone 3 — track 1
  statusNew: number;
  statusMatching: number;
  statusSelection: number;
  statusInWork: number;
  statusDone: number;
  statusCancelled: number;
  statusFailed: number;

  // Zone 3 — track 2
  noExpert: number;
  allDeclined: number;
  cancelled: number;

  // Zone 4
  reqByRegion: Distribution;
  reqBySpec: Distribution;
  expertByRegion: Distribution;
  expertBySpec: Distribution;
};

// ─── Compute function (one place, all metrics) ─────────────────────────────────

function computeMetrics(
  requests: ReqRow[],
  experts: ExpertRow[],
  matches: MatchRow[],
  expRatings: { score: number }[],
  custRatings: { score: number }[],
  customerProfiles: { user_id: string }[],
  statusEvents: EventRow[],
): Metrics {
  const total = requests.length;

  function cnt(set: Set<string>) { return requests.filter(r => set.has(r.status)).length; }
  function avgScore(arr: { score: number }[]) {
    if (!arr.length) return null;
    return Math.round((arr.reduce((a, b) => a + b.score, 0) / arr.length) * 100) / 100;
  }

  // Zone 1: average completion time
  const completedReqIds = new Set(requests.filter(r => r.status === "completed").map(r => r.id));
  const reqById = Object.fromEntries(requests.map(r => [r.id, r]));
  const completionEventsMap: Record<string, string> = {};
  for (const e of statusEvents) {
    if (e.entity_type === "request" && e.new_status === "completed" && completedReqIds.has(e.entity_id)) {
      // keep earliest completion event
      if (!completionEventsMap[e.entity_id] || e.created_at < completionEventsMap[e.entity_id]) {
        completionEventsMap[e.entity_id] = e.created_at;
      }
    }
  }
  const completionDays: number[] = [];
  for (const id of completedReqIds) {
    const req = reqById[id];
    if (!req) continue;
    const endStr = completionEventsMap[id] ?? req.updated_at;
    const days = (new Date(endStr).getTime() - new Date(req.created_at).getTime()) / 86_400_000;
    if (days >= 0) completionDays.push(days);
  }
  const avgCompletionDays = completionDays.length
    ? Math.round((completionDays.reduce((a, b) => a + b, 0) / completionDays.length) * 10) / 10
    : null;

  // Zone 2: active customers = distinct customer_ids in non-inactive requests
  const activeCustomerIds = new Set(
    requests.filter(r => !S_INACTIVE.has(r.status) && r.customer_id).map(r => r.customer_id!)
  );
  const totalCustomers = customerProfiles.length;
  const activeCustomers = activeCustomerIds.size;

  // Zone 2: active experts = distinct expert_ids in accepted_work matches
  const activeExpertIds = new Set(
    matches.filter(m => m.status === "accepted_work").map(m => m.expert_id)
  );
  const totalExperts = experts.length;
  const activeExperts = activeExpertIds.size;

  // Zone 3 track 2: requests where ALL matches are declined/withdrawn
  const byReqId: Record<string, MatchRow[]> = {};
  for (const m of matches) (byReqId[m.request_id] ??= []).push(m);
  const allDeclined = Object.values(byReqId).filter(ms =>
    ms.length > 0 && ms.every(m => m.status === "declined" || m.status === "withdrawn")
  ).length;

  // Zone 4: distribution helpers
  function groupCount(arr: string[]): Distribution {
    const map: Record<string, number> = {};
    for (const k of arr) map[k] = (map[k] ?? 0) + 1;
    return Object.entries(map).map(([label, count]) => ({ label: humanLabel(label), count }))
      .sort((a, b) => b.count - a.count);
  }

  const completed = cnt(S_DONE);

  return {
    // Zone 1
    total,
    completed,
    completedPct: total ? Math.round((completed / total) * 100) : 0,
    avgCompletionDays,

    // Zone 2
    avgRatingExpert: avgScore(expRatings),
    avgRatingCustomer: avgScore(custRatings),
    totalCustomers,
    activeCustomers,
    activeCustomersPct: totalCustomers ? Math.round((activeCustomers / totalCustomers) * 100) : 0,
    totalExperts,
    activeExperts,
    activeExpertsPct: totalExperts ? Math.round((activeExperts / totalExperts) * 100) : 0,
    palataVerified: experts.filter(e => e.palata_registry_verified).length,
    centrVerified: experts.filter(e => e.centrsudexpert_verified).length,

    // Zone 3 track 1
    statusNew: cnt(S_NEW),
    statusMatching: cnt(S_MATCH),
    statusSelection: cnt(S_SEL),
    statusInWork: cnt(S_WORK),
    statusDone: completed,
    statusCancelled: cnt(S_CANCEL),
    statusFailed: cnt(S_FAIL),

    // Zone 3 track 2
    noExpert: cnt(S_FAIL),
    allDeclined,
    cancelled: cnt(S_CANCEL),

    // Zone 4
    reqByRegion: groupCount(requests.map(r => r.region).filter(Boolean)),
    reqBySpec: groupCount(requests.map(r => r.expertise_type).filter(Boolean)),
    expertByRegion: groupCount(experts.flatMap(e => e.regions ?? [])),
    expertBySpec: groupCount(experts.flatMap(e => e.specializations ?? [])),
  };
}

// ─── State ────────────────────────────────────────────────────────────────────

type PageState =
  | { kind: "loading" }
  | { kind: "ok"; m: Metrics }
  | { kind: "error"; message: string };

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminMetrics() {
  const guard = useRequireRole("admin");
  const [state, setState] = useState<PageState>({ kind: "loading" });

  useEffect(() => {
    if (guard.status !== "ok") return;

    async function load() {
      const [reqRes, expRes, matchRes, expRatRes, custRatRes, custProfRes, eventsRes] =
        await Promise.all([
          supabase.from("palata_requests")
            .select("id, status, region, expertise_type, created_at, updated_at, customer_id"),
          supabase.from("palata_expert_profiles")
            .select("user_id, palata_registry_verified, centrsudexpert_verified, regions, specializations"),
          supabase.from("palata_request_matches")
            .select("request_id, expert_id, status"),
          supabase.from("palata_expert_ratings").select("score"),
          supabase.from("palata_customer_ratings").select("score"),
          supabase.from("palata_customer_profiles").select("user_id"),
          supabase.from("palata_status_events")
            .select("entity_id, entity_type, new_status, created_at")
            .eq("entity_type", "request")
            .eq("new_status", "completed"),
        ]);

      if (reqRes.error) { setState({ kind: "error", message: reqRes.error.message }); return; }

      setState({
        kind: "ok",
        m: computeMetrics(
          (reqRes.data ?? []) as ReqRow[],
          (expRes.data ?? []) as ExpertRow[],
          (matchRes.data ?? []) as MatchRow[],
          (expRatRes.data ?? []) as { score: number }[],
          (custRatRes.data ?? []) as { score: number }[],
          (custProfRes.data ?? []) as { user_id: string }[],
          (eventsRes.data ?? []) as EventRow[],
        ),
      });
    }

    load();
  }, [guard.status]);

  if (guard.status === "loading" || guard.status === "redirecting") {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="h-5 w-5 rounded-full border-2 border-[#e8891a]/30 border-t-[#e8891a] animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="px-6 py-8 max-w-[1400px] mx-auto">

        {/* Header */}
        <div className="mb-7 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#2e2a27]">Метрики платформы</h1>
            <p className="text-xs text-[#a8a29e] mt-0.5">Единый источник данных · Supabase · Real-time</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </div>
        </div>

        {state.kind === "loading" && (
          <div className="flex items-center gap-3 py-16 text-sm text-[#a8a29e]">
            <div className="h-4 w-4 rounded-full border-2 border-[#e8891a]/30 border-t-[#e8891a] animate-spin" />
            Загрузка данных…
          </div>
        )}
        {state.kind === "error" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 max-w-xl">
            <p className="text-sm font-semibold text-red-700 mb-1">Ошибка загрузки</p>
            <p className="text-xs text-red-600 font-mono">{state.message}</p>
          </div>
        )}
        {state.kind === "ok" && <MetricsBody m={state.m} />}
      </div>
    </AdminLayout>
  );
}

// ─── MetricsBody ──────────────────────────────────────────────────────────────

function MetricsBody({ m }: { m: Metrics }) {
  const [distMode, setDistMode] = useState<"requests" | "experts">("requests");

  return (
    <div className="space-y-8">

      {/* ══ ZONE 1: Top KPI row ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <TopKpi
          label="Всего заявок"
          value={m.total}
          accent="#e8891a"
          sub="palata_requests · всего"
        />
        <TopKpi
          label="Выполнено"
          value={m.completed}
          accent="#059669"
          sub={`status = completed`}
        />
        <TopKpi
          label="% выполнения"
          value={`${m.completedPct}%`}
          accent={m.completedPct >= 50 ? "#059669" : m.completedPct >= 25 ? "#d97706" : "#dc2626"}
          sub="completed / total"
          raw
        />
        <TopKpi
          label="Среднее время (дни)"
          value={m.avgCompletionDays != null ? m.avgCompletionDays : "—"}
          accent="#0891b2"
          sub="от создания до completed"
          raw
        />
      </div>

      {/* ══ Main area + Right panel ══════════════════════════════════════════ */}
      <div className="flex gap-6 items-start">

        {/* Left: Zones 3 + 4 */}
        <div className="flex-1 min-w-0 space-y-8">

          {/* ── ZONE 3: Заявки ──────────────────────────────────────── */}
          <Section label="Заявки">

            {/* Track 1 — основная раскладка */}
            <div className="mb-6">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e] mb-3">
                Раскладка по статусам
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                <FunnelBox label="Всего" count={m.total} total={m.total} accent="#78716c" first />
                <Arrow />
                <FunnelBox label="Новые" count={m.statusNew} total={m.total} accent="#78716c" />
                <Arrow />
                <FunnelBox label="Подбор" count={m.statusMatching} total={m.total} accent="#d97706" />
                <Arrow />
                <FunnelBox label="Выбор эксперта" count={m.statusSelection} total={m.total} accent="#0891b2" />
                <Arrow />
                <FunnelBox label="В работе" count={m.statusInWork} total={m.total} accent="#4f46e5" />
                <Arrow />
                <FunnelBox label="Выполнено" count={m.statusDone} total={m.total} accent="#059669" />
                <Arrow />
                <FunnelBox label="Неактуальные" count={m.statusCancelled} total={m.total} accent="#a8a29e" />
              </div>
            </div>

            {/* Track 2 — проблемная воронка */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e] mb-3">
                Проблемные заявки
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                <FunnelBox label="Всего" count={m.total} total={m.total} accent="#78716c" first />
                <Arrow />
                <FunnelBox label="Не нашли эксперта" count={m.noExpert} total={m.total} accent="#dc2626" />
                <Arrow />
                <FunnelBox label="Все эксперты отказали" count={m.allDeclined} total={m.total} accent="#dc2626" />
                <Arrow />
                <FunnelBox label="Неактуальные" count={m.cancelled} total={m.total} accent="#a8a29e" />
              </div>
            </div>
          </Section>

          {/* ── ZONE 4: Распределения ───────────────────────────────── */}
          <Section label="Распределение">
            {/* Mode toggle */}
            <div className="flex gap-1 mb-5 p-1 bg-[#f2ece2] rounded-xl w-fit">
              <ModeButton active={distMode === "requests"} onClick={() => setDistMode("requests")}>
                Заказы
              </ModeButton>
              <ModeButton active={distMode === "experts"} onClick={() => setDistMode("experts")}>
                Эксперты
              </ModeButton>
            </div>

            {distMode === "requests" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <DistTable
                  title="По регионам"
                  rows={m.reqByRegion}
                  total={m.total}
                  subtitle="palata_requests.region"
                />
                <DistTable
                  title="По направлениям"
                  rows={m.reqBySpec}
                  total={m.total}
                  subtitle="palata_requests.expertise_type"
                />
              </div>
            )}

            {distMode === "experts" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <DistTable
                  title="По регионам"
                  rows={m.expertByRegion}
                  total={m.expertByRegion.reduce((s, r) => s + r.count, 0)}
                  subtitle="palata_expert_profiles.regions[]"
                />
                <DistTable
                  title="По направлениям"
                  rows={m.expertBySpec}
                  total={m.expertBySpec.reduce((s, r) => s + r.count, 0)}
                  subtitle="palata_expert_profiles.specializations[]"
                />
              </div>
            )}
          </Section>
        </div>

        {/* ══ ZONE 2: Right reference panel ══════════════════════════════════ */}
        <div className="w-64 shrink-0 space-y-3">

          <p className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e] px-1">
            Справочные метрики
          </p>

          <RefCard label="Ср. рейтинг эксперта" accent="#d97706">
            <RatingDisplay value={m.avgRatingExpert} />
            <p className="text-[10px] text-[#a8a29e] mt-0.5">palata_expert_ratings · AVG(score)</p>
          </RefCard>

          <RefCard label="Ср. рейтинг заказчика" accent="#d97706">
            <RatingDisplay value={m.avgRatingCustomer} />
            <p className="text-[10px] text-[#a8a29e] mt-0.5">palata_customer_ratings · AVG(score)</p>
          </RefCard>

          <div className="h-px bg-[#e5dfd7] mx-1" />

          <RefCard label="Заказчики" accent="#4f46e5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold text-[#2e2a27] tabular-nums">{m.totalCustomers}</p>
                <p className="text-[10px] text-[#a8a29e]">всего</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-indigo-600 tabular-nums">{m.activeCustomers}</p>
                <p className="text-[10px] text-[#a8a29e]">активных</p>
              </div>
            </div>
            <PctBar pct={m.activeCustomersPct} color="bg-indigo-400" />
            <p className="text-[10px] text-[#a8a29e] mt-1">{m.activeCustomersPct}% активных</p>
          </RefCard>

          <RefCard label="Эксперты" accent="#0891b2">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold text-[#2e2a27] tabular-nums">{m.totalExperts}</p>
                <p className="text-[10px] text-[#a8a29e]">всего</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-cyan-600 tabular-nums">{m.activeExperts}</p>
                <p className="text-[10px] text-[#a8a29e]">в работе</p>
              </div>
            </div>
            <PctBar pct={m.activeExpertsPct} color="bg-cyan-400" />
            <p className="text-[10px] text-[#a8a29e] mt-1">{m.activeExpertsPct}% активных</p>
          </RefCard>

          <div className="h-px bg-[#e5dfd7] mx-1" />

          <RefCard label="Реестр Палаты СЭ" accent="#059669">
            <p className="text-2xl font-bold text-[#2e2a27] tabular-nums">{m.palataVerified}</p>
            <p className="text-[10px] text-[#a8a29e]">palata_registry_verified = true</p>
          </RefCard>

          <RefCard label="Центр судэксперт" accent="#059669">
            <p className="text-2xl font-bold text-[#2e2a27] tabular-nums">{m.centrVerified}</p>
            <p className="text-[10px] text-[#a8a29e]">centrsudexpert_verified = true</p>
          </RefCard>
        </div>
      </div>
    </div>
  );
}

// ─── UI Components ────────────────────────────────────────────────────────────

function TopKpi({ label, value, accent, sub, raw }: {
  label: string;
  value: number | string;
  accent: string;
  sub: string;
  raw?: boolean;
}) {
  const display = raw ? value : typeof value === "number" ? value.toLocaleString("ru-RU") : value;
  return (
    <div className="bg-white rounded-2xl border border-[#e5dfd7] p-5 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl" style={{ background: accent }} />
      <p className="text-[11px] text-[#a8a29e] font-medium mb-2 leading-tight">{label}</p>
      <p className="text-3xl font-bold tabular-nums" style={{ color: accent }}>{display}</p>
      <p className="text-[10px] text-[#c4bdb4] mt-1.5 font-mono truncate">{sub}</p>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#e5dfd7] p-5 shadow-sm">
      <p className="text-xs font-bold text-[#2e2a27] uppercase tracking-widest mb-5">{label}</p>
      {children}
    </div>
  );
}

function FunnelBox({ label, count, total, accent, first }: {
  label: string; count: number; total: number; accent: string; first?: boolean;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div
      className="rounded-xl border p-3 min-w-[88px] text-center transition-shadow hover:shadow-md"
      style={{
        borderColor: first ? "#e5dfd7" : `${accent}44`,
        background: first ? "#faf8f5" : `${accent}0d`,
      }}
    >
      <p className="text-[10px] font-medium text-[#a8a29e] leading-tight mb-1.5 max-w-[80px] mx-auto">
        {label}
      </p>
      <p className="text-xl font-bold tabular-nums" style={{ color: first ? "#78716c" : accent }}>
        {count.toLocaleString("ru-RU")}
      </p>
      {!first && (
        <p className="text-[10px] font-semibold mt-0.5" style={{ color: accent }}>
          {pct}%
        </p>
      )}
    </div>
  );
}

function Arrow() {
  return <span className="text-[#c4bdb4] text-sm select-none shrink-0">→</span>;
}

function ModeButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
        active
          ? "bg-white text-[#e8891a] shadow-sm border border-[#e5dfd7]"
          : "text-[#a8a29e] hover:text-[#2e2a27]"
      }`}
    >
      {children}
    </button>
  );
}

function RefCard({ label, accent, children }: {
  label: string; accent: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#e5dfd7] p-4 shadow-sm relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl" style={{ background: accent }} />
      <p className="text-[10px] font-semibold text-[#a8a29e] uppercase tracking-widest mb-2 pl-1">{label}</p>
      <div className="pl-1">{children}</div>
    </div>
  );
}

function RatingDisplay({ value }: { value: number | null }) {
  if (value == null) return <p className="text-xl font-bold text-[#c4bdb4]">—</p>;
  const stars = Math.round(value);
  return (
    <div className="flex items-center gap-1.5">
      <p className="text-2xl font-bold text-[#2e2a27] tabular-nums">{value.toFixed(2)}</p>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(s => (
          <span key={s} className={`text-sm ${s <= stars ? "text-amber-400" : "text-[#e5dfd7]"}`}>★</span>
        ))}
      </div>
    </div>
  );
}

function PctBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full bg-[#f2ece2] rounded-full h-1.5 mt-2 overflow-hidden">
      <div className={`${color} h-1.5 rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function DistTable({ title, rows, total, subtitle }: {
  title: string; rows: Array<{ label: string; count: number }>; total: number; subtitle: string;
}) {
  return (
    <div className="bg-[#faf8f5] rounded-xl border border-[#e5dfd7] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#e5dfd7] flex items-baseline justify-between">
        <p className="text-xs font-semibold text-[#2e2a27]">{title}</p>
        <p className="text-[10px] text-[#c4bdb4] font-mono">{subtitle}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-xs text-[#c4bdb4] text-center italic">Нет данных</p>
      ) : (
        <div className="divide-y divide-[#f2ece2]">
          {rows.slice(0, 10).map(({ label, count }) => {
            const share = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={label} className="px-4 py-2.5 flex items-center gap-3 hover:bg-white/60 transition-colors">
                <p className="text-xs text-[#4a4540] flex-1 truncate">{label}</p>
                <div className="w-20 bg-[#e5dfd7] rounded-full h-1.5 shrink-0 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-[#e8891a] to-[#f5a63d] h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${share}%` }}
                  />
                </div>
                <p className="text-xs font-semibold text-[#2e2a27] tabular-nums w-5 text-right shrink-0">{count}</p>
                <p className="text-[10px] text-[#a8a29e] w-7 shrink-0">{share}%</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
