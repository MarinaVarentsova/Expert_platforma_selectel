import { useCallback, useEffect, useState } from "react";
import { useParams } from "wouter";
import { supabase } from "@/lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

type Request = {
  id: string;
  customer_id: string | null;
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
  requires_travel: boolean;
  urgency: string;
  materials_available: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
};

type RequestFile = {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  bucket_path: string | null;
  created_at: string;
};

type Match = {
  id: string;
  expert_id: string;
  matching_round: number;
  status: string;
  decline_reason: string | null;
  decline_note: string | null;
  can_start_from_date: string | null;
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
  palata_registry_number: string | null;
  centrsudexpert_verified: boolean;
  centrsudexpert_registry_number: string | null;
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

type PageState =
  | { kind: "loading" }
  | { kind: "ok"; data: LoadedData }
  | { kind: "error"; message: string }
  | { kind: "not_found" };

// Per-match inline action state
type MatchUIState =
  | { kind: "idle" }
  | { kind: "date_picker"; date: string }
  | { kind: "decline_form"; reason: string; note: string }
  | { kind: "submitting" }
  | { kind: "error"; message: string };

// Customer panel state
type CustUIState =
  | { kind: "idle" }
  | { kind: "open_contacts"; selectedMatchId: string }
  | { kind: "submitting" }
  | { kind: "error"; message: string };

// ─── Labels & colors ──────────────────────────────────────────────────────────

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  new:              { label: "Новый",           cls: "bg-slate-100 text-slate-600" },
  draft:            { label: "Черновик",        cls: "bg-slate-100 text-slate-500" },
  pending:          { label: "Ожидает",         cls: "bg-yellow-100 text-yellow-700" },
  matching:         { label: "Идёт подбор",     cls: "bg-blue-100 text-blue-700" },
  expert_selection: { label: "Выбор эксперта",  cls: "bg-cyan-100 text-cyan-700" },
  in_work:          { label: "В работе",         cls: "bg-indigo-100 text-indigo-700" },
  in_progress:      { label: "В работе",         cls: "bg-indigo-100 text-indigo-700" },
  completed:        { label: "Выполнен",         cls: "bg-green-100 text-green-700" },
  cancelled:        { label: "Неактуален",       cls: "bg-slate-100 text-slate-500" },
  failed:           { label: "Ошибка подбора",   cls: "bg-red-100 text-red-600" },
};

const MATCH_STATUS: Record<string, { label: string; cls: string }> = {
  proposed:               { label: "Предложено",          cls: "bg-yellow-100 text-yellow-700" },
  can_start_from:         { label: "Может взять",          cls: "bg-teal-100 text-teal-700" },
  contacts_opened:        { label: "Контакты открыты",     cls: "bg-cyan-100 text-cyan-700" },
  accepted:               { label: "Принято",              cls: "bg-green-100 text-green-700" },
  accepted_work:          { label: "Взял в работу",        cls: "bg-indigo-100 text-indigo-700" },
  declined:               { label: "Отказ",                cls: "bg-red-100 text-red-600" },
  completed:              { label: "Завершено",            cls: "bg-emerald-100 text-emerald-700" },
  withdrawn:              { label: "Отозвано",             cls: "bg-slate-100 text-slate-500" },
  closed_by_other_expert: { label: "Закрыт другим",        cls: "bg-slate-100 text-slate-400" },
};

const URGENCY_LABEL: Record<string, string> = {
  normal: "Стандартная", urgent: "Срочная", very_urgent: "Очень срочная",
};

const DECLINE_REASONS: { value: string; label: string }[] = [
  { value: "busy",          label: "Занят" },
  { value: "not_competent", label: "Вне компетенции" },
  { value: "location",      label: "Регион не подходит" },
  { value: "conflict",      label: "Конфликт интересов" },
  { value: "conditions",    label: "Условия не подходят" },
  { value: "other",         label: "Другое" },
];

// Matches eligible for customer contact-opening
const ACTIVE_MATCH_STATUSES = new Set(["proposed", "can_start_from", "contacts_opened", "accepted", "accepted_work"]);
// Matches where expert can still act
const EXPERT_CAN_ACT = new Set(["proposed", "can_start_from", "contacts_opened", "accepted", "accepted_work"]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
function shortId(id: string) { return id.slice(0, 8).toUpperCase(); }
function mimeIcon(mime: string | null): string {
  if (!mime) return "FILE";
  if (mime.startsWith("image/")) return "IMG";
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("word") || mime.includes("document")) return "DOC";
  if (mime.includes("excel") || mime.includes("spreadsheet")) return "XLS";
  return "FILE";
}
function filePublicUrl(bucketPath: string): string {
  return supabase.storage.from("palata-request-files").getPublicUrl(bucketPath).data.publicUrl;
}
function userName(u: User | undefined) {
  return u?.full_name ?? u?.email ?? null;
}

async function logEvent(
  entityType: string, entityId: string,
  oldStatus: string | null, newStatus: string,
  note?: string,
) {
  await supabase.from("palata_status_events").insert({
    entity_type: entityType, entity_id: entityId,
    old_status: oldStatus ?? null, new_status: newStatus,
    actor_id: null, note: note ?? null,
  });
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const [loadKey, setLoadKey] = useState(0);
  const [state, setState] = useState<PageState>({ kind: "loading" });

  const reload = useCallback(() => {
    setState({ kind: "loading" });
    setLoadKey(k => k + 1);
  }, []);

  useEffect(() => {
    if (!id) { setState({ kind: "not_found" }); return; }
    setState({ kind: "loading" });

    async function load() {
      const [reqRes, filesRes, matchesRes, eventsRes] = await Promise.all([
        supabase.from("palata_requests").select("*").eq("id", id!).single(),
        supabase.from("palata_request_files")
          .select("id, file_name, mime_type, size_bytes, bucket_path, created_at")
          .eq("request_id", id!).order("created_at"),
        supabase.from("palata_request_matches")
          .select("id, expert_id, matching_round, status, decline_reason, decline_note, can_start_from_date, proposed_at, responded_at")
          .eq("request_id", id!).order("matching_round").order("proposed_at"),
        supabase.from("palata_status_events")
          .select("id, entity_type, old_status, new_status, actor_id, note, created_at")
          .eq("entity_id", id!).order("created_at"),
      ]);

      if (!reqRes.data || reqRes.error) {
        setState(reqRes.error?.code === "PGRST116"
          ? { kind: "not_found" }
          : { kind: "error", message: reqRes.error?.message ?? "Неизвестная ошибка" });
        return;
      }

      const request = reqRes.data as Request;
      const matches = (matchesRes.data as Match[]) ?? [];
      const events = (eventsRes.data as StatusEvent[]) ?? [];
      const files = (filesRes.data as RequestFile[]) ?? [];

      const expertIds = [...new Set(matches.map(m => m.expert_id))];
      const actorIds = events.map(e => e.actor_id).filter(Boolean) as string[];
      const userIds = [...new Set(
        [request.customer_id, ...expertIds, ...actorIds].filter((id): id is string => id != null)
      )];

      const [profilesRes, usersRes] = await Promise.all([
        expertIds.length > 0
          ? supabase.from("palata_expert_profiles")
              .select("user_id, specializations, regions, experience_years, bio, business_trip_ready, palata_registry_verified, palata_registry_number, centrsudexpert_verified, centrsudexpert_registry_number, avg_customer_rating, completed_orders_count")
              .in("user_id", expertIds)
          : Promise.resolve({ data: [] as ExpertProfile[], error: null }),
        userIds.length > 0
          ? supabase.from("palata_users").select("id, full_name, email").in("id", userIds)
          : Promise.resolve({ data: [] as User[], error: null }),
      ]);

      const expertProfiles = (profilesRes.data as ExpertProfile[]) ?? [];
      const users = (usersRes.data as User[]) ?? [];
      const usersMap = Object.fromEntries(users.map(u => [u.id, u]));

      setState({ kind: "ok", data: { request, files, matches, expertProfiles, events, usersMap } });
    }

    load();
  }, [id, loadKey]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <button
        onClick={() => window.history.back()}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors"
      >
        ← Назад
      </button>
      {state.kind === "loading" && <p className="text-sm text-slate-400 py-10 text-center">Загрузка…</p>}
      {state.kind === "not_found" && <p className="text-sm text-slate-400 py-10 text-center italic">Заявка не найдена</p>}
      {state.kind === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-semibold text-red-700 mb-1">Ошибка загрузки</p>
          <p className="text-xs text-red-600">{state.message}</p>
        </div>
      )}
      {state.kind === "ok" && (
        <Detail data={state.data} onReload={reload} />
      )}
    </div>
  );
}

// ─── Detail ───────────────────────────────────────────────────────────────────

function Detail({ data, onReload }: { data: LoadedData; onReload: () => void }) {
  const { request: r, files, matches, expertProfiles, events, usersMap } = data;
  const profileMap = Object.fromEntries(expertProfiles.map(p => [p.user_id, p]));
  const customer = r.customer_id ? usersMap[r.customer_id] : undefined;
  const orderStatus = ORDER_STATUS[r.status];

  // ── Customer action state ──────────────────────────────────────────────────
  const [custUI, setCustUI] = useState<CustUIState>({ kind: "idle" });

  async function handleOpenContacts() {
    const { selectedMatchId } = custUI as { selectedMatchId: string };
    const match = matches.find(m => m.id === selectedMatchId);
    if (!match) return;
    setCustUI({ kind: "submitting" });
    try {
      // 1. Check if contact record exists, create if not
      const { data: existing } = await supabase
        .from("palata_request_contacts")
        .select("id")
        .eq("request_id", r.id)
        .eq("expert_id", match.expert_id)
        .maybeSingle();
      if (!existing) {
        const { error: ce } = await supabase.from("palata_request_contacts").insert({
          request_id: r.id, expert_id: match.expert_id,
        });
        if (ce) throw ce;
      }
      // 2. Update match status
      const { error: me } = await supabase.from("palata_request_matches")
        .update({ status: "contacts_opened", responded_at: new Date().toISOString() })
        .eq("id", match.id);
      if (me) throw me;
      // 3. Update order status if needed
      if (r.status !== "expert_selection" && r.status !== "in_work") {
        const { error: re } = await supabase.from("palata_requests")
          .update({ status: "expert_selection" }).eq("id", r.id);
        if (re) throw re;
        await logEvent("request", r.id, r.status, "expert_selection", "Открыты контакты с экспертом");
      } else {
        await logEvent("match", match.id, match.status, "contacts_opened", "Открыты контакты");
      }
      setCustUI({ kind: "idle" });
      onReload();
    } catch (e: unknown) {
      setCustUI({ kind: "error", message: (e as Error).message ?? "Ошибка" });
    }
  }

  async function handleOrderStatus(newStatus: "completed" | "cancelled") {
    setCustUI({ kind: "submitting" });
    try {
      const { error } = await supabase.from("palata_requests")
        .update({ status: newStatus }).eq("id", r.id);
      if (error) throw error;
      await logEvent("request", r.id, r.status, newStatus);
      setCustUI({ kind: "idle" });
      onReload();
    } catch (e: unknown) {
      setCustUI({ kind: "error", message: (e as Error).message ?? "Ошибка" });
    }
  }

  // ── Per-match action state ─────────────────────────────────────────────────
  const [matchUI, setMatchUI] = useState<Record<string, MatchUIState>>({});

  function getMS(id: string): MatchUIState { return matchUI[id] ?? { kind: "idle" }; }
  function setMS(id: string, s: MatchUIState) { setMatchUI(p => ({ ...p, [id]: s })); }

  async function handleCanStart(match: Match, date: string) {
    setMS(match.id, { kind: "submitting" });
    try {
      const { error } = await supabase.from("palata_request_matches")
        .update({ status: "can_start_from", can_start_from_date: date, responded_at: new Date().toISOString() })
        .eq("id", match.id);
      if (error) throw error;
      await logEvent("match", match.id, match.status, "can_start_from", `Может взять с ${fmtDate(date)}`);
      setMS(match.id, { kind: "idle" });
      onReload();
    } catch (e: unknown) {
      setMS(match.id, { kind: "error", message: (e as Error).message ?? "Ошибка" });
    }
  }

  async function handleDecline(match: Match, reason: string, note: string) {
    if (!reason) { setMS(match.id, { kind: "decline_form", reason: "", note, }); return; }
    setMS(match.id, { kind: "submitting" });
    try {
      const { error } = await supabase.from("palata_request_matches")
        .update({ status: "declined", decline_reason: reason, decline_note: note || null, responded_at: new Date().toISOString() })
        .eq("id", match.id);
      if (error) throw error;
      await logEvent("match", match.id, match.status, "declined", note || undefined);
      setMS(match.id, { kind: "idle" });
      onReload();
    } catch (e: unknown) {
      setMS(match.id, { kind: "error", message: (e as Error).message ?? "Ошибка" });
    }
  }

  async function handleTakeWork(match: Match) {
    setMS(match.id, { kind: "submitting" });
    try {
      // Update this match to accepted_work
      const { error: me } = await supabase.from("palata_request_matches")
        .update({ status: "accepted_work", responded_at: new Date().toISOString() })
        .eq("id", match.id);
      if (me) throw me;
      // Close other matches for this request
      const otherIds = matches
        .filter(m => m.id !== match.id && ACTIVE_MATCH_STATUSES.has(m.status))
        .map(m => m.id);
      if (otherIds.length > 0) {
        await supabase.from("palata_request_matches")
          .update({ status: "closed_by_other_expert" })
          .in("id", otherIds);
      }
      // Update order status
      const { error: re } = await supabase.from("palata_requests")
        .update({ status: "in_work", assigned_expert_id: match.expert_id }).eq("id", r.id);
      if (re) throw re;
      await logEvent("request", r.id, r.status, "in_work", "Эксперт взял в работу");
      setMS(match.id, { kind: "idle" });
      onReload();
    } catch (e: unknown) {
      setMS(match.id, { kind: "error", message: (e as Error).message ?? "Ошибка" });
    }
  }

  async function handleCompleteWork(match: Match) {
    setMS(match.id, { kind: "submitting" });
    try {
      const { error: me } = await supabase.from("palata_request_matches")
        .update({ status: "completed", responded_at: new Date().toISOString() })
        .eq("id", match.id);
      if (me) throw me;
      const { error: re } = await supabase.from("palata_requests")
        .update({ status: "completed" }).eq("id", r.id);
      if (re) throw re;
      await logEvent("request", r.id, r.status, "completed", "Работа завершена экспертом");
      setMS(match.id, { kind: "idle" });
      onReload();
    } catch (e: unknown) {
      setMS(match.id, { kind: "error", message: (e as Error).message ?? "Ошибка" });
    }
  }

  // ── Selectable matches for customer "open contacts" ──
  const selectableMatches = matches.filter(m => ACTIVE_MATCH_STATUSES.has(m.status));
  const isOrderActive = !["completed", "cancelled", "failed"].includes(r.status);

  return (
    <div className="space-y-6">

      {/* ── 1. Основная информация ───────────────────────────────────────── */}
      <Card>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-slate-400 mb-1">#{shortId(r.id)}</p>
            <h1 className="text-xl font-bold text-slate-800 leading-snug">{r.title}</h1>
          </div>
          <span className={`shrink-0 inline-block rounded-full px-3 py-1 text-xs font-semibold ${orderStatus?.cls ?? "bg-slate-100 text-slate-500"}`}>
            {orderStatus?.label ?? r.status}
          </span>
        </div>

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

        {r.materials_available && (
          <div className="mb-5 p-4 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Имеющиеся материалы</p>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{r.materials_available}</p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
          <Field label="Заказчик">
            {customer
              ? (userName(customer) ?? <span className="font-mono text-xs">{customer.email}</span>)
              : r.customer_name
                ? r.customer_name
                : <span className="text-slate-400 italic">Нет данных</span>}
          </Field>
          {r.customer_phone && <Field label="Телефон заказчика">{r.customer_phone}</Field>}
          {r.customer_email && <Field label="Email заказчика">{r.customer_email}</Field>}
          <Field label="Направление экспертизы">{r.expertise_type}</Field>
          <Field label="Регион">{r.region}</Field>
          <Field label="Срочность">{URGENCY_LABEL[r.urgency] ?? r.urgency ?? "Стандартная"}</Field>
          <Field label="Выезд эксперта">{r.requires_travel ? "Требуется" : "Не требуется"}</Field>
          <Field label="Дата создания">{fmtDate(r.created_at)}</Field>
          <Field label="Обновлён">{fmtDate(r.updated_at)}</Field>
          <Field label="Раунд подбора">{r.matching_round}</Field>
          {(r.budget_min != null || r.budget_max != null) && (
            <Field label="Бюджет">
              {r.budget_min != null && r.budget_max != null
                ? `${r.budget_min.toLocaleString("ru-RU")} – ${r.budget_max.toLocaleString("ru-RU")} ₽`
                : r.budget_min != null ? `от ${r.budget_min.toLocaleString("ru-RU")} ₽`
                : `до ${r.budget_max!.toLocaleString("ru-RU")} ₽`}
            </Field>
          )}
          {r.deadline && <Field label="Срок">{fmtDate(r.deadline)}</Field>}
          {r.preferred_start && <Field label="Желаемый старт">{fmtDate(r.preferred_start)}</Field>}
        </div>
      </Card>

      {/* ── Действия заказчика ───────────────────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">Действия заказчика</span>
          <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">тестовый режим</span>
        </div>

        {custUI.kind === "error" && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
            {custUI.message}
            <button className="ml-2 underline" onClick={() => setCustUI({ kind: "idle" })}>Закрыть</button>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-start">
          {/* Open contacts */}
          {isOrderActive && selectableMatches.length > 0 && custUI.kind === "idle" && (
            <button
              className="btn-primary"
              onClick={() => setCustUI({ kind: "open_contacts", selectedMatchId: selectableMatches[0].id })}
            >
              Выбрать эксперта для связи
            </button>
          )}

          {/* Expert selector panel */}
          {custUI.kind === "open_contacts" && (
            <div className="w-full flex flex-wrap items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <select
                className="text-sm border border-blue-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={custUI.selectedMatchId}
                onChange={e => setCustUI({ kind: "open_contacts", selectedMatchId: e.target.value })}
              >
                {selectableMatches.map(m => {
                  const u = usersMap[m.expert_id];
                  return (
                    <option key={m.id} value={m.id}>
                      {userName(u) ?? m.expert_id.slice(0, 8)} — {MATCH_STATUS[m.status]?.label ?? m.status}
                    </option>
                  );
                })}
              </select>
              <button className="btn-primary" onClick={handleOpenContacts}>
                Открыть контакты
              </button>
              <button className="btn-ghost" onClick={() => setCustUI({ kind: "idle" })}>
                Отмена
              </button>
            </div>
          )}

          {custUI.kind === "submitting" && <Spinner inline />}

          {/* Complete order */}
          {isOrderActive && custUI.kind === "idle" && (
            <button
              className="btn-success"
              onClick={() => handleOrderStatus("completed")}
            >
              Перевести в «Выполнен»
            </button>
          )}

          {/* Cancel order */}
          {isOrderActive && custUI.kind === "idle" && (
            <button
              className="btn-danger"
              onClick={() => handleOrderStatus("cancelled")}
            >
              Перевести в «Неактуален»
            </button>
          )}

          {!isOrderActive && (
            <p className="text-xs text-slate-400 italic">Заказ завершён — действия недоступны</p>
          )}
          {isOrderActive && selectableMatches.length === 0 && custUI.kind === "idle" && (
            <p className="text-xs text-slate-400 italic">Нет активных экспертов для выбора</p>
          )}
        </div>
      </Card>

      {/* ── 2. Документы ─────────────────────────────────────────────────── */}
      <Card title="Документы" count={files.length}>
        {files.length === 0 ? <Empty text="Файлы не загружены" /> : (
          <div className="divide-y divide-slate-50 -mx-6 -mb-6">
            {files.map(f => (
              <div key={f.id} className="px-6 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                <span className="text-[10px] font-bold font-mono text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 shrink-0">
                  {mimeIcon(f.mime_type)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{f.file_name}</p>
                  <p className="text-xs text-slate-400">{fmtSize(f.size_bytes)} · {fmtDate(f.created_at)}</p>
                </div>
                {f.bucket_path && (
                  <a
                    href={filePublicUrl(f.bucket_path)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline shrink-0 transition-colors"
                  >
                    Скачать
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── 3. Подобранные эксперты ──────────────────────────────────────── */}
      <Card title="Подобранные эксперты" count={matches.length}>
        {matches.length === 0 ? <Empty text="Эксперты ещё не подбирались" /> : (
          <div className="space-y-4">
            {matches.map(m => {
              const profile = profileMap[m.expert_id];
              const user = usersMap[m.expert_id];
              const ms = MATCH_STATUS[m.status];
              const ui = getMS(m.id);
              const canAct = EXPERT_CAN_ACT.has(m.status);

              return (
                <div key={m.id} className="rounded-lg border border-slate-200 overflow-hidden">
                  {/* Header */}
                  <div className="px-4 py-3 bg-slate-50 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-slate-500">
                          {(userName(user) ?? user?.email ?? "?")[0]?.toUpperCase() ?? "?"}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {userName(user) ?? <span className="font-mono text-xs text-slate-400">{m.expert_id.slice(0, 12)}…</span>}
                        </p>
                        <p className="text-xs text-slate-400">Раунд {m.matching_round}</p>
                      </div>
                    </div>
                    <span className={`shrink-0 inline-block rounded px-2 py-0.5 text-xs font-medium ${ms?.cls ?? "bg-slate-100 text-slate-500"}`}>
                      {ms?.label ?? m.status}
                    </span>
                  </div>

                  {/* Profile fields */}
                  {profile ? (
                    <div className="px-4 py-3 space-y-3">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                        {profile.specializations.length > 0 && (
                          <Field label="Направления экспертиз">{profile.specializations.join(", ")}</Field>
                        )}
                        {profile.regions.length > 0 && (
                          <Field label="Регионы работы">{profile.regions.join(", ")}</Field>
                        )}
                        {profile.experience_years != null && (
                          <Field label="Опыт">{profile.experience_years} лет</Field>
                        )}
                        <Field label="Рейтинг">
                          {profile.avg_customer_rating != null ? (
                            <>
                              <span className="text-amber-500">
                                {"★".repeat(Math.round(profile.avg_customer_rating))}
                                {"☆".repeat(5 - Math.round(profile.avg_customer_rating))}
                              </span>
                              <span className="text-slate-400 ml-1 text-xs">{profile.avg_customer_rating} / 5</span>
                            </>
                          ) : <span className="text-slate-400 italic">Нет оценок</span>}
                        </Field>
                        <Field label="Выполнено заказов">{profile.completed_orders_count}</Field>
                        <Field label="Командировки">
                          {profile.business_trip_ready
                            ? <span className="text-teal-600 font-medium">Готов ✈</span>
                            : <span className="text-slate-400">Без командировок</span>}
                        </Field>
                      </div>
                      <div className="border-t border-slate-100 pt-3 grid grid-cols-2 gap-x-6 gap-y-2.5">
                        <RegistryField
                          label="Палата судебных экспертов РФ"
                          verified={profile.palata_registry_verified}
                          number={profile.palata_registry_number}
                        />
                        <RegistryField
                          label="Центр судебных экспертиз"
                          verified={profile.centrsudexpert_verified}
                          number={profile.centrsudexpert_registry_number}
                        />
                      </div>
                      {profile.bio && (
                        <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-2">{profile.bio}</p>
                      )}
                    </div>
                  ) : (
                    <div className="px-4 py-3">
                      <p className="text-xs text-slate-400 italic">Профиль эксперта не найден</p>
                    </div>
                  )}

                  {/* can_start_from_date */}
                  {m.can_start_from_date && (
                    <div className="px-4 py-2 bg-teal-50 border-t border-teal-100 text-xs text-teal-700">
                      Может взять с: <span className="font-semibold">{fmtDate(m.can_start_from_date)}</span>
                    </div>
                  )}

                  {/* Decline reason */}
                  {m.decline_reason && (
                    <div className="px-4 py-2.5 bg-red-50 border-t border-red-100 flex items-start gap-2">
                      <span className="text-red-400 text-xs mt-0.5">✗</span>
                      <div>
                        <p className="text-xs font-medium text-red-700">
                          {DECLINE_REASONS.find(r => r.value === m.decline_reason)?.label ?? m.decline_reason}
                        </p>
                        {m.decline_note && <p className="text-xs text-red-600 mt-0.5">{m.decline_note}</p>}
                      </div>
                      {m.responded_at && (
                        <p className="ml-auto text-xs text-red-300 shrink-0">{fmtDate(m.responded_at)}</p>
                      )}
                    </div>
                  )}

                  {/* ── Действия эксперта ───────────────────────────────── */}
                  {canAct && (
                    <div className="px-4 py-3 bg-green-50 border-t border-green-100">
                      <p className="text-xs font-semibold text-green-700 mb-2 uppercase tracking-wide">
                        Действия эксперта <span className="font-normal text-green-500 normal-case">(тестовый режим)</span>
                      </p>

                      {ui.kind === "error" && (
                        <div className="mb-2 p-2 rounded bg-red-100 text-xs text-red-600">
                          {ui.message}
                          <button className="ml-2 underline" onClick={() => setMS(m.id, { kind: "idle" })}>×</button>
                        </div>
                      )}
                      {ui.kind === "submitting" && <Spinner inline />}

                      {/* date_picker form */}
                      {ui.kind === "date_picker" && (
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="text-xs text-slate-600">Дата начала:</span>
                          <input
                            type="date"
                            className="text-sm border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-400"
                            value={ui.date}
                            onChange={e => setMS(m.id, { kind: "date_picker", date: e.target.value })}
                          />
                          <button
                            className="btn-success-sm"
                            disabled={!ui.date}
                            onClick={() => ui.date && handleCanStart(m, ui.date)}
                          >
                            Подтвердить
                          </button>
                          <button className="btn-ghost-sm" onClick={() => setMS(m.id, { kind: "idle" })}>
                            Отмена
                          </button>
                        </div>
                      )}

                      {/* decline_form */}
                      {ui.kind === "decline_form" && (
                        <div className="space-y-2 mb-2">
                          <select
                            className="w-full text-sm border border-slate-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
                            value={ui.reason}
                            onChange={e => setMS(m.id, { kind: "decline_form", reason: e.target.value, note: ui.note })}
                          >
                            <option value="">— Выберите причину —</option>
                            {DECLINE_REASONS.map(r => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Комментарий (необязательно)"
                            className="w-full text-sm border border-slate-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-400"
                            value={ui.note}
                            onChange={e => setMS(m.id, { kind: "decline_form", reason: ui.reason, note: e.target.value })}
                          />
                          <div className="flex gap-2">
                            <button
                              className="btn-danger-sm"
                              disabled={!ui.reason}
                              onClick={() => ui.reason && handleDecline(m, ui.reason, ui.note)}
                            >
                              Подтвердить отказ
                            </button>
                            <button className="btn-ghost-sm" onClick={() => setMS(m.id, { kind: "idle" })}>
                              Отмена
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      {(ui.kind === "idle" || ui.kind === "error") && (
                        <div className="flex flex-wrap gap-2">
                          {["proposed", "can_start_from", "contacts_opened", "accepted"].includes(m.status) && (
                            <button
                              className="btn-teal-sm"
                              onClick={() => setMS(m.id, { kind: "date_picker", date: "" })}
                            >
                              Могу взять с даты
                            </button>
                          )}
                          {["proposed", "can_start_from", "contacts_opened", "accepted"].includes(m.status) && (
                            <button
                              className="btn-ghost-sm border-red-200 text-red-600 hover:bg-red-50"
                              onClick={() => setMS(m.id, { kind: "decline_form", reason: "", note: "" })}
                            >
                              Не могу взять
                            </button>
                          )}
                          {["can_start_from", "contacts_opened", "accepted"].includes(m.status) && (
                            <button
                              className="btn-primary-sm"
                              onClick={() => handleTakeWork(m)}
                            >
                              Взял в работу
                            </button>
                          )}
                          {["accepted_work", "accepted"].includes(m.status) && (
                            <button
                              className="btn-success-sm"
                              onClick={() => handleCompleteWork(m)}
                            >
                              Завершено
                            </button>
                          )}
                        </div>
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
        {events.length === 0 ? <Empty text="Событий пока не зафиксировано" /> : (
          <div className="relative -mx-6 -mb-6">
            <div className="absolute left-9 top-0 bottom-0 w-px bg-slate-100" />
            {events.map((e, idx) => {
              const actor = e.actor_id ? usersMap[e.actor_id] : null;
              return (
                <div key={e.id} className={`px-6 py-4 flex items-start gap-4 ${idx < events.length - 1 ? "border-b border-slate-50" : ""}`}>
                  <div className="shrink-0 mt-1">
                    <div className="w-3 h-3 rounded-full bg-slate-300 border-2 border-white ring-1 ring-slate-200 z-10" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      {e.old_status && (
                        <><StatusPill status={e.old_status} />
                        <span className="text-slate-300 text-xs">→</span></>
                      )}
                      <StatusPill status={e.new_status} highlight />
                    </div>
                    <p className="text-xs text-slate-400">
                      {actor ? (userName(actor) ?? actor.email) : "Система"}
                      {e.entity_type !== "request" && (
                        <span className="ml-1 text-slate-300">· {e.entity_type}</span>
                      )}
                    </p>
                    {e.note && <p className="text-xs text-slate-500 mt-1 italic">{e.note}</p>}
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

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function Card({ title, count, children }: { title?: string; count?: number; children: React.ReactNode }) {
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

function RegistryField({ label, verified, number }: { label: string; verified: boolean; number: string | null }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <div className="mb-0.5">
        {verified
          ? <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">✓ Подтверждено</span>
          : <span className="inline-flex items-center text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">Не подтверждено</span>}
      </div>
      <p className="text-xs text-slate-500">
        <span className="text-slate-400">№ </span>
        {number ?? <span className="italic text-slate-300">Не указано</span>}
      </p>
    </div>
  );
}

function StatusPill({ status, highlight }: { status: string; highlight?: boolean }) {
  const s = ORDER_STATUS[status] ?? MATCH_STATUS[status];
  return s
    ? <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${highlight ? s.cls : "bg-slate-100 text-slate-500"}`}>{s.label}</span>
    : <span className="inline-block rounded px-2 py-0.5 text-xs font-mono bg-slate-100 text-slate-500">{status}</span>;
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-slate-400 text-center py-6 italic">{text}</p>;
}

function Spinner({ inline }: { inline?: boolean }) {
  return inline
    ? <span className="text-xs text-slate-400">Сохранение…</span>
    : <p className="text-sm text-slate-400 py-8 text-center">Загрузка…</p>;
}
