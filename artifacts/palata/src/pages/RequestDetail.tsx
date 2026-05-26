import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { supabase } from "@/lib/supabaseClient";

type Request = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  expertise_type: string;
  region: string;
  matching_round: number;
  budget_min: number | null;
  budget_max: number | null;
  deadline: string | null;
  preferred_start: string | null;
  created_at: string;
  updated_at: string;
};

type Match = {
  id: string;
  expert_id: string;
  matching_round: number;
  status: string;
  decline_reason: string | null;
  decline_note: string | null;
  proposed_at: string;
  responded_at: string | null;
};

type ExpertProfile = {
  user_id: string;
  specializations: string[];
  regions: string[];
  experience_years: number | null;
  status: string;
  palata_registry_verified: boolean;
  centrsudexpert_verified: boolean;
  avg_customer_rating: number | null;
  completed_orders_count: number;
};

type State =
  | { kind: "loading" }
  | { kind: "ok"; request: Request; matches: Match[]; experts: ExpertProfile[] }
  | { kind: "error"; message: string }
  | { kind: "not_found" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Черновик", pending: "Ожидает", matching: "Идёт подбор",
  in_progress: "В работе", completed: "Выполнен", cancelled: "Отменён", failed: "Ошибка",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600", pending: "bg-yellow-100 text-yellow-700",
  matching: "bg-blue-100 text-blue-700", in_progress: "bg-indigo-100 text-indigo-700",
  completed: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-600",
  failed: "bg-red-100 text-red-600",
};
const MATCH_LABEL: Record<string, string> = {
  proposed: "Предложено", accepted: "Принято", declined: "Отказ",
  completed: "Завершено", withdrawn: "Отозвано",
};
const MATCH_COLOR: Record<string, string> = {
  proposed: "bg-yellow-100 text-yellow-700", accepted: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-600", completed: "bg-green-100 text-green-700",
  withdrawn: "bg-slate-100 text-slate-500",
};
const DECLINE_LABEL: Record<string, string> = {
  busy: "Занят", not_competent: "Вне компетенции", location: "Регион",
  conflict: "Конфликт интересов", conditions: "Условия", other: "Другое",
};

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!id) { setState({ kind: "not_found" }); return; }

    async function load() {
      const [reqRes, matchRes] = await Promise.all([
        supabase.from("palata_requests").select("*").eq("id", id!).single(),
        supabase.from("palata_request_matches")
          .select("id, expert_id, matching_round, status, decline_reason, decline_note, proposed_at, responded_at")
          .eq("request_id", id!)
          .order("matching_round")
          .order("proposed_at"),
      ]);

      if (reqRes.error || !reqRes.data) {
        setState({ kind: reqRes.error?.code === "PGRST116" ? "not_found" : "error", message: reqRes.error?.message ?? "" } as State);
        return;
      }

      const matches = (matchRes.data as Match[]) ?? [];
      const expertIds = [...new Set(matches.map(m => m.expert_id))];

      let experts: ExpertProfile[] = [];
      if (expertIds.length > 0) {
        const { data } = await supabase
          .from("palata_expert_profiles")
          .select("user_id, specializations, regions, experience_years, status, palata_registry_verified, centrsudexpert_verified, avg_customer_rating, completed_orders_count")
          .in("user_id", expertIds);
        experts = (data as ExpertProfile[]) ?? [];
      }

      setState({ kind: "ok", request: reqRes.data as Request, matches, experts });
    }

    load();
  }, [id]);

  if (state.kind === "loading") return <PageShell><p className="text-slate-400 text-sm">Загрузка…</p></PageShell>;
  if (state.kind === "not_found") return <PageShell><p className="text-slate-500 text-sm">Заявка не найдена.</p></PageShell>;
  if (state.kind === "error") return <PageShell><p className="text-red-600 text-sm">Ошибка: {state.message}</p></PageShell>;

  const { request: r, matches, experts } = state;
  const expertMap = Object.fromEntries(experts.map(e => [e.user_id, e]));

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      {/* Back */}
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors">
        ← Все заявки
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h1 className="text-xl font-bold text-slate-800 leading-snug">{r.title}</h1>
          <span className={`shrink-0 inline-block rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLOR[r.status] ?? "bg-slate-100 text-slate-500"}`}>
            {STATUS_LABEL[r.status] ?? r.status}
          </span>
        </div>

        {r.description && (
          <p className="text-sm text-slate-600 leading-relaxed mb-4">{r.description}</p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <Field label="Вид экспертизы" value={r.expertise_type} />
          <Field label="Регион" value={r.region} />
          <Field label="Раунд подбора" value={String(r.matching_round)} />
          <Field label="Создана" value={new Date(r.created_at).toLocaleDateString("ru-RU")} />
          {r.budget_min != null && (
            <Field label="Бюджет от" value={`${r.budget_min.toLocaleString("ru-RU")} ₽`} />
          )}
          {r.budget_max != null && (
            <Field label="Бюджет до" value={`${r.budget_max.toLocaleString("ru-RU")} ₽`} />
          )}
          {r.deadline && (
            <Field label="Дедлайн" value={new Date(r.deadline).toLocaleDateString("ru-RU")} />
          )}
          {r.preferred_start && (
            <Field label="Желаемый старт" value={new Date(r.preferred_start).toLocaleDateString("ru-RU")} />
          )}
        </div>
      </div>

      {/* Match history */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">История подбора</h2>
          <span className="text-xs text-slate-400">{matches.length} запись</span>
        </div>

        {matches.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-400 text-center">Матчи не найдены</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {matches.map((m) => {
              const exp = expertMap[m.expert_id];
              return (
                <div key={m.id} className="px-6 py-4 flex items-start gap-4 hover:bg-slate-50 transition-colors">
                  <div className="shrink-0 mt-0.5">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${MATCH_COLOR[m.status] ?? "bg-slate-100 text-slate-500"}`}>
                      {MATCH_LABEL[m.status] ?? m.status}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    {exp ? (
                      <>
                        <p className="text-sm font-medium text-slate-800 mb-0.5">
                          {exp.specializations.join(", ")}
                          {exp.experience_years ? ` · ${exp.experience_years} лет` : ""}
                        </p>
                        <p className="text-xs text-slate-500">
                          {exp.regions.join(", ")}
                          {exp.avg_customer_rating != null && ` · ★ ${exp.avg_customer_rating}`}
                          {exp.palata_registry_verified && " · Реестр ПСЭ"}
                          {exp.centrsudexpert_verified && " · ЦСЭ"}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-slate-400 font-mono">{m.expert_id}</p>
                    )}

                    {m.decline_reason && (
                      <p className="text-xs text-red-500 mt-1">
                        Причина отказа: {DECLINE_LABEL[m.decline_reason] ?? m.decline_reason}
                        {m.decline_note ? ` — ${m.decline_note}` : ""}
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xs text-slate-400">Раунд {m.matching_round}</p>
                    {m.responded_at && (
                      <p className="text-xs text-slate-300 mt-0.5">
                        {new Date(m.responded_at).toLocaleDateString("ru-RU")}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm text-slate-700 font-medium">{value}</p>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-4xl mx-auto px-6 py-16 text-center">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-8 transition-colors">
        ← Все заявки
      </Link>
      {children}
    </div>
  );
}
