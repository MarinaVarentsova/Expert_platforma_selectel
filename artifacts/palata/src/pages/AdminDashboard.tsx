import { useEffect, useState } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { KanbanBoard } from "@/components/KanbanBoard";
import AdminLayout from "@/components/AdminLayout";
import { FileText, Clock, Zap, CheckCircle2, AlertTriangle, TrendingUp } from "lucide-react";
import { useRequireRole } from "@/lib/useRequireRole";

type Request = {
  id: string;
  title: string;
  status: string;
  expertise_type: string;
  region: string;
  matching_round: number;
  budget_min: number | null;
  budget_max: number | null;
  created_at: string;
};

type State =
  | { kind: "loading" }
  | { kind: "ok"; rows: Request[] }
  | { kind: "error"; message: string };

const COLUMNS = [
  {
    id: "new",
    label: "Новые",
    dotColor: "bg-slate-400",
    bgColor: "bg-white border-slate-200",
    accent: "",
    statuses: ["draft", "new"],
  },
  {
    id: "pending",
    label: "Идёт подбор",
    dotColor: "bg-amber-400",
    bgColor: "bg-amber-50/60 border-amber-200",
    accent: "",
    statuses: ["pending", "matching"],
  },
  {
    id: "matching",
    label: "Выбор эксперта",
    dotColor: "bg-cyan-400",
    bgColor: "bg-cyan-50/60 border-cyan-200",
    accent: "",
    statuses: ["expert_selection"],
  },
  {
    id: "working",
    label: "В работе",
    dotColor: "bg-indigo-500",
    bgColor: "bg-indigo-50/60 border-indigo-200",
    accent: "",
    statuses: ["in_progress", "in_work"],
  },
  {
    id: "problem",
    label: "Проблемные",
    dotColor: "bg-red-400",
    bgColor: "bg-red-50/60 border-red-200",
    accent: "",
    statuses: ["failed"],
  },
  {
    id: "done",
    label: "Выполненные",
    dotColor: "bg-emerald-400",
    bgColor: "bg-emerald-50/60 border-emerald-200",
    accent: "",
    statuses: ["completed"],
  },
  {
    id: "closed",
    label: "Неактуальные",
    dotColor: "bg-slate-300",
    bgColor: "bg-slate-50 border-slate-200",
    accent: "",
    statuses: ["cancelled"],
  },
];

export default function AdminDashboard() {
  const guard = useRequireRole("admin");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    supabase
      .from("palata_requests")
      .select("id, title, status, expertise_type, region, matching_round, budget_min, budget_max, created_at")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) { setState({ kind: "error", message: error.message }); return; }
        setState({ kind: "ok", rows: (data as Request[]) ?? [] });
      });
  }, []);

  if (guard.status === "loading" || guard.status === "redirecting") {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="h-5 w-5 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  const rows = state.kind === "ok" ? state.rows : [];
  const total = state.kind === "ok" ? rows.length : null;

  const count = (...statuses: string[]) => rows.filter(r => statuses.includes(r.status)).length;

  const columns = COLUMNS.map((col) => ({
    ...col,
    items: state.kind === "ok"
      ? rows.filter((r) => col.statuses.includes(r.status))
      : [],
  }));

  return (
    <AdminLayout>
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-screen-2xl mx-auto">

        {/* ── KPI cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          <KpiCard
            label="Всего заявок"
            value={total ?? "—"}
            Icon={FileText}
            colorClass="kpi-indigo"
            loading={state.kind === "loading"}
          />
          <KpiCard
            label="Новые"
            value={state.kind === "ok" ? count("draft", "new") : "—"}
            Icon={Clock}
            colorClass="kpi-slate"
            loading={state.kind === "loading"}
          />
          <KpiCard
            label="Идёт подбор"
            value={state.kind === "ok" ? count("pending", "matching") : "—"}
            Icon={Zap}
            colorClass="kpi-yellow"
            loading={state.kind === "loading"}
          />
          <KpiCard
            label="В работе"
            value={state.kind === "ok" ? count("in_progress", "in_work") : "—"}
            Icon={TrendingUp}
            colorClass="kpi-cyan"
            loading={state.kind === "loading"}
          />
          <KpiCard
            label="Выполнено"
            value={state.kind === "ok" ? count("completed") : "—"}
            Icon={CheckCircle2}
            colorClass="kpi-emerald"
            loading={state.kind === "loading"}
          />
          <KpiCard
            label="Проблемные"
            value={state.kind === "ok" ? count("failed") : "—"}
            Icon={AlertTriangle}
            colorClass="kpi-red"
            loading={state.kind === "loading"}
          />
        </div>

        {/* ── Section header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Канбан-доска заказов</h1>
            <p className="text-xs text-slate-400 mt-0.5">Отслеживайте статус каждого заказа в реальном времени</p>
          </div>
        </div>

        {state.kind === "loading" && (
          <div className="flex items-center gap-3 py-12 text-sm text-slate-400">
            <div className="h-4 w-4 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
            Загрузка данных…
          </div>
        )}
        {state.kind === "error" && <ErrorCard message={state.message} />}
        {state.kind === "ok" && (
          <KanbanBoard
            columns={columns}
            renderCard={(r: Request) => <AdminCard request={r} />}
            emptyText="Нет заявок"
          />
        )}
      </div>
    </AdminLayout>
  );
}

function KpiCard({
  label, value, Icon, colorClass, loading,
}: {
  label: string;
  value: number | string;
  Icon: React.ElementType;
  colorClass: string;
  loading: boolean;
}) {
  return (
    <div className={`kpi-card ${colorClass}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] font-medium text-slate-500 leading-tight">{label}</p>
        <Icon className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
      </div>
      {loading ? (
        <div className="h-7 w-12 bg-slate-100 rounded animate-pulse mt-1" />
      ) : (
        <p className="text-2xl font-bold text-slate-900 tabular-nums">
          {typeof value === "number" ? value.toLocaleString("ru-RU") : value}
        </p>
      )}
    </div>
  );
}

function AdminCard({ request: r }: { request: Request }) {
  const urgency =
    r.status === "failed" || r.status === "matching"
      ? "border-l-red-400"
      : r.status === "pending"
      ? "border-l-amber-400"
      : r.status === "completed"
      ? "border-l-emerald-400"
      : r.status === "in_progress" || r.status === "in_work"
      ? "border-l-indigo-400"
      : "border-l-slate-200";

  return (
    <Link href={`/requests/${r.id}`}>
      <div className={`bg-white rounded-xl border border-slate-100 border-l-[3px] ${urgency} p-3.5 hover:shadow-md hover:border-indigo-100 hover:border-l-indigo-400 transition-all cursor-pointer group shadow-sm`}>
        <p className="text-xs font-semibold text-slate-800 leading-snug mb-2.5 line-clamp-2 group-hover:text-indigo-700 transition-colors">
          {r.title}
        </p>

        <div className="space-y-1 mb-3">
          {r.expertise_type && (
            <p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
              <span className="inline-block h-1 w-1 rounded-full bg-indigo-300 flex-shrink-0" />
              {r.expertise_type}
            </p>
          )}
          {r.region && (
            <p className="text-[11px] text-slate-400 truncate">{r.region}</p>
          )}
          {(r.budget_min != null || r.budget_max != null) && (
            <p className="text-[11px] text-slate-400">
              {r.budget_min?.toLocaleString("ru-RU") ?? "—"} – {r.budget_max?.toLocaleString("ru-RU") ?? "—"} ₽
            </p>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-50">
          <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
            Раунд {r.matching_round}
          </span>
          <span className="text-[10px] text-slate-300">
            {new Date(r.created_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}
          </span>
        </div>
      </div>
    </Link>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 max-w-xl">
      <p className="text-sm font-semibold text-red-700 mb-1">Ошибка Supabase</p>
      <p className="text-xs text-red-600 font-mono">{message}</p>
    </div>
  );
}
