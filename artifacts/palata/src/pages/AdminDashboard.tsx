import { useEffect, useState } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { KanbanBoard } from "@/components/KanbanBoard";
import AdminLayout from "@/components/AdminLayout";

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
  { id: "new",      label: "Новые",          accent: "border-t-slate-400",  statuses: ["draft", "new"] },
  { id: "pending",  label: "Идёт подбор",    accent: "border-t-yellow-400", statuses: ["pending"] },
  { id: "matching", label: "Выбор эксперта", accent: "border-t-cyan-400",   statuses: ["expert_selection"] },
  { id: "working",  label: "В работе",       accent: "border-t-indigo-400", statuses: ["in_progress", "in_work"] },
  { id: "problem",  label: "Проблемные",     accent: "border-t-red-400",    statuses: ["failed", "matching"] },
  { id: "done",     label: "Выполненные",    accent: "border-t-green-400",  statuses: ["completed"] },
  { id: "closed",   label: "Неактуальные",   accent: "border-t-slate-300",  statuses: ["cancelled"] },
];

export default function AdminDashboard() {
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

  const total = state.kind === "ok" ? state.rows.length : null;

  const columns = COLUMNS.map((col) => ({
    id: col.id,
    label: col.label,
    accent: col.accent,
    items: state.kind === "ok"
      ? state.rows.filter((r) => col.statuses.includes(r.status))
      : [],
  }));

  return (
    <AdminLayout>
      <div className="px-6 py-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Все заказы</h1>
            <p className="text-sm text-slate-500 mt-1">
              Таблица{" "}
              <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">palata_requests</code>
            </p>
          </div>
          {total != null && (
            <div className="text-right">
              <p className="text-xs text-slate-400 mb-0.5">Всего заявок</p>
              <p className="text-3xl font-bold text-slate-900">{total}</p>
            </div>
          )}
        </div>

        {state.kind === "loading" && <p className="text-sm text-slate-400 py-8">Загрузка данных…</p>}
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

function AdminCard({ request: r }: { request: Request }) {
  return (
    <Link href={`/requests/${r.id}`}>
      <div className="bg-white rounded-lg border border-slate-200 p-3 hover:shadow-sm hover:border-indigo-200 transition-all cursor-pointer">
        <p className="text-xs font-semibold text-slate-800 leading-snug mb-2 line-clamp-2">{r.title}</p>
        <p className="text-xs text-slate-500 mb-1 truncate">{r.expertise_type}</p>
        <p className="text-xs text-slate-400 truncate">{r.region}</p>
        {(r.budget_min != null || r.budget_max != null) && (
          <p className="text-xs text-slate-400 mt-1">
            {r.budget_min?.toLocaleString("ru-RU") ?? "—"} – {r.budget_max?.toLocaleString("ru-RU") ?? "—"} ₽
          </p>
        )}
        <div className="mt-2 pt-2 border-t border-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-400">Раунд {r.matching_round}</span>
          <span className="text-xs text-slate-300">{new Date(r.created_at).toLocaleDateString("ru-RU")}</span>
        </div>
      </div>
    </Link>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 max-w-xl">
      <p className="text-sm font-semibold text-red-700 mb-1">Ошибка Supabase</p>
      <p className="text-xs text-red-600">{message}</p>
    </div>
  );
}
