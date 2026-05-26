import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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
  | { kind: "ok"; rows: Request[]; total: number }
  | { kind: "error"; message: string };

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

export default function CustomerDashboard() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    supabase
      .from("palata_requests")
      .select(
        "id, title, status, expertise_type, region, matching_round, created_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .then(({ data, error, count }) => {
        if (error) {
          setState({ kind: "error", message: error.message });
          return;
        }
        setState({ kind: "ok", rows: (data as Request[]) ?? [], total: count ?? 0 });
      });
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <span className="inline-block rounded-full px-3 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 mb-2">
          Заказчик
        </span>
        <h1 className="text-2xl font-bold text-slate-800">Мои заявки</h1>
        <p className="text-sm text-slate-500 mt-1">
          Заявки на судебную экспертизу из таблицы{" "}
          <code className="font-mono text-xs bg-slate-100 px-1 rounded">
            palata_requests
          </code>
        </p>
      </div>

      {state.kind === "loading" && <LoadingCard />}
      {state.kind === "error" && <ErrorCard message={state.message} />}
      {state.kind === "ok" && (
        <>
          <div className="mb-4 flex items-center gap-3">
            <span className="text-sm text-slate-500">
              Всего заявок:{" "}
              <strong className="text-slate-800">{state.total}</strong>
            </span>
          </div>
          <RequestsTable rows={state.rows} />
        </>
      )}
    </div>
  );
}

function RequestsTable({ rows }: { rows: Request[] }) {
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
              <td className="px-4 py-3 text-slate-800 max-w-[220px] truncate font-medium">
                {r.title}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[r.status] ?? "bg-slate-100 text-slate-500"}`}
                >
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate">
                {r.expertise_type}
              </td>
              <td className="px-4 py-3 text-slate-600">{r.region}</td>
              <td className="px-4 py-3 text-right text-slate-500">
                {r.matching_round}
              </td>
              <td className="px-4 py-3 text-right text-slate-400 text-xs">
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
