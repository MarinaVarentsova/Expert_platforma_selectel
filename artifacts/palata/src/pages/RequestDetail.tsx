import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { supabase } from "@/lib/supabaseClient";

// ─── Types ───────────────────────────────────────────────────────────────────

type Request = {
  id: string;
  customer_id: string;
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
  assigned_expert_id: string | null;
  created_at: string;
  updated_at: string;
};

type RequestFile = {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
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
  bio: string | null;
  business_trip_ready: boolean;
  palata_registry_verified: boolean;
  centrsudexpert_verified: boolean;
  avg_customer_rating: number | null;
  completed_orders_count: number;
};

type StatusEvent = {
  id: string;
  entity_type: string;
  old_status: string | null;
  new_status: string;
  actor_id: string | null;
  note: string | null;
  created_at: string;
};

type User = {
  id: string;
  full_name: string | null;
  email: string;
};

type LoadedData = {
  request: Request;
  files: RequestFile[];
  matches: Match[];
  expertProfiles: ExpertProfile[];
  events: StatusEvent[];
  usersMap: Record<string, User>;
};

type State =
  | { kind: "loading" }
  | { kind: "ok"; data: LoadedData }
  | { kind: "error"; message: string }
  | { kind: "not_found" };

// ─── Labels & colors ─────────────────────────────────────────────────────────

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  draft:       { label: "Черновик",       cls: "bg-slate-100 text-slate-600" },
  pending:     { label: "Ожидает",        cls: "bg-yellow-100 text-yellow-700" },
  matching:    { label: "Идёт подбор",    cls: "bg-blue-100 text-blue-700" },
  in_progress: { label: "В работе",       cls: "bg-indigo-100 text-indigo-700" },
  completed:   { label: "Выполнен",       cls: "bg-green-100 text-green-700" },
  cancelled:   { label: "Отменён",        cls: "bg-slate-100 text-slate-500" },
  failed:      { label: "Ошибка подбора", cls: "bg-red-100 text-red-600" },
};

const MATCH_STATUS: Record<string, { label: string; cls: string }> = {
  proposed:  { label: "Предложено", cls: "bg-yellow-100 text-yellow-700" },
  accepted:  { label: "Принято",    cls: "bg-green-100 text-green-700" },
  declined:  { label: "Отказ",      cls: "bg-red-100 text-red-600" },
  completed: { label: "Завершено",  cls: "bg-emerald-100 text-emerald-700" },
  withdrawn: { label: "Отозвано",   cls: "bg-slate-100 text-slate-500" },
};

const DECLINE_REASON: Record<string, string> = {
  busy:          "Занят",
  not_competent: "Вне компетенции",
  location:      "Регион",
  conflict:      "Конфликт интересов",
  conditions:    "Условия не подходят",
  other:         "Другое",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(date: string) {
  return new Date(date).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDate(date: string) {
  return new Date(date).toLocaleDateString("ru-RU");
}

function fmtSize(bytes: number | null) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function mimeIcon(mime: string | null): string {
  if (!mime) return "📄";
  if (mime.startsWith("image/")) return "🖼️";
  if (mime === "application/pdf") return "📕";
  if (mime.includes("word") || mime.includes("document")) return "📝";
  if (mime.includes("excel") || mime.includes("spreadsheet")) return "📊";
  if (mime.includes("zip") || mime.includes("rar")) return "🗜️";
  return "📄";
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!id) { setState({ kind: "not_found" }); return; }

    async function load() {
      // First wave — parallel fetches that don't depend on each other
      const [reqRes, filesRes, matchesRes, eventsRes] = await Promise.all([
        supabase.from("palata_requests").select("*").eq("id", id!).single(),
        supabase.from("palata_request_files")
          .select("id, file_name, mime_type, size_bytes, created_at")
          .eq("request_id", id!)
          .order("created_at"),
        supabase.from("palata_request_matches")
          .select("id, expert_id, matching_round, status, decline_reason, decline_note, proposed_at, responded_at")
          .eq("request_id", id!)
          .order("matching_round")
          .order("proposed_at"),
        supabase.from("palata_status_events")
          .select("id, entity_type, old_status, new_status, actor_id, note, created_at")
          .eq("entity_id", id!)
          .order("created_at"),
      ]);

      if (!reqRes.data || reqRes.error) {
        setState(
          reqRes.error?.code === "PGRST116"
            ? { kind: "not_found" }
            : { kind: "error", message: reqRes.error?.message ?? "Неизвестная ошибка" }
        );
        return;
      }

      const request = reqRes.data as Request;
      const matches = (matchesRes.data as Match[]) ?? [];
      const events = (eventsRes.data as StatusEvent[]) ?? [];
      const files = (filesRes.data as RequestFile[]) ?? [];

      // Second wave — need request + matches to know which user IDs to fetch
      const expertIds = [...new Set(matches.map(m => m.expert_id))];
      const actorIds = events.map(e => e.actor_id).filter(Boolean) as string[];
      const userIds = [...new Set([request.customer_id, ...expertIds, ...actorIds])];

      const [profilesRes, usersRes] = await Promise.all([
        expertIds.length > 0
          ? supabase.from("palata_expert_profiles")
              .select("user_id, specializations, regions, experience_years, bio, business_trip_ready, palata_registry_verified, centrsudexpert_verified, avg_customer_rating, completed_orders_count")
              .in("user_id", expertIds)
          : Promise.resolve({ data: [] as ExpertProfile[], error: null }),
        userIds.length > 0
          ? supabase.from("palata_users")
              .select("id, full_name, email")
              .in("id", userIds)
          : Promise.resolve({ data: [] as User[], error: null }),
      ]);

      const expertProfiles = (profilesRes.data as ExpertProfile[]) ?? [];
      const users = (usersRes.data as User[]) ?? [];
      const usersMap = Object.fromEntries(users.map(u => [u.id, u]));

      setState({ kind: "ok", data: { request, files, matches, expertProfiles, events, usersMap } });
    }

    load();
  }, [id]);

  if (state.kind === "loading") return <Shell><Spinner /></Shell>;
  if (state.kind === "not_found") return <Shell><Empty text="Заявка не найдена" /></Shell>;
  if (state.kind === "error") return <Shell><ErrorMsg text={state.message} /></Shell>;

  return <Shell><Detail data={state.data} /></Shell>;
}

// ─── Shell ────────────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <button
        onClick={() => window.history.back()}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors"
      >
        ← Назад
      </button>
      {children}
    </div>
  );
}

// ─── Detail layout ────────────────────────────────────────────────────────────

function Detail({ data }: { data: LoadedData }) {
  const { request: r, files, matches, expertProfiles, events, usersMap } = data;
  const profileMap = Object.fromEntries(expertProfiles.map(p => [p.user_id, p]));
  const orderStatus = ORDER_STATUS[r.status];
  const customer = usersMap[r.customer_id];

  return (
    <div className="space-y-6">

      {/* ── 1. Основная информация ────────────────────────────────────────── */}
      <Card>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-slate-400 mb-1">#{shortId(r.id)}</p>
            <h1 className="text-xl font-bold text-slate-800 leading-snug">{r.title}</h1>
          </div>
          <span className={`shrink-0 inline-block rounded-full px-3 py-1 text-xs font-semibold ${orderStatus?.cls ?? "bg-slate-100 text-slate-500"}`}>
            {orderStatus?.label ?? r.status}
          </span>
        </div>

        {/* Description */}
        {r.description ? (
          <div className="mb-5 p-4 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Описание ситуации</p>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{r.description}</p>
          </div>
        ) : (
          <div className="mb-5 p-4 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-xs text-slate-400 italic">Описание не указано</p>
          </div>
        )}

        {/* Fields grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
          <Field label="Заказчик">
            {customer?.full_name
              ? customer.full_name
              : customer?.email
                ? <span className="font-mono text-xs">{customer.email}</span>
                : <span className="text-slate-400 italic">Нет данных</span>}
          </Field>
          <Field label="Направление экспертизы">{r.expertise_type}</Field>
          <Field label="Регион">{r.region}</Field>
          <Field label="Дата создания">{fmtDate(r.created_at)}</Field>
          <Field label="Последнее обновление">{fmtDate(r.updated_at)}</Field>
          <Field label="Раунд подбора">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-5 h-5 rounded-full bg-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center">
                {r.matching_round}
              </span>
            </span>
          </Field>
          {(r.budget_min != null || r.budget_max != null) && (
            <Field label="Бюджет">
              {r.budget_min != null && r.budget_max != null
                ? `${r.budget_min.toLocaleString("ru-RU")} – ${r.budget_max.toLocaleString("ru-RU")} ₽`
                : r.budget_min != null
                  ? `от ${r.budget_min.toLocaleString("ru-RU")} ₽`
                  : `до ${r.budget_max!.toLocaleString("ru-RU")} ₽`}
            </Field>
          )}
          {r.deadline && (
            <Field label="Срок выполнения">{fmtDate(r.deadline)}</Field>
          )}
          {r.preferred_start && (
            <Field label="Желаемый старт">{fmtDate(r.preferred_start)}</Field>
          )}
        </div>
      </Card>

      {/* ── 2. Документы ─────────────────────────────────────────────────── */}
      <Card title={`Документы`} count={files.length}>
        {files.length === 0 ? (
          <Empty text="Файлы не загружены" />
        ) : (
          <div className="divide-y divide-slate-50 -mx-6 -mb-6">
            {files.map((f) => (
              <div key={f.id} className="px-6 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                <span className="text-xl shrink-0">{mimeIcon(f.mime_type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{f.file_name}</p>
                  <p className="text-xs text-slate-400">
                    {f.mime_type ?? "неизвестный тип"} · {fmtSize(f.size_bytes)}
                  </p>
                </div>
                <p className="text-xs text-slate-400 shrink-0">{fmtDate(f.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── 3. Подобранные эксперты ──────────────────────────────────────── */}
      <Card title="Подобранные эксперты" count={matches.length}>
        {matches.length === 0 ? (
          <Empty text="Эксперты ещё не подбирались" />
        ) : (
          <div className="space-y-4">
            {matches.map((m) => {
              const profile = profileMap[m.expert_id];
              const user = usersMap[m.expert_id];
              const ms = MATCH_STATUS[m.status];
              return (
                <div key={m.id} className="rounded-lg border border-slate-200 overflow-hidden">
                  {/* Expert header */}
                  <div className="px-4 py-3 bg-slate-50 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-slate-500">
                          {(user?.full_name ?? user?.email ?? "?")[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {user?.full_name ?? user?.email ?? (
                            <span className="font-mono text-xs text-slate-400">{m.expert_id.slice(0, 12)}…</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400">Раунд {m.matching_round}</p>
                      </div>
                    </div>
                    <span className={`shrink-0 inline-block rounded px-2 py-0.5 text-xs font-medium ${ms?.cls ?? "bg-slate-100 text-slate-500"}`}>
                      {ms?.label ?? m.status}
                    </span>
                  </div>

                  {/* Expert profile details */}
                  {profile ? (
                    <div className="px-4 py-3 space-y-3">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                        {profile.specializations.length > 0 && (
                          <Field label="Направления экспертиз">
                            {profile.specializations.join(", ")}
                          </Field>
                        )}
                        {profile.regions.length > 0 && (
                          <Field label="Регионы работы">
                            {profile.regions.join(", ")}
                          </Field>
                        )}
                        {profile.experience_years != null && (
                          <Field label="Опыт">{profile.experience_years} лет</Field>
                        )}
                        {profile.avg_customer_rating != null && (
                          <Field label="Рейтинг">
                            <span className="text-amber-500">{"★".repeat(Math.round(profile.avg_customer_rating))}</span>
                            <span className="text-slate-400 ml-1 text-xs">{profile.avg_customer_rating} / 5</span>
                          </Field>
                        )}
                        <Field label="Выполнено заказов">{profile.completed_orders_count}</Field>
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {profile.palata_registry_verified && (
                          <Badge color="blue" icon="✓">Реестр Палаты СЭ</Badge>
                        )}
                        {profile.centrsudexpert_verified && (
                          <Badge color="indigo" icon="✓">Центр судэксперт</Badge>
                        )}
                        {profile.business_trip_ready && (
                          <Badge color="teal" icon="✈">Готов к командировкам</Badge>
                        )}
                        {!profile.business_trip_ready && (
                          <Badge color="slate" icon="—">Без командировок</Badge>
                        )}
                      </div>

                      {/* Bio */}
                      {profile.bio && (
                        <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-2">{profile.bio}</p>
                      )}
                    </div>
                  ) : (
                    <div className="px-4 py-3">
                      <p className="text-xs text-slate-400 italic">Профиль эксперта не найден</p>
                    </div>
                  )}

                  {/* Decline reason */}
                  {m.decline_reason && (
                    <div className="px-4 py-2.5 bg-red-50 border-t border-red-100 flex items-start gap-2">
                      <span className="text-red-400 text-xs mt-0.5">✗</span>
                      <div>
                        <p className="text-xs font-medium text-red-700">
                          Причина отказа: {DECLINE_REASON[m.decline_reason] ?? m.decline_reason}
                        </p>
                        {m.decline_note && (
                          <p className="text-xs text-red-600 mt-0.5">{m.decline_note}</p>
                        )}
                      </div>
                      {m.responded_at && (
                        <p className="ml-auto text-xs text-red-300 shrink-0">{fmtDate(m.responded_at)}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── 4. История событий ───────────────────────────────────────────── */}
      <Card title="История событий" count={events.length}>
        {events.length === 0 ? (
          <Empty text="Событий пока не зафиксировано" />
        ) : (
          <div className="relative -mx-6 -mb-6">
            {/* Timeline line */}
            <div className="absolute left-9 top-0 bottom-0 w-px bg-slate-100" />

            {events.map((e, idx) => {
              const actor = e.actor_id ? usersMap[e.actor_id] : null;
              const isLast = idx === events.length - 1;
              return (
                <div key={e.id} className={`px-6 py-4 flex items-start gap-4 ${!isLast ? "border-b border-slate-50" : ""}`}>
                  {/* Dot */}
                  <div className="shrink-0 mt-0.5 flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-slate-300 border-2 border-white ring-1 ring-slate-200 z-10" />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Status transition */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      {e.old_status && (
                        <>
                          <StatusPill status={e.old_status} />
                          <span className="text-slate-300 text-xs">→</span>
                        </>
                      )}
                      <StatusPill status={e.new_status} highlight />
                    </div>

                    {/* Actor + note */}
                    <p className="text-xs text-slate-400">
                      {actor
                        ? (actor.full_name ?? actor.email)
                        : "Система"}
                      {e.entity_type !== "request" && (
                        <span className="ml-1 text-slate-300">· {e.entity_type}</span>
                      )}
                    </p>
                    {e.note && (
                      <p className="text-xs text-slate-500 mt-1 italic">{e.note}</p>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 shrink-0 pt-0.5">{fmt(e.created_at)}</p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

    </div>
  );
}

// ─── Small shared components ──────────────────────────────────────────────────

function Card({
  title,
  count,
  children,
}: {
  title?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      {title && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          {count != null && (
            <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{count}</span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm text-slate-700 font-medium leading-snug">{children}</p>
    </div>
  );
}

function Badge({ color, icon, children }: { color: string; icon: string; children: React.ReactNode }) {
  const cls: Record<string, string> = {
    blue:   "bg-blue-50 text-blue-700 border-blue-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    teal:   "bg-teal-50 text-teal-700 border-teal-200",
    slate:  "bg-slate-50 text-slate-500 border-slate-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-xs font-medium ${cls[color] ?? cls.slate}`}>
      <span className="text-[10px]">{icon}</span>
      {children}
    </span>
  );
}

function StatusPill({ status, highlight }: { status: string; highlight?: boolean }) {
  const s = ORDER_STATUS[status] ?? MATCH_STATUS[status];
  if (s) {
    return (
      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${highlight ? s.cls : "bg-slate-100 text-slate-500"}`}>
        {s.label}
      </span>
    );
  }
  return (
    <span className="inline-block rounded px-2 py-0.5 text-xs font-mono bg-slate-100 text-slate-500">
      {status}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-slate-400 text-center py-6 italic">{text}</p>;
}

function Spinner() {
  return <p className="text-sm text-slate-400 py-8 text-center">Загрузка…</p>;
}

function ErrorMsg({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5">
      <p className="text-sm font-semibold text-red-700 mb-1">Ошибка загрузки</p>
      <p className="text-xs text-red-600">{text}</p>
    </div>
  );
}
