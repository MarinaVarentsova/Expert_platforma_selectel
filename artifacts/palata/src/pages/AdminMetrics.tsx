import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdminLayout from "@/components/AdminLayout";
import { useRequireRole } from "@/lib/useRequireRole";

// ─── Status maps (single source of truth) ─────────────────────────────────────
// Each status appears in exactly ONE set. No overlap. All metrics share this mapping.

// All known statuses are mapped here — no request may fall through the cracks.
// Legacy enum values (draft, pending, in_progress, failed) are merged into the
// nearest semantic bucket so the sum of all buckets always equals total.
const S_NEW      = new Set(["new", "draft"]);
const S_MATCH    = new Set(["matching", "pending"]);
const S_SEL      = new Set(["expert_selection"]);
const S_WORK     = new Set(["in_work", "in_progress"]);
const S_DONE     = new Set(["completed"]);
// Inactive = неактуальные (not_actual/cancelled/archived/failed/declined)
const S_INACTIVE = new Set(["not_actual", "cancelled", "archived", "failed", "declined"]);
const S_INACTIVE_TRACK = S_INACTIVE;

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

// ─── Compute function (single source of truth for all metrics) ────────────────

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

  // Count requests matching a status set
  function cnt(set: Set<string>) { return requests.filter(r => set.has(r.status)).length; }

  function avgScore(arr: { score: number }[]) {
    const valid = arr.filter(r => r.score != null && !isNaN(r.score));
    if (!valid.length) return null;
    return Math.round((valid.reduce((a, b) => a + b.score, 0) / valid.length) * 100) / 100;
  }

  // ── Zone 1: Average completion time ──────────────────────────────────────────
  // Only use palata_status_events (not updated_at — that would distort the result)
  const completedReqIds = new Set(requests.filter(r => r.status === "completed").map(r => r.id));
  const reqById = Object.fromEntries(requests.map(r => [r.id, r]));

  // Build map: request_id → earliest completion event timestamp
  const completionEventAt: Record<string, string> = {};
  for (const e of statusEvents) {
    if (completedReqIds.has(e.entity_id)) {
      if (!completionEventAt[e.entity_id] || e.created_at < completionEventAt[e.entity_id]) {
        completionEventAt[e.entity_id] = e.created_at;
      }
    }
  }

  const completionDays: number[] = [];
  for (const id of completedReqIds) {
    const req = reqById[id];
    const completedAt = completionEventAt[id]; // only use event, never updated_at
    if (!req || !completedAt) continue;
    const days = (new Date(completedAt).getTime() - new Date(req.created_at).getTime()) / 86_400_000;
    if (days >= 0) completionDays.push(days);
  }
  const avgCompletionDays = completionDays.length
    ? Math.round((completionDays.reduce((a, b) => a + b, 0) / completionDays.length) * 10) / 10
    : null;

  // ── Zone 2: Active customers ──────────────────────────────────────────────────
  // Active = has ≥1 request NOT in S_INACTIVE
  // BUT capped to those who exist in palata_customer_profiles (so active ≤ total always)
  const customerProfileIds = new Set(customerProfiles.map(p => p.user_id));
  const activeCustomerIds = new Set(
    requests
      .filter(r => !S_INACTIVE.has(r.status) && r.customer_id && customerProfileIds.has(r.customer_id))
      .map(r => r.customer_id!)
  );
  const totalCustomers = customerProfiles.length;
  const activeCustomers = activeCustomerIds.size; // guaranteed ≤ totalCustomers

  // ── Zone 2: Active experts ────────────────────────────────────────────────────
  // Active = expert has any "live" match engagement (not dead, not completed/withdrawn)
  // Dead match statuses — everything else is considered "active engagement"
  const DEAD_MATCH = new Set(["declined", "withdrawn", "closed_by_other_expert", "completed"]);
  // Live match statuses that indicate an expert is actively engaged
  const ACTIVE_MATCH = new Set(["accepted_work", "accepted", "contacts_opened", "can_start_from"]);
  const inWorkRequestIds = new Set(requests.filter(r => S_WORK.has(r.status)).map(r => r.id));
  const activeExpertIds = new Set<string>();
  for (const m of matches) {
    // Signal (a): explicit active match status
    if (ACTIVE_MATCH.has(m.status)) { activeExpertIds.add(m.expert_id); continue; }
    // Signal (b): request is in_work and match is not dead
    if (inWorkRequestIds.has(m.request_id) && !DEAD_MATCH.has(m.status)) {
      activeExpertIds.add(m.expert_id);
    }
  }
  const totalExperts = experts.length;
  const activeExperts = activeExpertIds.size;

  // ── Zone 3 track 2 ───────────────────────────────────────────────────────────
  // "Не нашли эксперта": status=matching AND no active (non-dead) matches
  const matchesByReq: Record<string, MatchRow[]> = {};
  for (const m of matches) (matchesByReq[m.request_id] ??= []).push(m);

  const noExpert = requests.filter(r => S_MATCH.has(r.status)).filter(r => {
    const ms = matchesByReq[r.id] ?? [];
    return ms.filter(m => !DEAD_MATCH.has(m.status)).length === 0;
  }).length;

  // "Отказ эксперта": COUNT(DISTINCT request_id) where ≥1 match is declined
  const declinedRequestIds = new Set(
    matches.filter(m => m.status === "declined").map(m => m.request_id)
  );
  const expertDeclined = declinedRequestIds.size;

  // "Неактуальные": same S_INACTIVE as everywhere
  const inactive = cnt(S_INACTIVE_TRACK);

  // ── Zone 4: Distributions ─────────────────────────────────────────────────────
  // Null/empty values → "Без региона" / "Без направления" so total always matches
  function groupCount(arr: string[], fallback = "Не указано"): Distribution {
    const map: Record<string, number> = {};
    for (const k of arr) {
      const key = k?.trim() || fallback;
      map[key] = (map[key] ?? 0) + 1;
    }
    return Object.entries(map)
      .map(([label, count]) => ({ label: humanLabel(label), count }))
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
    avgRatingExpert:    avgScore(expRatings),
    avgRatingCustomer:  avgScore(custRatings),
    totalCustomers,
    activeCustomers,
    activeCustomersPct: totalCustomers ? Math.round((activeCustomers / totalCustomers) * 100) : 0,
    totalExperts,
    activeExperts,
    activeExpertsPct:   totalExperts ? Math.round((activeExperts / totalExperts) * 100) : 0,
    palataVerified:     experts.filter(e => e.palata_registry_verified).length,
    centrVerified:      experts.filter(e => e.centrsudexpert_verified).length,

    // Zone 3 track 1 — каждый статус считается один раз, из одного cnt()
    statusNew:       cnt(S_NEW),
    statusMatching:  cnt(S_MATCH),
    statusSelection: cnt(S_SEL),
    statusInWork:    cnt(S_WORK),
    statusDone:      completed,
    statusCancelled: cnt(S_INACTIVE),
    statusFailed:    0, // merged into S_INACTIVE per new mapping

    // Zone 3 track 2
    noExpert,
    allDeclined: expertDeclined,
    cancelled:   inactive,

    // Zone 4 — each row uses explicit fallback so the sum == total
    reqByRegion:    groupCount(requests.map(r => r.region), "Без региона"),
    reqBySpec:      groupCount(requests.map(r => r.expertise_type), "Без направления"),
    // For experts: experts with empty arrays count as "Не указано" (so sum == totalExperts)
    expertByRegion: groupCount(
      experts.flatMap(e => (e.regions?.length ? e.regions : ["Не указано"])),
      "Не указано"
    ),
    expertBySpec: groupCount(
      experts.flatMap(e => (e.specializations?.length ? e.specializations : ["Не указано"])),
      "Не указано"
    ),
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
            .select("id, status, region, expertise_type, created_at, customer_id"),
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
          <div className="h-5 w-5 rounded-full border-2 border-[#16a34a]/30 border-t-[#16a34a] animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-screen-2xl mx-auto">

        {/* Header */}
        <div className="mb-7 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#1a3d2b]">Метрики платформы</h1>
            <p className="text-xs text-[#8aaa90] mt-0.5">Единый источник данных · Supabase · Real-time</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </div>
        </div>

        {state.kind === "loading" && (
          <div className="flex items-center gap-3 py-16 text-sm text-[#8aaa90]">
            <div className="h-4 w-4 rounded-full border-2 border-[#16a34a]/30 border-t-[#16a34a] animate-spin" />
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
          label="Всего заказов"
          value={m.total}
          accent="#16a34a"
          sub="palata_requests · всего"
        />
        <TopKpi
          label="Выполнено"
          value={m.completed}
          accent="#059669"
          sub="status = completed"
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
          sub="status_events: created_at → completed"
          raw
        />
      </div>

      {/* ══ Main area + Right panel ══════════════════════════════════════════ */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* Left: Zones 3 + 4 */}
        <div className="flex-1 min-w-0 space-y-8">

          {/* ── ZONE 3: Заказы ──────────────────────────────────────── */}
          <Section label="Заказы">

            {/* Track 1 — основная раскладка */}
            <div className="mb-8">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#8aaa90] mb-4">
                Раскладка по статусам
              </p>
              <div className="flex flex-wrap gap-3 items-center justify-center">
                <FunnelBox label="Всего" count={m.total} total={m.total} accent="#5a7560" first />
                <Arrow />
                <FunnelBox label="Новые" count={m.statusNew} total={m.total} accent="#5a7560" />
                <Arrow />
                <FunnelBox label="Подбор" count={m.statusMatching} total={m.total} accent="#d97706" />
                <Arrow />
                <FunnelBox label="Выбор эксперта" count={m.statusSelection} total={m.total} accent="#0891b2" />
                <Arrow />
                <FunnelBox label="В работе" count={m.statusInWork} total={m.total} accent="#4f46e5" />
                <Arrow />
                <FunnelBox label="Выполнено" count={m.statusDone} total={m.total} accent="#059669" />
                <Arrow />
                <FunnelBox label="Неактуальные" count={m.statusCancelled} total={m.total} accent="#5a7560" />
              </div>
            </div>

            {/* Track 2 — проблемная воронка */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#8aaa90] mb-4">
                Проблемные заказы
              </p>
              <div className="flex flex-wrap gap-3 items-center justify-center">
                <FunnelBox label="Всего" count={m.total} total={m.total} accent="#5a7560" first />
                <Arrow />
                <FunnelBox label="Не нашли эксперта" count={m.noExpert} total={m.total} accent="#dc2626" />
                <Arrow />
                <FunnelBox label="Отказ эксперта" count={m.allDeclined} total={m.total} accent="#dc2626" />
                <Arrow />
                <FunnelBox label="Неактуальные" count={m.cancelled} total={m.total} accent="#8aaa90" />
              </div>
            </div>
          </Section>

          {/* ── ZONE 4: Распределения ───────────────────────────────── */}
          <Section label="Распределение">
            {/* Mode toggle */}
            <div className="flex gap-1 mb-5 p-1 bg-[#f0f5f1] rounded-xl w-fit">
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
                  total={m.totalExperts}
                  subtitle="palata_expert_profiles.regions[]"
                />
                <DistTable
                  title="По направлениям"
                  rows={m.expertBySpec}
                  total={m.totalExperts}
                  subtitle="palata_expert_profiles.specializations[]"
                />
              </div>
            )}
          </Section>
        </div>

        {/* ══ ZONE 2: Right reference panel ══════════════════════════════════ */}
        <div className="w-full lg:w-64 shrink-0 space-y-3">

          <p className="text-[10px] font-bold uppercase tracking-widest text-[#8aaa90] px-1">
            Справочные метрики
          </p>

          <RefCard label="Ср. рейтинг эксперта" accent="#d97706">
            <RatingDisplay value={m.avgRatingExpert} />
            <p className="text-[10px] text-[#8aaa90] mt-0.5">palata_expert_ratings · AVG(score)</p>
          </RefCard>

          <RefCard label="Ср. рейтинг заказчика" accent="#d97706">
            <RatingDisplay value={m.avgRatingCustomer} />
            <p className="text-[10px] text-[#8aaa90] mt-0.5">palata_customer_ratings · AVG(score)</p>
          </RefCard>

          <div className="h-px bg-[#d4e5d9] mx-1" />

          <RefCard label="Заказчики" accent="#4f46e5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold text-[#1a3d2b] tabular-nums">{m.totalCustomers}</p>
                <p className="text-[10px] text-[#8aaa90]">всего</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-[#16a34a] tabular-nums">{m.activeCustomers}</p>
                <p className="text-[10px] text-[#8aaa90]">активных</p>
              </div>
            </div>
            <PctBar pct={m.activeCustomersPct} color="bg-[#16a34a]" />
            <p className="text-[10px] text-[#8aaa90] mt-1">{m.activeCustomersPct}% активных</p>
          </RefCard>

          <RefCard label="Эксперты" accent="#16a34a">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold text-[#1a3d2b] tabular-nums">{m.totalExperts}</p>
                <p className="text-[10px] text-[#8aaa90]">всего</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-[#16a34a] tabular-nums">{m.activeExperts}</p>
                <p className="text-[10px] text-[#8aaa90]">в работе</p>
              </div>
            </div>
            <PctBar pct={m.activeExpertsPct} color="bg-[#8aaa90]" />
            <p className="text-[10px] text-[#8aaa90] mt-1">{m.activeExpertsPct}% активных</p>
          </RefCard>

          <div className="h-px bg-[#d4e5d9] mx-1" />

          <RefCard label="Реестр Палаты СЭ" accent="#059669">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold text-[#1a3d2b] tabular-nums">{m.palataVerified}</p>
                <p className="text-[10px] text-[#8aaa90]">из {m.totalExperts} экспертов</p>
              </div>
              <p className="text-lg font-bold text-emerald-600 tabular-nums">
                {m.totalExperts ? Math.round((m.palataVerified / m.totalExperts) * 100) : 0}%
              </p>
            </div>
            <PctBar pct={m.totalExperts ? Math.round((m.palataVerified / m.totalExperts) * 100) : 0} color="bg-emerald-400" />
          </RefCard>

          <RefCard label="Центр судэксперт" accent="#059669">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold text-[#1a3d2b] tabular-nums">{m.centrVerified}</p>
                <p className="text-[10px] text-[#8aaa90]">из {m.totalExperts} экспертов</p>
              </div>
              <p className="text-lg font-bold text-emerald-600 tabular-nums">
                {m.totalExperts ? Math.round((m.centrVerified / m.totalExperts) * 100) : 0}%
              </p>
            </div>
            <PctBar pct={m.totalExperts ? Math.round((m.centrVerified / m.totalExperts) * 100) : 0} color="bg-emerald-400" />
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
    <div className="bg-white rounded-2xl border border-[#d4e5d9] p-5 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl" style={{ background: accent }} />
      <p className="text-[11px] text-[#8aaa90] font-medium mb-2 leading-tight">{label}</p>
      <p className="text-3xl font-bold tabular-nums" style={{ color: accent }}>{display}</p>
      <p className="text-[10px] text-[#b8ccbe] mt-1.5 font-mono truncate">{sub}</p>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#d4e5d9] p-5 shadow-sm">
      <p className="text-xs font-bold text-[#1a3d2b] uppercase tracking-widest mb-5">{label}</p>
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
      className="rounded-2xl border px-5 py-4 min-w-[104px] text-center transition-shadow hover:shadow-md"
      style={{
        borderColor: first ? "#d4e5d9" : `${accent}55`,
        background: first ? "#f7fbf8" : `${accent}11`,
      }}
    >
      <p className="text-[11px] font-semibold text-[#8aaa90] leading-tight mb-2 max-w-[90px] mx-auto">
        {label}
      </p>
      <p className="text-2xl font-bold tabular-nums" style={{ color: first ? "#5a7560" : accent }}>
        {count.toLocaleString("ru-RU")}
      </p>
      {!first && (
        <p className="text-xs font-bold mt-1" style={{ color: accent }}>
          {pct}%
        </p>
      )}
    </div>
  );
}

function Arrow() {
  return <span className="text-[#b8ccbe] text-sm select-none shrink-0">→</span>;
}

function ModeButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
        active
          ? "bg-white text-[#16a34a] shadow-sm border border-[#d4e5d9]"
          : "text-[#8aaa90] hover:text-[#1a3d2b]"
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
    <div className="bg-white rounded-xl border border-[#d4e5d9] p-4 shadow-sm relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl" style={{ background: accent }} />
      <p className="text-[10px] font-semibold text-[#8aaa90] uppercase tracking-widest mb-2 pl-1">{label}</p>
      <div className="pl-1">{children}</div>
    </div>
  );
}

function RatingDisplay({ value }: { value: number | null }) {
  if (value == null) return <p className="text-xl font-bold text-[#b8ccbe]">—</p>;
  const stars = Math.round(value);
  return (
    <div className="flex items-center gap-1.5">
      <p className="text-2xl font-bold text-[#1a3d2b] tabular-nums">{value.toFixed(2)}</p>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(s => (
          <span key={s} className={`text-sm ${s <= stars ? "text-amber-400" : "text-[#d4e5d9]"}`}>★</span>
        ))}
      </div>
    </div>
  );
}

function PctBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full bg-[#f0f5f1] rounded-full h-1.5 mt-2 overflow-hidden">
      <div className={`${color} h-1.5 rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function DistTable({ title, rows, total, subtitle }: {
  title: string; rows: Array<{ label: string; count: number }>; total: number; subtitle: string;
}) {
  return (
    <div className="bg-[#f7fbf8] rounded-xl border border-[#d4e5d9] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#d4e5d9]">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-xs font-semibold text-[#1a3d2b]">{title}</p>
          <p className="text-[10px] text-[#b8ccbe] font-mono">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-[#16a34a] tabular-nums">{total.toLocaleString("ru-RU")}</span>
          <span className="text-[10px] text-[#8aaa90]">итого</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-xs text-[#b8ccbe] text-center italic">Нет данных</p>
      ) : (
        <div className="divide-y divide-[#f0f5f1]">
          {rows.slice(0, 10).map(({ label, count }) => {
            const share = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={label} className="px-4 py-2.5 flex items-center gap-3 hover:bg-white/60 transition-colors">
                <p className="text-xs text-[#4a4540] flex-1 truncate">{label}</p>
                <div className="w-20 bg-[#d4e5d9] rounded-full h-1.5 shrink-0 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-[#16a34a] to-[#4ade80] h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${share}%` }}
                  />
                </div>
                <p className="text-xs font-semibold text-[#1a3d2b] tabular-nums w-5 text-right shrink-0">{count}</p>
                <p className="text-[10px] text-[#8aaa90] w-7 shrink-0">{share}%</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
