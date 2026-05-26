import { useEffect, useState } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";
import { KanbanBoard } from "@/components/KanbanBoard";
import { PlusCircle, FileText } from "lucide-react";

type Request = {
  id: string;
  title: string;
  status: string;
  expertise_type: string;
  region: string;
  matching_round: number;
  urgency: string | null;
  created_at: string;
};

type State =
  | { kind: "loading" }
  | { kind: "ok"; rows: Request[] }
  | { kind: "error"; message: string };

const COLUMNS = [
  {
    id: "new",
    label: "Новый",
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
    statuses: ["pending"],
  },
  {
    id: "matching",
    label: "Выбор эксперта",
    dotColor: "bg-cyan-400",
    bgColor: "bg-cyan-50/60 border-cyan-200",
    accent: "",
    statuses: ["matching", "expert_selection"],
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
    id: "done",
    label: "Выполнен",
    dotColor: "bg-emerald-400",
    bgColor: "bg-emerald-50/60 border-emerald-200",
    accent: "",
    statuses: ["completed"],
  },
  {
    id: "closed",
    label: "Неактуален",
    dotColor: "bg-slate-300",
    bgColor: "bg-slate-50 border-slate-200",
    accent: "",
    statuses: ["cancelled", "failed"],
  },
];

export default function CustomerDashboard() {
  const guard = useRequireRole("customer");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (guard.status !== "ok") return;
    const userId = guard.user.id;

    supabase
      .from("palata_requests")
      .select("id, title, status, expertise_type, region, matching_round, urgency, created_at")
      .eq("customer_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) { setState({ kind: "error", message: error.message }); return; }
        setState({ kind: "ok", rows: (data as Request[]) ?? [] });
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

  const total = state.kind === "ok" ? state.rows.length : null;

  return (
    <div className="px-6 py-8 max-w-[1400px]">

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Личный кабинет</p>
          <h1 className="text-xl font-bold text-slate-900">Мои заказы</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {user.full_name ?? user.email}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {total != null && (
            <div className="text-right mr-2">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Всего</p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{total}</p>
            </div>
          )}
          <Link href="/customer/new-request">
            <button className="btn-primary inline-flex items-center gap-2">
              <PlusCircle className="w-4 h-4" />
              Создать заказ
            </button>
          </Link>
        </div>
      </div>

      {state.kind === "loading" && <LoadingRows />}
      {state.kind === "error" && <ErrorCard message={state.message} />}

      {state.kind === "ok" && state.rows.length === 0 && (
        <EmptyState />
      )}

      {state.kind === "ok" && state.rows.length > 0 && (
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
  const urgencyLabel: Record<string, string> = {
    urgent: "Срочно",
    very_urgent: "Очень срочно",
  };

  return (
    <Link href={`/requests/${r.id}`}>
      <div className="bg-white rounded-xl border border-slate-100 border-l-[3px] border-l-indigo-200 p-3.5 hover:shadow-md hover:border-indigo-100 hover:border-l-indigo-400 transition-all cursor-pointer group shadow-sm">
        <p className="text-xs font-semibold text-slate-800 leading-snug mb-2 line-clamp-2 group-hover:text-indigo-700 transition-colors">
          {r.title}
        </p>

        <div className="space-y-1 mb-2.5">
          {r.expertise_type && (
            <p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
              <span className="inline-block h-1 w-1 rounded-full bg-indigo-300 flex-shrink-0" />
              {r.expertise_type}
            </p>
          )}
          {r.region && (
            <p className="text-[11px] text-slate-400 truncate">{r.region}</p>
          )}
          {r.urgency && r.urgency !== "normal" && (
            <span className="inline-block text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
              {urgencyLabel[r.urgency] ?? r.urgency}
            </span>
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center">
        <FileText className="w-8 h-8 text-indigo-300" />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-slate-700 mb-1">Заказов пока нет</p>
        <p className="text-sm text-slate-400 mb-6 max-w-xs">
          Подайте заявку на судебную экспертизу — система автоматически подберёт квалифицированного эксперта
        </p>
        <Link href="/customer/new-request">
          <button className="btn-primary inline-flex items-center gap-2">
            <PlusCircle className="w-4 h-4" />
            Создать первый заказ
          </button>
        </Link>
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
      Загрузка ваших заказов…
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
