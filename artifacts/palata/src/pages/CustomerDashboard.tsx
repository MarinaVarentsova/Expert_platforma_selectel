import { useEffect, useState } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";
import { KanbanBoard } from "@/components/KanbanBoard";
import {
  PlusCircle, FileText, User, MapPin, Building2,
  Phone, Mail, ClipboardList, Hash, Star,
  Zap, Calendar, CheckCircle2, XCircle, ChevronDown, ChevronUp, GraduationCap,
} from "lucide-react";
import {
  loadOpenActionItems, createActionItem, resolveActionItem, cancelRequestActionItems,
  logStatusEvent, logEmailTestEvent, type ActionItem,
} from "@/lib/actionItems";

// ─── Types ────────────────────────────────────────────────────────────────────

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

type CustomerProfile = {
  company_name: string | null;
  inn: string | null;
  contact_name: string | null;
  region: string | null;
  notes: string | null;
};

type PendingExpertRating = {
  request_id: string;
  title: string;
  assigned_expert_id: string;
  expert_name: string | null;
  expert_email: string | null;
  updated_at: string;
};

type RatingFormState =
  | { kind: "idle"; score: number; comment: string }
  | { kind: "submitting" }
  | { kind: "done" };

type RequestState =
  | { kind: "loading" }
  | { kind: "ok"; rows: Request[] }
  | { kind: "error"; message: string };

type ProfileState =
  | { kind: "loading" }
  | { kind: "ok"; profile: CustomerProfile | null }
  | { kind: "error"; message: string };

type PendingRatingsState =
  | { kind: "loading" }
  | { kind: "ok"; items: PendingExpertRating[] }
  | { kind: "error"; message: string };

type MatchedExpert = {
  match_id: string;
  match_status: string;
  expert_id: string;
  expert_name: string | null;
  expert_email: string | null;
  specializations: string[];
  regions: string[];
  experience_years: number | null;
  business_trip_ready: boolean;
  palata_registry_verified: boolean;
  palata_registry_number: string | null;
  centrsudexpert_verified: boolean;
  centrsudexpert_registry_number: string | null;
  avg_customer_rating: number | null;
  completed_orders_count: number;
  bio: string | null;
  decline_reason: string | null;
};

// ─── Kanban columns ───────────────────────────────────────────────────────────

const COLUMNS = [
  { id: "new",     label: "Новый",         dotColor: "bg-slate-400",  bgColor: "bg-white border-slate-200",         accent: "", statuses: ["draft", "new"] },
  { id: "pending", label: "Идёт подбор",   dotColor: "bg-amber-400",  bgColor: "bg-amber-50/60 border-amber-200",   accent: "", statuses: ["pending", "matching"] },
  { id: "match",   label: "Выбор эксперта",dotColor: "bg-cyan-400",   bgColor: "bg-cyan-50/60 border-cyan-200",     accent: "", statuses: ["expert_selection"] },
  { id: "working", label: "В работе",      dotColor: "bg-indigo-500", bgColor: "bg-indigo-50/60 border-indigo-200", accent: "", statuses: ["in_progress", "in_work"] },
  { id: "done",    label: "Выполнен",      dotColor: "bg-emerald-400",bgColor: "bg-emerald-50/60 border-emerald-200",accent:"", statuses: ["completed"] },
  { id: "closed",  label: "Неактуален",    dotColor: "bg-slate-300",  bgColor: "bg-slate-50 border-slate-200",      accent: "", statuses: ["cancelled", "failed", "declined"] },
];

const EXPERTISE_LABEL: Record<string, string> = {
  "avtotechnicheskaya":        "Автотехническая",
  "zemleustroitelnaya":        "Землеустроительная",
  "pocherkovedcheskaya":       "Почерковедческая",
  "finansovo-ekonomicheskaya": "Финансово-экономическая",
  "kompyuterno-tehnicheskaya": "Компьютерно-техническая",
  "stroitelno-tehnicheskaya":  "Строительно-техническая",
  "pozharno-tehnicheskaya":    "Пожарно-техническая",
  "tovaroved":                 "Товароведческая",
  "psihologicheskaya":         "Психологическая",
  "lingvisticheskaya":         "Лингвистическая",
};

const REGION_LABEL: Record<string, string> = {
  "Moskva":          "Москва",
  "Sankt-Peterburg": "Санкт-Петербург",
  "Krasnodar":       "Краснодар",
  "Nizhny Novgorod": "Нижний Новгород",
  "Ekaterinburg":    "Екатеринбург",
  "Kazan":           "Казань",
  "Rostov-na-Donu":  "Ростов-на-Дону",
  "Novosibirsk":     "Новосибирск",
  "Samara":          "Самара",
  "Voronezh":        "Воронеж",
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function CustomerDashboard() {
  const guard = useRequireRole("customer");
  const [tab, setTab] = useState<"requests" | "actions" | "rate" | "profile">("requests");
  const [requestState, setRequestState] = useState<RequestState>({ kind: "loading" });
  const [profileState, setProfileState] = useState<ProfileState>({ kind: "loading" });
  const [pendingRatingsState, setPendingRatingsState] = useState<PendingRatingsState>({ kind: "loading" });
  const [ratedRequestIds, setRatedRequestIds] = useState<Set<string>>(new Set());
  const [ratingForms, setRatingForms] = useState<Record<string, RatingFormState>>({});
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const loadPendingRatings = async (userId: string) => {
    // Fetch completed requests with assigned expert
    const { data: completedReqs, error: reqErr } = await supabase
      .from("palata_requests")
      .select("id, title, assigned_expert_id, updated_at")
      .eq("customer_id", userId)
      .eq("status", "completed")
      .not("assigned_expert_id", "is", null);

    if (reqErr) { setPendingRatingsState({ kind: "error", message: reqErr.message }); return; }
    if (!completedReqs || completedReqs.length === 0) {
      setPendingRatingsState({ kind: "ok", items: [] });
      setRatedRequestIds(new Set());
      return;
    }

    const reqIds = completedReqs.map((r: { id: string }) => r.id);

    // Fetch existing ratings by this customer
    const { data: ratings } = await supabase
      .from("palata_expert_ratings")
      .select("request_id")
      .eq("customer_id", userId)
      .in("request_id", reqIds);

    const ratedIds = new Set((ratings ?? []).map((r: { request_id: string }) => r.request_id));
    setRatedRequestIds(ratedIds);

    // Filter unrated
    const unratedReqs = completedReqs.filter((r: { id: string }) => !ratedIds.has(r.id));
    if (unratedReqs.length === 0) {
      setPendingRatingsState({ kind: "ok", items: [] });
      return;
    }

    // Fetch expert names
    const expertIds = [...new Set(unratedReqs.map((r: { assigned_expert_id: string }) => r.assigned_expert_id))] as string[];
    const { data: experts } = await supabase
      .from("palata_users")
      .select("id, full_name, email")
      .in("id", expertIds);

    const expertMap = Object.fromEntries(
      (experts ?? []).map((u: { id: string; full_name: string | null; email: string }) => [u.id, u])
    );

    const items: PendingExpertRating[] = unratedReqs.map((r: { id: string; title: string; assigned_expert_id: string; updated_at: string }) => {
      const expert = expertMap[r.assigned_expert_id];
      return {
        request_id: r.id,
        title: r.title,
        assigned_expert_id: r.assigned_expert_id,
        expert_name: expert?.full_name ?? null,
        expert_email: expert?.email ?? null,
        updated_at: r.updated_at,
      };
    });

    setPendingRatingsState({ kind: "ok", items });
  };

  useEffect(() => {
    if (guard.status !== "ok") return;
    const userId = guard.user.id;

    supabase
      .from("palata_requests")
      .select("id, title, status, expertise_type, region, matching_round, urgency, created_at")
      .eq("customer_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) { setRequestState({ kind: "error", message: error.message }); return; }
        setRequestState({ kind: "ok", rows: (data as Request[]) ?? [] });
      });

    supabase
      .from("palata_customer_profiles")
      .select("company_name, inn, contact_name, region, notes")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { setProfileState({ kind: "error", message: error.message }); return; }
        setProfileState({ kind: "ok", profile: data as CustomerProfile | null });
      });

    loadPendingRatings(userId);

    setAiLoading(true);
    loadOpenActionItems(userId).then(items => {
      setActionItems(items);
      setAiLoading(false);
    });
  }, [guard.status]);

  function reloadActionItems() {
    if (guard.status !== "ok") return;
    loadOpenActionItems(guard.user.id).then(setActionItems);
  }

  if (guard.status === "loading" || guard.status === "redirecting") {
    return <LoadingScreen />;
  }

  const { user } = guard;

  const columns = COLUMNS.map((col) => ({
    ...col,
    items: requestState.kind === "ok"
      ? requestState.rows.filter((r) => col.statuses.includes(r.status))
      : [],
  }));

  const total = requestState.kind === "ok" ? requestState.rows.length : null;
  const pendingCount = pendingRatingsState.kind === "ok" ? pendingRatingsState.items.length : null;

  function getRatingForm(requestId: string): RatingFormState {
    return ratingForms[requestId] ?? { kind: "idle", score: 5, comment: "" };
  }
  function setRatingForm(requestId: string, s: RatingFormState) {
    setRatingForms(p => ({ ...p, [requestId]: s }));
  }

  async function handleRateExpert(item: PendingExpertRating) {
    const form = getRatingForm(item.request_id);
    if (form.kind !== "idle") return;
    setRatingForm(item.request_id, { kind: "submitting" });
    const { error } = await supabase.from("palata_expert_ratings").insert({
      request_id: item.request_id,
      expert_id: item.assigned_expert_id,
      customer_id: user.id,
      score: form.score,
      comment: form.comment || null,
    });
    if (error) { setRatingForm(item.request_id, { kind: "idle", score: 5, comment: "" }); return; }
    await supabase.from("palata_status_events").insert({
      entity_type: "request", entity_id: item.request_id,
      old_status: "completed", new_status: "completed",
      actor_id: null, note: `Заказчик оценил эксперта: ${form.score}/5`,
    });
    if (item.expert_email) {
      await supabase.from("palata_email_events").insert({
        recipient_id: item.assigned_expert_id,
        email_address: item.expert_email,
        template_name: "expert_rated_by_customer",
        subject: `Вас оценил заказчик — ${form.score} из 5`,
        context: { request_id: item.request_id, score: form.score },
        sent_at: new Date().toISOString(),
        error: "TEST_MODE",
      });
    }
    setRatingForm(item.request_id, { kind: "done" });
    setRatedRequestIds(prev => new Set([...prev, item.request_id]));
    if (pendingRatingsState.kind === "ok") {
      setPendingRatingsState({
        kind: "ok",
        items: pendingRatingsState.items.filter(i => i.request_id !== item.request_id),
      });
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-screen-2xl mx-auto">

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Личный кабинет заказчика</p>
          <h1 className="text-xl font-bold text-slate-900">{user.full_name ?? user.email}</h1>
          <p className="text-xs text-slate-400 mt-0.5">{user.email}</p>
        </div>

        <div className="flex items-center gap-3">
          {total != null && total > 0 && tab === "requests" && (
            <div className="text-right mr-1">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Всего заказов</p>
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

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <TabButton active={tab === "requests"} onClick={() => setTab("requests")}>
          <ClipboardList className="w-3.5 h-3.5" />
          Мои заказы
        </TabButton>
        <TabButton active={tab === "actions"} onClick={() => setTab("actions")}>
          <Zap className="w-3.5 h-3.5" />
          Требуют действия
          {actionItems.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold bg-rose-500 text-white rounded-full">
              {actionItems.length}
            </span>
          )}
        </TabButton>
        <TabButton active={tab === "rate"} onClick={() => setTab("rate")}>
          <Star className="w-3.5 h-3.5" />
          Оценить эксперта
          {pendingCount != null && pendingCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-amber-500 text-white rounded-full">
              {pendingCount}
            </span>
          )}
        </TabButton>
        <TabButton active={tab === "profile"} onClick={() => setTab("profile")}>
          <User className="w-3.5 h-3.5" />
          Профиль
        </TabButton>
      </div>

      {/* Tab: Requests */}
      {tab === "requests" && (
        <>
          {requestState.kind === "loading" && <LoadingRows />}
          {requestState.kind === "error" && <ErrorCard message={requestState.message} />}
          {requestState.kind === "ok" && requestState.rows.length === 0 && <EmptyState />}
          {requestState.kind === "ok" && requestState.rows.length > 0 && (
            <KanbanBoard
              columns={columns}
              renderCard={(r: Request) => <CustomerCard request={r} needsRating={r.status === "completed" && !ratedRequestIds.has(r.id)} />}
              emptyText="Нет заказов"
            />
          )}
        </>
      )}

      {/* Tab: Action Items */}
      {tab === "actions" && (
        <div>
          {aiLoading ? <LoadingRows /> : (
            <CustomerActionInbox
              items={actionItems}
              userId={user.id}
              onDone={reloadActionItems}
            />
          )}
        </div>
      )}

      {/* Tab: Rate Expert */}
      {tab === "rate" && (
        <div className="max-w-2xl space-y-4">
          {pendingRatingsState.kind === "loading" && <LoadingRows />}
          {pendingRatingsState.kind === "error" && <ErrorCard message={pendingRatingsState.message} />}
          {pendingRatingsState.kind === "ok" && pendingRatingsState.items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <Star className="w-8 h-8 text-emerald-300" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-slate-700 mb-1">Нет ожидающих оценок</p>
                <p className="text-sm text-slate-400 max-w-xs">
                  Все выполненные заказы уже оценены. Спасибо за обратную связь!
                </p>
              </div>
            </div>
          )}
          {pendingRatingsState.kind === "ok" && pendingRatingsState.items.map(item => {
            const form = getRatingForm(item.request_id);
            return (
              <div key={item.request_id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-[10px] font-mono text-slate-400 mb-0.5">#{item.request_id.slice(0, 8).toUpperCase()}</p>
                    <Link href={`/requests/${item.request_id}`}>
                      <p className="text-sm font-semibold text-slate-800 hover:text-indigo-700 transition-colors cursor-pointer">
                        {item.title}
                      </p>
                    </Link>
                    {(item.expert_name || item.expert_email) && (
                      <p className="text-xs text-slate-500 mt-1">
                        Эксперт: <span className="font-medium text-slate-700">{item.expert_name ?? item.expert_email}</span>
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] text-slate-400">
                    {new Date(item.updated_at).toLocaleDateString("ru-RU")}
                  </span>
                </div>

                {form.kind === "done" ? (
                  <p className="text-sm font-medium text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
                    ✓ Оценка сохранена. Спасибо!
                  </p>
                ) : (
                  <div className="space-y-3 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-500 font-medium">Ваша оценка эксперта:</p>
                    <div className="flex gap-1 items-center">
                      {[1, 2, 3, 4, 5].map(s => (
                        <button
                          key={s}
                          onClick={() => form.kind === "idle" && setRatingForm(item.request_id, { ...form, score: s })}
                          disabled={form.kind !== "idle"}
                          className={`text-2xl transition-colors ${form.kind === "idle" && form.score >= s ? "text-amber-400" : "text-slate-200"}`}
                        >★</button>
                      ))}
                      <span className="ml-2 text-sm text-slate-500">
                        {form.kind === "idle" ? `${form.score} / 5` : ""}
                      </span>
                    </div>
                    <input
                      type="text"
                      placeholder="Комментарий (необязательно)"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      disabled={form.kind !== "idle"}
                      value={form.kind === "idle" ? form.comment : ""}
                      onChange={e => form.kind === "idle" && setRatingForm(item.request_id, { ...form, comment: e.target.value })}
                    />
                    <button
                      className="btn-primary"
                      disabled={form.kind !== "idle"}
                      onClick={() => handleRateExpert(item)}
                    >
                      {form.kind === "submitting" ? "Сохранение…" : "Отправить оценку"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Profile */}
      {tab === "profile" && (
        <>
          {profileState.kind === "loading" && <LoadingRows />}
          {profileState.kind === "error" && <ErrorCard message={profileState.message} />}
          {profileState.kind !== "loading" && profileState.kind !== "error" && (
            <ProfileView user={user} profile={profileState.profile} />
          )}
        </>
      )}
    </div>
  );
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px
        ${active
          ? "border-indigo-600 text-indigo-700"
          : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
        }`}
    >
      {children}
    </button>
  );
}

// ─── Profile view ─────────────────────────────────────────────────────────────

function ProfileView({
  user,
  profile,
}: {
  user: { full_name?: string | null; email: string; phone?: string | null };
  profile: CustomerProfile | null;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-4xl">

      {/* Identity */}
      <div className="xl:col-span-1 flex flex-col gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
              <User className="w-6 h-6 text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{user.full_name ?? "—"}</p>
              <p className="text-xs text-slate-400">Заказчик</p>
            </div>
          </div>

          <div className="space-y-2.5">
            <InfoRow icon={<Mail className="w-3.5 h-3.5" />} label="Email" value={user.email} />
            <InfoRow icon={<Phone className="w-3.5 h-3.5" />} label="Телефон" value={user.phone ?? null} />
          </div>
        </div>
      </div>

      {/* Company / details */}
      <div className="xl:col-span-2 flex flex-col gap-4">

        {profile ? (
          <>
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="w-4 h-4 text-slate-400" />
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Организация</p>
              </div>
              <div className="space-y-3">
                <InfoRow icon={<Building2 className="w-3.5 h-3.5" />} label="Компания" value={profile.company_name} />
                <InfoRow icon={<Hash className="w-3.5 h-3.5" />} label="ИНН" value={profile.inn} mono />
                <InfoRow icon={<User className="w-3.5 h-3.5" />} label="Контактное лицо" value={profile.contact_name} />
                <InfoRow
                  icon={<MapPin className="w-3.5 h-3.5" />}
                  label="Регион"
                  value={profile.region ? (REGION_LABEL[profile.region] ?? profile.region) : null}
                />
              </div>
            </div>

            {profile.notes && (
              <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Дополнительно</p>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{profile.notes}</p>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-sm flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-slate-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-1">Профиль не заполнен</p>
              <p className="text-xs text-slate-400 max-w-xs">
                Данные о компании и контактах пока не добавлены. Обратитесь к администратору.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value, mono }: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-slate-400 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">{label}</p>
        <p className={`text-sm ${mono ? "font-mono" : ""} ${value ? "text-slate-800" : "text-slate-300"}`}>
          {value ?? "—"}
        </p>
      </div>
    </div>
  );
}

// ─── Request card ─────────────────────────────────────────────────────────────

function CustomerCard({ request: r, needsRating }: { request: Request; needsRating?: boolean }) {
  const urgencyColor = r.urgency === "very_urgent" ? "border-l-red-400"
    : r.urgency === "urgent" ? "border-l-amber-400"
    : "border-l-indigo-200";

  const urgencyLabel: Record<string, string> = {
    urgent: "Срочно",
    very_urgent: "Очень срочно",
  };

  return (
    <Link href={`/requests/${r.id}`}>
      <div className={`bg-white rounded-xl border border-slate-100 border-l-[3px] ${urgencyColor} p-3.5 hover:shadow-md hover:border-indigo-100 transition-all cursor-pointer group shadow-sm`}>
        <p className="text-xs font-semibold text-slate-800 leading-snug mb-2 line-clamp-2 group-hover:text-indigo-700 transition-colors">
          {r.title}
        </p>

        <div className="space-y-1 mb-2.5">
          {r.expertise_type && (
            <p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
              <span className="inline-block h-1 w-1 rounded-full bg-indigo-300 flex-shrink-0" />
              {EXPERTISE_LABEL[r.expertise_type] ?? r.expertise_type}
            </p>
          )}
          {r.region && (
            <p className="text-[11px] text-slate-400 truncate">
              {REGION_LABEL[r.region] ?? r.region}
            </p>
          )}
          {r.urgency && r.urgency !== "normal" && (
            <span className="inline-block text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
              {urgencyLabel[r.urgency] ?? r.urgency}
            </span>
          )}
          {needsRating && (
            <span className="inline-block text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
              ★ Оцените эксперта
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

// ─── States ───────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-[#f0f5f1] flex items-center justify-center">
        <FileText className="w-8 h-8 text-[#b8ccbe]" />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-slate-700 mb-1">Заказов пока нет</p>
        <p className="text-sm text-slate-400 mb-6 max-w-xs">
          Создайте заказ на судебную экспертизу — система автоматически подберёт квалифицированного эксперта
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
      <div className="h-5 w-5 rounded-full border-2 border-[#c8d8cc] border-t-[#1a3d2b] animate-spin" />
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="flex items-center gap-3 py-12 text-sm text-slate-400">
      <div className="h-4 w-4 rounded-full border-2 border-[#b8ccbe] border-t-[#1a3d2b] animate-spin" />
      Загрузка…
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

// ─── Customer Action Inbox ─────────────────────────────────────────────────────

function CustomerActionInbox({ items, userId, onDone }: {
  items: ActionItem[];
  userId: string;
  onDone: () => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center">
          <Zap className="w-8 h-8 text-indigo-300" />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-slate-700 mb-1">Нет активных задач</p>
          <p className="text-sm text-slate-400 max-w-xs">
            Здесь появятся задачи, когда система подберёт экспертов или потребуется ваше решение.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-2xl space-y-4">
      {items.map(item => (
        <CustomerActionCard key={item.id} item={item} userId={userId} onDone={onDone} />
      ))}
    </div>
  );
}

// ─── Dispatcher for action types ──────────────────────────────────────────────

function CustomerActionCard({ item, userId, onDone }: {
  item: ActionItem;
  userId: string;
  onDone: () => void;
}) {
  if (item.action_type === "experts_matched" || item.action_type === "expert_declined") {
    return <ExpertsMatchedCard item={item} userId={userId} onDone={onDone} />;
  }
  if (item.action_type === "expert_can_start_from") {
    return <ExpertCanStartCard item={item} userId={userId} onDone={onDone} />;
  }
  if (item.action_type === "expert_completed_order") {
    return <ExpertCompletedCard item={item} onDone={onDone} />;
  }
  if (item.action_type === "expert_started_work") {
    return <ExpertStartedWorkCard item={item} onDone={onDone} />;
  }
  if (item.action_type === "manual_matching_required") {
    return <ManualMatchingCard item={item} onDone={onDone} />;
  }
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <ActionItemHeader item={item} />
      <p className="text-sm text-slate-600 mt-2">{item.description}</p>
    </div>
  );
}

// ─── experts_matched / expert_declined ────────────────────────────────────────

function ExpertsMatchedCard({ item, userId, onDone }: {
  item: ActionItem;
  userId: string;
  onDone: () => void;
}) {
  const [experts, setExperts] = useState<MatchedExpert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: matches } = await supabase
        .from("palata_request_matches")
        .select("id, expert_id, status, decline_reason")
        .eq("request_id", item.request_id)
        .in("status", ["proposed", "contacts_opened", "can_start_from", "accepted"]);

      if (!matches || matches.length === 0) { setLoading(false); return; }

      const expertIds = matches.map((m: { expert_id: string }) => m.expert_id);

      const [{ data: profiles }, { data: users }] = await Promise.all([
        supabase.from("palata_expert_profiles").select(
          "user_id, specializations, regions, experience_years, business_trip_ready, palata_registry_verified, palata_registry_number, centrsudexpert_verified, centrsudexpert_registry_number, avg_customer_rating, completed_orders_count, bio"
        ).in("user_id", expertIds),
        supabase.from("palata_users").select("id, full_name, email").in("id", expertIds),
      ]);

      type PRow = {
        user_id: string; specializations: string[]; regions: string[];
        experience_years: number | null; business_trip_ready: boolean;
        palata_registry_verified: boolean; palata_registry_number: string | null;
        centrsudexpert_verified: boolean; centrsudexpert_registry_number: string | null;
        avg_customer_rating: number | null; completed_orders_count: number; bio: string | null;
      };
      type URow = { id: string; full_name: string | null; email: string };
      type MRow = { id: string; expert_id: string; status: string; decline_reason: string | null };

      const pm = Object.fromEntries(((profiles ?? []) as PRow[]).map(p => [p.user_id, p]));
      const um = Object.fromEntries(((users ?? []) as URow[]).map(u => [u.id, u]));

      setExperts(((matches ?? []) as MRow[]).map(m => {
        const p = pm[m.expert_id] as PRow | undefined;
        const u = um[m.expert_id] as URow | undefined;
        return {
          match_id: m.id,
          match_status: m.status,
          expert_id: m.expert_id,
          expert_name: u?.full_name ?? null,
          expert_email: u?.email ?? null,
          specializations: p?.specializations ?? [],
          regions: p?.regions ?? [],
          experience_years: p?.experience_years ?? null,
          business_trip_ready: p?.business_trip_ready ?? false,
          palata_registry_verified: p?.palata_registry_verified ?? false,
          palata_registry_number: p?.palata_registry_number ?? null,
          centrsudexpert_verified: p?.centrsudexpert_verified ?? false,
          centrsudexpert_registry_number: p?.centrsudexpert_registry_number ?? null,
          avg_customer_rating: p?.avg_customer_rating ?? null,
          completed_orders_count: p?.completed_orders_count ?? 0,
          bio: p?.bio ?? null,
          decline_reason: m.decline_reason ?? null,
        } satisfies MatchedExpert;
      }));
      setLoading(false);
    }
    load();
  }, [item.request_id]);

  async function handleSelect(expert: MatchedExpert) {
    setSelecting(expert.expert_id);
    await supabase.from("palata_request_matches").update({
      status: "accepted", responded_at: new Date().toISOString(),
    }).eq("id", expert.match_id);

    await supabase.from("palata_requests").update({
      assigned_expert_id: expert.expert_id, status: "expert_selection",
    }).eq("id", item.request_id);

    await createActionItem({
      request_id: item.request_id,
      expert_id: expert.expert_id,
      customer_id: userId,
      assigned_to_user_id: expert.expert_id,
      assigned_role: "expert",
      action_type: "customer_selected_you",
      title: "Заказчик выбрал вас",
      description: "Заказчик выбрал вас для работы над заказом. Ознакомьтесь с деталями и примите решение.",
      payload: { customer_id: userId, request_id: item.request_id },
    });

    await resolveActionItem(item.id);
    await logStatusEvent(item.request_id, "matching", "expert_selection",
      `Заказчик выбрал эксперта: ${expert.expert_name ?? expert.expert_id}`);

    if (expert.expert_email) {
      await logEmailTestEvent(expert.expert_id, expert.expert_email,
        "expert_selected_by_customer", "Заказчик выбрал вас для работы",
        { request_id: item.request_id });
    }
    setSelecting(null);
    onDone();
  }

  const isDecline = item.action_type === "expert_declined";

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="p-5">
        <ActionItemHeader item={item} />
        <p className="text-sm text-slate-600 mt-2">{item.description}</p>

        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900 transition-colors"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {isDecline ? "Выбрать другого эксперта" : "Посмотреть экспертов"}
          {!loading && experts.length > 0 && (
            <span className="ml-1 text-indigo-400 font-normal">({experts.length})</span>
          )}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-3">
          {loading && <div className="flex items-center gap-2 text-xs text-slate-400 py-4"><div className="h-3.5 w-3.5 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />Загрузка экспертов…</div>}
          {!loading && experts.length === 0 && (
            <p className="text-xs text-slate-400 py-4 text-center">Нет доступных экспертов</p>
          )}
          {!loading && experts.map(expert => (
            <ExpertProfileCard
              key={expert.expert_id}
              expert={expert}
              busy={selecting === expert.expert_id}
              onSelect={() => handleSelect(expert)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── expert_can_start_from ────────────────────────────────────────────────────

function ExpertCanStartCard({ item, userId, onDone }: {
  item: ActionItem;
  userId: string;
  onDone: () => void;
}) {
  const payload = item.payload ?? {};
  const expertName = payload.expert_name as string | null ?? null;
  const expertId = item.expert_id ?? payload.expert_id as string | null ?? null;
  const expertEmail = payload.expert_email as string | null ?? null;
  const startDate = payload.start_date as string | null ?? null;
  const comment = payload.comment as string | null ?? null;
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);

  async function handleApprove() {
    if (!expertId) return;
    setBusy("approve");
    await supabase.from("palata_requests").update({ status: "in_work" }).eq("id", item.request_id);
    await supabase.from("palata_request_matches").update({
      status: "accepted_work", responded_at: new Date().toISOString(),
    }).eq("request_id", item.request_id).eq("expert_id", expertId);
    await supabase.from("palata_request_matches").update({ status: "closed_by_other_expert" })
      .eq("request_id", item.request_id).neq("expert_id", expertId).neq("status", "declined");

    await createActionItem({
      request_id: item.request_id,
      expert_id: expertId,
      customer_id: userId,
      assigned_to_user_id: expertId,
      assigned_role: "expert",
      action_type: "customer_approved_start_date",
      title: "Заказчик согласовал дату начала",
      description: `Дата ${startDate ? new Date(startDate).toLocaleDateString("ru-RU") : ""} подтверждена. Заказ передан в работу.`,
      payload: { start_date: startDate, customer_id: userId },
    });

    await resolveActionItem(item.id);
    await cancelRequestActionItems(item.request_id, item.id);
    await logStatusEvent(item.request_id, "expert_selection", "in_work",
      `Заказчик согласовал дату начала: ${startDate ?? "—"}`);
    if (expertEmail) {
      await logEmailTestEvent(expertId, expertEmail, "customer_approved_start",
        "Заказчик согласовал дату начала работы", { request_id: item.request_id, start_date: startDate });
    }
    setBusy(null);
    onDone();
  }

  async function handleDecline() {
    if (!expertId) return;
    setBusy("decline");
    await supabase.from("palata_request_matches").update({ status: "declined" })
      .eq("request_id", item.request_id).eq("expert_id", expertId);
    await resolveActionItem(item.id);
    await logStatusEvent(item.request_id, "expert_selection", "matching",
      "Заказчик отклонил предложенную дату");
    setBusy(null);
    onDone();
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <ActionItemHeader item={item} />
      <div className="mt-3 bg-indigo-50 rounded-xl px-4 py-3 space-y-1.5">
        {expertName && <p className="text-xs text-slate-700"><span className="text-slate-400">Эксперт:</span> <span className="font-semibold">{expertName}</span></p>}
        {startDate && (
          <p className="text-xs text-slate-700 flex items-center gap-1.5">
            <Calendar className="w-3 h-3 text-indigo-400" />
            <span className="text-slate-400">Готов начать:</span>
            <span className="font-semibold">{new Date(startDate).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })}</span>
          </p>
        )}
        {comment && <p className="text-xs text-slate-500 italic">«{comment}»</p>}
      </div>
      <div className="flex gap-2 mt-4">
        <button
          disabled={busy !== null}
          onClick={handleApprove}
          className="btn-primary text-xs py-1.5 px-4"
        >
          {busy === "approve" ? "Сохранение…" : "Согласовать дату"}
        </button>
        <button
          disabled={busy !== null}
          onClick={handleDecline}
          className="px-4 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-600 hover:border-slate-400 hover:text-slate-800 transition-colors disabled:opacity-50"
        >
          {busy === "decline" ? "…" : "Выбрать другого эксперта"}
        </button>
      </div>
    </div>
  );
}

// ─── expert_started_work ──────────────────────────────────────────────────────

function ExpertStartedWorkCard({ item, onDone }: { item: ActionItem; onDone: () => void }) {
  const [done, setDone] = useState(false);

  async function handleAck() {
    await resolveActionItem(item.id);
    setDone(true);
    onDone();
  }

  if (done) return null;

  return (
    <div className="bg-white border border-emerald-200 rounded-xl p-5 shadow-sm">
      <ActionItemHeader item={item} />
      <div className="mt-3 bg-emerald-50 rounded-xl px-4 py-3">
        <p className="text-xs text-emerald-700 font-medium">
          Эксперт взял заказ в работу. Следите за ходом выполнения в разделе «Мои заказы».
        </p>
      </div>
      <div className="mt-4">
        <button
          onClick={handleAck}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
        >
          Понятно
        </button>
      </div>
    </div>
  );
}

// ─── manual_matching_required ─────────────────────────────────────────────────

function ManualMatchingCard({ item, onDone }: { item: ActionItem; onDone: () => void }) {
  const [done, setDone] = useState(false);

  async function handleAck() {
    await resolveActionItem(item.id);
    setDone(true);
    onDone();
  }

  if (done) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <ActionItemHeader item={item} />
      <p className="text-sm text-slate-600 mt-2">{item.description}</p>
      <div className="mt-4">
        <button
          onClick={handleAck}
          className="px-4 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-600 hover:text-slate-800 transition-colors"
        >
          Понятно
        </button>
      </div>
    </div>
  );
}

// ─── expert_completed_order ───────────────────────────────────────────────────

function ExpertCompletedCard({ item, onDone }: { item: ActionItem; onDone: () => void }) {
  const payload = item.payload ?? {};
  const expertName = payload.expert_name as string | null ?? null;
  const completedAt = payload.completed_at as string | null ?? item.created_at;
  const [done, setDone] = useState(false);

  async function handleResolve() {
    await resolveActionItem(item.id);
    setDone(true);
    onDone();
  }

  if (done) return null;

  return (
    <div className="bg-white border border-emerald-200 rounded-xl p-5 shadow-sm">
      <ActionItemHeader item={item} />
      <div className="mt-3 bg-emerald-50 rounded-xl px-4 py-3 space-y-1">
        {expertName && <p className="text-xs text-slate-700"><span className="text-slate-400">Эксперт:</span> <span className="font-semibold">{expertName}</span></p>}
        <p className="text-xs text-slate-700">
          <span className="text-slate-400">Завершён:</span>{" "}
          <span className="font-semibold">{new Date(completedAt).toLocaleDateString("ru-RU")}</span>
        </p>
      </div>
      <div className="flex gap-2 mt-4">
        <Link href={`/requests/${item.request_id}`}>
          <button className="btn-primary text-xs py-1.5 px-4">Оценить эксперта</button>
        </Link>
        <button
          onClick={handleResolve}
          className="px-4 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-500 hover:text-slate-700 transition-colors"
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}

// ─── Expert profile card (for "Выбрать эксперта" list) ───────────────────────

function ExpertProfileCard({ expert: e, busy, onSelect }: {
  expert: MatchedExpert;
  busy: boolean;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rating = e.avg_customer_rating ? Number(e.avg_customer_rating).toFixed(1) : null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">{e.expert_name ?? "—"}</p>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {rating && (
                <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                  ★ {rating}
                </span>
              )}
              <span className="text-[11px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">
                {e.completed_orders_count} выполнено
              </span>
              {e.business_trip_ready && (
                <span className="text-[11px] text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">Командировки ✓</span>
              )}
            </div>
          </div>
          <button
            disabled={busy}
            onClick={onSelect}
            className="shrink-0 btn-primary text-xs py-1.5 px-3"
          >
            {busy ? "…" : "Выбрать"}
          </button>
        </div>

        {(e.specializations.length > 0 || e.regions.length > 0) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {e.specializations.slice(0, 3).map(s => (
              <span key={s} className="text-[10px] font-medium text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                {EXPERTISE_LABEL[s] ?? s}
              </span>
            ))}
            {e.regions.slice(0, 2).map(r => (
              <span key={r} className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                {REGION_LABEL[r] ?? r}
              </span>
            ))}
          </div>
        )}

        <button
          onClick={() => setOpen(v => !v)}
          className="mt-2 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
        >
          {open ? "Скрыть детали ↑" : "Подробнее ↓"}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50 space-y-2.5">
          {e.bio && <p className="text-xs text-slate-600 leading-relaxed">{e.bio}</p>}
          {e.experience_years != null && (
            <p className="text-xs text-slate-600">
              <span className="text-slate-400">Опыт:</span> {e.experience_years} лет
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {e.palata_registry_verified && (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                <GraduationCap className="w-3 h-3" /> Реестр Палаты {e.palata_registry_number && `#${e.palata_registry_number}`}
              </span>
            )}
            {e.centrsudexpert_verified && (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                <CheckCircle2 className="w-3 h-3" /> ЦСЭ {e.centrsudexpert_registry_number && `#${e.centrsudexpert_registry_number}`}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared: action item header ───────────────────────────────────────────────

const ACTION_LABEL: Record<string, { label: string; color: string }> = {
  experts_matched:            { label: "Подобраны эксперты", color: "text-indigo-700 bg-indigo-50" },
  expert_declined:            { label: "Эксперт отказался", color: "text-red-700 bg-red-50" },
  expert_can_start_from:      { label: "Предложена дата", color: "text-amber-700 bg-amber-50" },
  expert_completed_order:     { label: "Заказ завершён", color: "text-emerald-700 bg-emerald-50" },
  expert_started_work:        { label: "Эксперт взял в работу", color: "text-emerald-700 bg-emerald-50" },
  customer_selected_you:      { label: "Вас выбрали", color: "text-indigo-700 bg-indigo-50" },
  customer_approved_start_date: { label: "Дата согласована", color: "text-emerald-700 bg-emerald-50" },
  manual_matching_required:   { label: "Нет доступных экспертов", color: "text-slate-600 bg-slate-100" },
};

function ActionItemHeader({ item }: { item: ActionItem }) {
  const meta = ACTION_LABEL[item.action_type] ?? { label: item.action_type, color: "text-slate-600 bg-slate-100" };
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${meta.color}`}>
            {meta.label}
          </span>
          {!item.is_read && (
            <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0" />
          )}
        </div>
        <p className="text-sm font-semibold text-slate-800 leading-snug">{item.title}</p>
      </div>
      <span className="text-[10px] text-slate-400 flex-shrink-0 tabular-nums">
        {new Date(item.created_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}
      </span>
    </div>
  );
}
