import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Request = {
  id: string;
  title: string;
  status: string;
  expertise_type: string;
  region: string;
  matching_round: number;
  budget_min: number | null;
  budget_max: number | null;
  deadline: string | null;
  created_at: string;
};

type Stats = {
  total: number;
  byStatus: Record<string, number>;
};

type State =
  | { kind: "loading" }
  | { kind: "ok"; rows: Request[]; stats: Stats }
  | { kind: "error"; message: string };

const ALL_STATUSES = [
  "draft", "pending", "matching", "in_progress", "completed", "cancelled", "failed",
];

const STATUS_LABEL: Record<string, string> = {
  draft: "Черновик",
  pending: "Ожидает",
  matching: "Подбор",
  in_progress: "В работе",
  completed: "Завершён",
  cancelled: "Отменён",
  failed: "Ошибка",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  pending: "bg-yellow-100 text-yellow-700",
  matching: "bg-blue-100 text-blue-700",
  in_progress: "bg-indigo-100 text-indigo-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
  failed: "bg-red-100 text-red-600",
};

export default function AdminDashboard() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    supabase
      .from("palata_requests")
      .select(
        "id, title, status, expertise_type, region, matching_round, budget_min, budget_max, deadline, created_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .then(({ data, error, count }) => {
        if (error) {
          setState({ kind: "error", message: error.message });
          return;
        }
        const rows = (data as Request[]) ?? [];
        const byStatus: Record<string, number> = {};
        for (const r of rows) {
          byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
        }
        setState({ kind: "ok", rows, stats: { total: count ?? 0, byStatus } });
      });
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <span className="inline-block rounded-full px-3 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 mb-2">
          Администратор
        </span>
        <h1 className="text-2xl font-bold text-slate-800">Все заявки</h1>
        <p className="text-sm text-slate-500 mt-1">
          Полный список из таблицы{" "}
          <code className="font-mono text-xs bg-slate-100 px-1 rounded">
            palata_requests
          </code>
        </p>
      </div>

      {state.kind === "loading" && <LoadingCard />}
      {state.kind === "error" && <ErrorCard message={state.message} />}
      {state.kind === "ok" && (
        <>
          <StatsRow stats={state.stats} />
          <div className="mt-6">
            <AdminTable rows={state.rows} />
          </div>
        </>
      )}
    </div>
  );
}

function StatsRow({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs text-slate-400 mb-1">Всего заявок</p>
        <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
      </div>
      {ALL_STATUSES.filter((s) => (stats.byStatus[s] ?? 0) > 0).map((s) => (
        <div key={s} className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-400 mb-1">{STATUS_LABEL[s]}</p>
          <p className="text-2xl font-bold text-slate-800">
            {stats.byStatus[s]}
          </p>
        </div>
      ))}
    </div>
  );
}

function AdminTable({ rows }: { rows: Request[] }) {
  if (rows.length === 0) {
    return (
      <EmptyCard text="Заявок нет. Запустите seed-миграцию в Supabase SQL Editor." />
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
            <th className="text-left px-4 py-3 font-medium">Заголовок</th>
            <th className="text-left px-4 py-3 font-medium">Статус</th>
            <th className="text-left px-4 py-3 font-medium">Вид экспертизы</th>
            <th className="text-left px-4 py-3 font-medium">Регион</th>
            <th className="text-right px-4 py-3 font-medium">Бюджет (₽)</th>
            <th className="text-right px-4 py-3 font-medium">Раунд</th>
            <th className="text-right px-4 py-3 font-medium">Создан</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
            >
              <td className="px-4 py-3 max-w-[200px]">
                <p className="text-slate-800 font-medium truncate">{r.title}</p>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[r.status] ?? "bg-slate-100 text-slate-500"}`}
                >
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-600 max-w-[160px] truncate">
                {r.expertise_type}
              </td>
              <td className="px-4 py-3 text-slate-600">{r.region}</td>
              <td className="px-4 py-3 text-right text-slate-500 text-xs">
                {r.budget_min != null && r.budget_max != null
                  ? `${r.budget_min.toLocaleString("ru-RU")} – ${r.budget_max.toLocaleString("ru-RU")}`
                  : "—"}
              </td>
              <td className="px-4 py-3 text-right text-slate-500">
                {r.matching_round}
              </td>
              <td className="px-4 py-3 text-right text-xs text-slate-400">
                {new Date(r.created_at).toLocaleDateString("ru-RU")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-400">
      Загрузка данных…
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6">
      <p className="text-sm font-semibold text-red-700 mb-1">Ошибка Supabase</p>
      <p className="text-xs text-red-600">{message}</p>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}
