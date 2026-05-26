import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { KanbanBoard } from "@/components/KanbanBoard";

type Request = {
  id: string;
  title: string;
  status: string;
  expertise_type: string;
  region: string;
  matching_round: number;
  created_at: string;
};

type State =
  | { kind: "loading" }
  | { kind: "ok"; rows: Request[] }
  | { kind: "error"; message: string };

// Columns in display order
const COLUMNS: Array<{
  id: string;
  label: string;
  accent: string;
  statuses: string[];
}> = [
  { id: "new",      label: "Новый",          accent: "border-t-slate-300",  statuses: ["draft"] },
  { id: "pending",  label: "Идёт подбор",    accent: "border-t-yellow-400", statuses: ["pending"] },
  { id: "matching", label: "Выбор эксперта", accent: "border-t-blue-400",   statuses: ["matching"] },
  { id: "working",  label: "В работе",       accent: "border-t-indigo-400", statuses: ["in_progress"] },
  { id: "done",     label: "Выполнен",       accent: "border-t-green-400",  statuses: ["completed"] },
  { id: "closed",   label: "Неактуален",     accent: "border-t-red-300",    statuses: ["cancelled", "failed"] },
];

export default function CustomerDashboard() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    supabase
      .from("palata_requests")
      .select("id, title, status, expertise_type, region, matching_round, created_at")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) { setState({ kind: "error", message: error.message }); return; }
        setState({ kind: "ok", rows: (data as Request[]) ?? [] });
      });
  }, []);

  const columns = COLUMNS.map((col) => ({
    id: col.id,
    label: col.label,
    accent: col.accent,
    items: state.kind === "ok"
      ? state.rows.filter((r) => col.statuses.includes(r.status))
      : [],
  }));

  return (
    <div className="max-w-full px-6 py-10">
      <div className="max-w-5xl mb-8">
        <span className="inline-block rounded-full px-3 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 mb-2">
          Заказчик
        </span>
        <h1 className="text-2xl font-bold text-slate-800">Мои заказы</h1>
        <p className="text-sm text-slate-500 mt-1">
          Канбан по таблице{" "}
          <code className="font-mono text-xs bg-slate-100 px-1 rounded">palata_requests</code>
        </p>
      </div>

      {state.kind === "loading" && <LoadingCard />}
      {state.kind === "error" && <ErrorCard message={state.message} />}
      {state.kind === "ok" && (
        <KanbanBoard
          columns={columns}
          renderCard={(r: Request) => <CustomerCard request={r} />}
          emptyText="Нет заказов"
        />
      )}
    </div>
  );
}

function CustomerCard({ request: r }: { request: Request }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-xs font-semibold text-slate-800 leading-snug mb-2 line-clamp-2">
        {r.title}
      </p>
      <p className="text-xs text-slate-500 mb-1 truncate">{r.expertise_type}</p>
      <p className="text-xs text-slate-400 truncate">📍 {r.region}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-slate-400">
          Раунд {r.matching_round}
        </span>
        <span className="text-xs text-slate-300">
          {new Date(r.created_at).toLocaleDateString("ru-RU")}
        </span>
      </div>
    </div>
  );
}

function LoadingCard() {
  return <div className="text-sm text-slate-400 py-8">Загрузка данных…</div>;
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 max-w-xl">
      <p className="text-sm font-semibold text-red-700 mb-1">Ошибка Supabase</p>
      <p className="text-xs text-red-600">{message}</p>
    </div>
  );
}
