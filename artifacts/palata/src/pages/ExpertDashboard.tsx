import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { KanbanBoard } from "@/components/KanbanBoard";

type Match = {
  id: string;
  status: string;
  matching_round: number;
  decline_reason: string | null;
  responded_at: string | null;
  palata_requests: {
    title: string;
    expertise_type: string;
    region: string;
    status: string;
  } | null;
};

type State =
  | { kind: "loading" }
  | { kind: "ok"; rows: Match[] }
  | { kind: "error"; message: string };

const COLUMNS: Array<{
  id: string;
  label: string;
  accent: string;
  statuses: string[];
}> = [
  { id: "proposed",  label: "Новые предложения", accent: "border-t-blue-400",   statuses: ["proposed"] },
  { id: "contacts",  label: "Контакты открыты",  accent: "border-t-cyan-400",   statuses: [] },
  { id: "cantake",   label: "Могу взять",         accent: "border-t-teal-400",   statuses: [] },
  { id: "accepted",  label: "В работе",           accent: "border-t-indigo-400", statuses: ["accepted"] },
  { id: "completed", label: "Завершено",          accent: "border-t-green-400",  statuses: ["completed"] },
  { id: "declined",  label: "Отказ / не взял",    accent: "border-t-red-300",    statuses: ["declined", "withdrawn"] },
];

const DECLINE_LABEL: Record<string, string> = {
  busy:          "Занят",
  not_competent: "Вне компетенции",
  location:      "Регион",
  conflict:      "Конфликт интересов",
  conditions:    "Условия",
  other:         "Другое",
};

export default function ExpertDashboard() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    supabase
      .from("palata_request_matches")
      .select(`
        id, status, matching_round, decline_reason, responded_at,
        palata_requests ( title, expertise_type, region, status )
      `)
      .order("matching_round", { ascending: true })
      .then(({ data, error }) => {
        if (error) { setState({ kind: "error", message: error.message }); return; }
        setState({ kind: "ok", rows: (data as unknown as Match[]) ?? [] });
      });
  }, []);

  const columns = COLUMNS.map((col) => ({
    id: col.id,
    label: col.label,
    accent: col.accent,
    items: state.kind === "ok"
      ? (col.statuses.length === 0
          ? []
          : state.rows.filter((r) => col.statuses.includes(r.status)))
      : [],
  }));

  return (
    <div className="max-w-full px-6 py-10">
      <div className="max-w-5xl mb-8">
        <span className="inline-block rounded-full px-3 py-0.5 text-xs font-semibold bg-green-100 text-green-700 mb-2">
          Эксперт
        </span>
        <h1 className="text-2xl font-bold text-slate-800">Мои обращения</h1>
        <p className="text-sm text-slate-500 mt-1">
          Канбан по таблице{" "}
          <code className="font-mono text-xs bg-slate-100 px-1 rounded">palata_request_matches</code>
        </p>
      </div>

      {state.kind === "loading" && <LoadingCard />}
      {state.kind === "error" && <ErrorCard message={state.message} />}
      {state.kind === "ok" && (
        <KanbanBoard
          columns={columns}
          renderCard={(m: Match) => <ExpertCard match={m} />}
          emptyText="Нет обращений"
        />
      )}
    </div>
  );
}

function ExpertCard({ match: m }: { match: Match }) {
  const req = m.palata_requests;
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-xs font-semibold text-slate-800 leading-snug mb-2 line-clamp-2">
        {req?.title ?? "—"}
      </p>
      <p className="text-xs text-slate-500 mb-1 truncate">
        {req?.expertise_type ?? "—"}
      </p>
      <p className="text-xs text-slate-400 truncate">📍 {req?.region ?? "—"}</p>
      {m.decline_reason && (
        <p className="mt-1.5 text-xs text-red-500">
          Причина: {DECLINE_LABEL[m.decline_reason] ?? m.decline_reason}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-slate-400">Раунд {m.matching_round}</span>
        {m.responded_at && (
          <span className="text-xs text-slate-300">
            {new Date(m.responded_at).toLocaleDateString("ru-RU")}
          </span>
        )}
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
