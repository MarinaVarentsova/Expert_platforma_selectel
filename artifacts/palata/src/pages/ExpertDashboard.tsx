import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Match = {
  id: string;
  status: string;
  round_number: number;
  score: number | null;
  offered_at: string | null;
  responded_at: string | null;
  palata_requests: {
    title: string;
    expertise_type: string;
    region: string;
    status: string;
  } | null;
  palata_experts: {
    full_name: string;
    specialization: string[];
  } | null;
};

type State =
  | { kind: "loading" }
  | { kind: "ok"; rows: Match[]; total: number }
  | { kind: "error"; message: string };

const MATCH_STATUS_LABEL: Record<string, string> = {
  pending: "Предложено",
  accepted: "Принято",
  rejected: "Отклонено",
  expired: "Истекло",
  withdrawn: "Отозвано",
};

const MATCH_STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
  expired: "bg-slate-100 text-slate-500",
  withdrawn: "bg-slate-100 text-slate-500",
};

export default function ExpertDashboard() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    supabase
      .from("palata_request_matches")
      .select(
        `id, status, round_number, score, offered_at, responded_at,
         palata_requests ( title, expertise_type, region, status ),
         palata_experts ( full_name, specialization )`,
        { count: "exact" }
      )
      .order("offered_at", { ascending: false })
      .then(({ data, error, count }) => {
        if (error) {
          setState({ kind: "error", message: error.message });
          return;
        }
        setState({ kind: "ok", rows: (data as unknown as Match[]) ?? [], total: count ?? 0 });
      });
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <span className="inline-block rounded-full px-3 py-0.5 text-xs font-semibold bg-green-100 text-green-700 mb-2">
          Эксперт
        </span>
        <h1 className="text-2xl font-bold text-slate-800">Мои предложения</h1>
        <p className="text-sm text-slate-500 mt-1">
          Матчи из таблицы{" "}
          <code className="font-mono text-xs bg-slate-100 px-1 rounded">
            palata_request_matches
          </code>
        </p>
      </div>

      {state.kind === "loading" && <LoadingCard />}
      {state.kind === "error" && <ErrorCard message={state.message} />}
      {state.kind === "ok" && (
        <>
          <div className="mb-4 text-sm text-slate-500">
            Всего предложений:{" "}
            <strong className="text-slate-800">{state.total}</strong>
          </div>
          <MatchesTable rows={state.rows} />
        </>
      )}
    </div>
  );
}

function MatchesTable({ rows }: { rows: Match[] }) {
  if (rows.length === 0) {
    return (
      <EmptyCard text="Предложений нет. Запустите seed-миграцию в Supabase SQL Editor." />
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
            <th className="text-left px-4 py-3 font-medium">Заявка</th>
            <th className="text-left px-4 py-3 font-medium">Эксперт</th>
            <th className="text-left px-4 py-3 font-medium">Статус</th>
            <th className="text-right px-4 py-3 font-medium">Раунд</th>
            <th className="text-right px-4 py-3 font-medium">Score</th>
            <th className="text-right px-4 py-3 font-medium">Предложено</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr
              key={m.id}
              className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
            >
              <td className="px-4 py-3 max-w-[200px]">
                <p className="text-slate-800 font-medium truncate">
                  {m.palata_requests?.title ?? "—"}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {m.palata_requests?.expertise_type} · {m.palata_requests?.region}
                </p>
              </td>
              <td className="px-4 py-3 max-w-[160px]">
                <p className="text-slate-700 truncate">
                  {m.palata_experts?.full_name ?? "—"}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {m.palata_experts?.specialization?.join(", ")}
                </p>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${MATCH_STATUS_COLOR[m.status] ?? "bg-slate-100 text-slate-500"}`}
                >
                  {MATCH_STATUS_LABEL[m.status] ?? m.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-slate-500">
                {m.round_number}
              </td>
              <td className="px-4 py-3 text-right text-slate-500">
                {m.score != null ? m.score.toFixed(2) : "—"}
              </td>
              <td className="px-4 py-3 text-right text-xs text-slate-400">
                {m.offered_at
                  ? new Date(m.offered_at).toLocaleDateString("ru-RU")
                  : "—"}
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
