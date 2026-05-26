import { useEffect, useState } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";
import { KanbanBoard } from "@/components/KanbanBoard";
import { Inbox, Star } from "lucide-react";

type Match = {
  id: string;
  request_id: string;
  status: string;
  matching_round: number;
  decline_reason: string | null;
  responded_at: string | null;
  palata_requests: {
    title: string;
    expertise_type: string;
    region: string;
    urgency: string | null;
  } | null;
};

type State =
  | { kind: "loading" }
  | { kind: "ok"; rows: Match[] }
  | { kind: "error"; message: string };

const COLUMNS = [
  {
    id: "proposed",
    label: "Новые предложения",
    dotColor: "bg-blue-400",
    bgColor: "bg-blue-50/60 border-blue-200",
    accent: "",
    statuses: ["proposed"],
  },
  {
    id: "contacts",
    label: "Контакты открыты",
    dotColor: "bg-cyan-400",
    bgColor: "bg-cyan-50/60 border-cyan-200",
    accent: "",
    statuses: ["contacts_opened"],
  },
  {
    id: "cantake",
    label: "Могу взять",
    dotColor: "bg-teal-400",
    bgColor: "bg-teal-50/60 border-teal-200",
    accent: "",
    statuses: ["can_start_from"],
  },
  {
    id: "accepted",
    label: "В работе",
    dotColor: "bg-indigo-500",
    bgColor: "bg-indigo-50/60 border-indigo-200",
    accent: "",
    statuses: ["accepted", "accepted_work"],
  },
  {
    id: "completed",
    label: "Завершено",
    dotColor: "bg-emerald-400",
    bgColor: "bg-emerald-50/60 border-emerald-200",
    accent: "",
    statuses: ["completed"],
  },
  {
    id: "declined",
    label: "Отказ / не взял",
    dotColor: "bg-slate-300",
    bgColor: "bg-slate-50 border-slate-200",
    accent: "",
    statuses: ["declined", "withdrawn", "closed_by_other_expert"],
  },
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
  const guard = useRequireRole("expert");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (guard.status !== "ok") return;
    const userId = guard.user.id;

    supabase
      .from("palata_request_matches")
      .select(`
        id, request_id, status, matching_round, decline_reason, responded_at,
        palata_requests ( title, expertise_type, region, urgency )
      `)
      .eq("expert_id", userId)
      .order("matching_round", { ascending: true })
      .then(({ data, error }) => {
        if (error) { setState({ kind: "error", message: error.message }); return; }
        setState({ kind: "ok", rows: (data as unknown as Match[]) ?? [] });
      });
  }, [guard.status]);

  if (guard.status === "loading" || guard.status === "redirecting") {
    return <LoadingScreen />;
  }

  const { user } = guard;

  const columns = COLUMNS.map((col) => ({
    ...col,
    items: state.kind === "ok"
      ? state.rows.filter((r) => col.statuses.includes(r.status))
      : [],
  }));

  const activeCount = state.kind === "ok"
    ? state.rows.filter(r => ["proposed", "contacts_opened", "can_start_from", "accepted", "accepted_work"].includes(r.status)).length
    : null;

  return (
    <div className="px-6 py-8 max-w-[1400px]">

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Личный кабинет эксперта</p>
          <h1 className="text-xl font-bold text-slate-900">Мои обращения</h1>
          <p className="text-xs text-slate-400 mt-0.5">{user.full_name ?? user.email}</p>
        </div>

        {activeCount != null && activeCount > 0 && (
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2">
            <Star className="w-4 h-4 text-indigo-400" />
            <div>
              <p className="text-[10px] text-indigo-400 uppercase tracking-wide font-semibold">Активных</p>
              <p className="text-xl font-bold text-indigo-700 tabular-nums leading-none">{activeCount}</p>
            </div>
          </div>
        )}
      </div>

      {state.kind === "loading" && <LoadingRows />}
      {state.kind === "error" && <ErrorCard message={state.message} />}

      {state.kind === "ok" && state.rows.length === 0 && <EmptyState />}

      {state.kind === "ok" && state.rows.length > 0 && (
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
  const urgencyColor = req?.urgency === "very_urgent" ? "border-l-red-400"
    : req?.urgency === "urgent" ? "border-l-amber-400"
    : "border-l-indigo-200";

  return (
    <Link href={`/requests/${m.request_id}`}>
      <div className={`bg-white rounded-xl border border-slate-100 border-l-[3px] ${urgencyColor} p-3.5 hover:shadow-md hover:border-indigo-100 transition-all cursor-pointer group shadow-sm`}>
        <p className="text-xs font-semibold text-slate-800 leading-snug mb-2 line-clamp-2 group-hover:text-indigo-700 transition-colors">
          {req?.title ?? "—"}
        </p>

        <div className="space-y-1 mb-2.5">
          {req?.expertise_type && (
            <p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
              <span className="inline-block h-1 w-1 rounded-full bg-cyan-300 flex-shrink-0" />
              {req.expertise_type}
            </p>
          )}
          {req?.region && (
            <p className="text-[11px] text-slate-400 truncate">{req.region}</p>
          )}
          {m.decline_reason && (
            <span className="inline-block text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
              {DECLINE_LABEL[m.decline_reason] ?? m.decline_reason}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-50">
          <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
            Раунд {m.matching_round}
          </span>
          {m.responded_at && (
            <span className="text-[10px] text-slate-300">
              {new Date(m.responded_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center">
        <Inbox className="w-8 h-8 text-slate-300" />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-slate-700 mb-1">Обращений пока нет</p>
        <p className="text-sm text-slate-400 max-w-xs">
          Система уведомит вас, когда появится заявка, подходящая под вашу специализацию и регион
        </p>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-5 w-5 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="flex items-center gap-3 py-12 text-sm text-slate-400">
      <div className="h-4 w-4 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
      Загрузка ваших обращений…
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 max-w-xl">
      <p className="text-sm font-semibold text-red-700 mb-1">Ошибка загрузки</p>
      <p className="text-xs text-red-600 font-mono">{message}</p>
    </div>
  );
}
