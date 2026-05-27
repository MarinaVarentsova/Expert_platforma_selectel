import { useEffect, useState } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { runMatching } from "@/lib/matching";
import { useRequireRole } from "@/lib/useRequireRole";
import { KanbanBoard } from "@/components/KanbanBoard";
import {
  Inbox, Star, User, CheckCircle2, XCircle, MapPin,
  Briefcase, FileText, GraduationCap, ClipboardList, Zap, Calendar,
} from "lucide-react";
import {
  loadOpenActionItems, createActionItem, resolveActionItem, cancelRequestActionItems,
  logStatusEvent, logEmailTestEvent, type ActionItem,
} from "@/lib/actionItems";

// ─── Types ───────────────────────────────────────────────────────────────────

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
    customer_id: string | null;
  } | null;
};

type ExpertProfile = {
  id: string;
  status: string;
  specializations: string[];
  regions: string[];
  experience_years: number | null;
  education: string | null;
  certifications: string[] | null;
  accepts_requests: boolean;
  business_trip_ready: boolean;
  palata_registry_verified: boolean;
  centrsudexpert_verified: boolean;
  palata_registry_number: string | null;
  centrsudexpert_registry_number: string | null;
  avg_customer_rating: number | null;
  completed_orders_count: number;
  bio: string | null;
};

type PendingCustomerRating = {
  match_id: string;
  request_id: string;
  title: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  responded_at: string | null;
};

type RatingFormState =
  | { kind: "idle"; score: number; comment: string }
  | { kind: "submitting" }
  | { kind: "done" };

type MatchState =
  | { kind: "loading" }
  | { kind: "ok"; rows: Match[] }
  | { kind: "error"; message: string };

type ProfileState =
  | { kind: "loading" }
  | { kind: "ok"; profile: ExpertProfile | null }
  | { kind: "error"; message: string };

type PendingRatingsState =
  | { kind: "loading" }
  | { kind: "ok"; items: PendingCustomerRating[] }
  | { kind: "error"; message: string };

// ─── Lookup tables ────────────────────────────────────────────────────────────

const SPEC_LABEL: Record<string, string> = {
  "avtotechnicheskaya":       "Автотехническая",
  "zemleustroitelnaya":       "Землеустроительная",
  "pocherkovedcheskaya":      "Почерковедческая",
  "finansovo-ekonomicheskaya":"Финансово-экономическая",
  "kompyuterno-tehnicheskaya":"Компьютерно-техническая",
  "stroitelno-tehnicheskaya": "Строительно-техническая",
  "pozharno-tehnicheskaya":   "Пожарно-техническая",
  "tovaroved":                "Товароведческая",
  "psihologicheskaya":        "Психологическая",
  "lingvisticheskaya":        "Лингвистическая",
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

const DECLINE_LABEL: Record<string, string> = {
  busy:          "Занят",
  not_competent: "Вне компетенции",
  location:      "Регион",
  conflict:      "Конфликт интересов",
  conditions:    "Условия",
  other:         "Другое",
};

// ─── Kanban config ─────────────────────────────────────────────────────────────

const COLUMNS = [
  { id: "proposed",  label: "Новые предложения", accent: "", dotColor: "bg-blue-400",    bgColor: "bg-blue-50/60 border-blue-200",     statuses: ["proposed", "contacts_opened"] },
  { id: "cantake",   label: "Могу взять",        accent: "", dotColor: "bg-teal-400",    bgColor: "bg-teal-50/60 border-teal-200",     statuses: ["can_start_from"] },
  { id: "accepted",  label: "В работе",          accent: "", dotColor: "bg-indigo-500",  bgColor: "bg-indigo-50/60 border-indigo-200", statuses: ["accepted", "accepted_work"] },
  { id: "completed", label: "Завершено",         accent: "", dotColor: "bg-emerald-400", bgColor: "bg-emerald-50/60 border-emerald-200", statuses: ["completed"] },
  { id: "declined",  label: "Отказ / не взял",   accent: "", dotColor: "bg-slate-300",   bgColor: "bg-slate-50 border-slate-200",      statuses: ["declined", "withdrawn", "closed_by_other_expert"] },
];

// ─── Main component ──────────────────────────────────────────────────────────

export default function ExpertDashboard() {
  const guard = useRequireRole("expert");
  const [tab, setTab] = useState<"requests" | "actions" | "rate" | "profile">("requests");
  const [matchState, setMatchState] = useState<MatchState>({ kind: "loading" });
  const [profileState, setProfileState] = useState<ProfileState>({ kind: "loading" });
  const [pendingRatingsState, setPendingRatingsState] = useState<PendingRatingsState>({ kind: "loading" });
  const [ratedMatchIds, setRatedMatchIds] = useState<Set<string>>(new Set());
  const [ratingForms, setRatingForms] = useState<Record<string, RatingFormState>>({});
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const loadPendingRatings = async (userId: string) => {
    // Fetch completed matches
    const { data: rawMatches, error: matchErr } = await supabase
      .from("palata_request_matches")
      .select(`
        id, request_id, responded_at,
        palata_requests ( title, customer_id )
      `)
      .eq("expert_id", userId)
      .eq("status", "completed");

    if (matchErr) { setPendingRatingsState({ kind: "error", message: matchErr.message }); return; }

    type RawMatch = {
      id: string;
      request_id: string;
      responded_at: string | null;
      palata_requests: { title: string; customer_id: string | null } | { title: string; customer_id: string | null }[] | null;
    };

    const completedMatches = (rawMatches ?? []) as unknown as RawMatch[];

    function getReq(m: RawMatch): { title: string; customer_id: string | null } | null {
      if (!m.palata_requests) return null;
      return Array.isArray(m.palata_requests) ? m.palata_requests[0] ?? null : m.palata_requests;
    }

    if (completedMatches.length === 0) {
      setPendingRatingsState({ kind: "ok", items: [] });
      setRatedMatchIds(new Set());
      return;
    }

    const reqIds = completedMatches.map(m => m.request_id);

    // Check which ones have customer ratings by this expert
    const { data: ratings } = await supabase
      .from("palata_customer_ratings")
      .select("request_id")
      .eq("expert_id", userId)
      .in("request_id", reqIds);

    const ratedReqIds = new Set((ratings ?? []).map((r: { request_id: string }) => r.request_id));
    const unratedMatches = completedMatches.filter(m => !ratedReqIds.has(m.request_id));

    // Build ratedMatchIds for kanban card badges
    const ratedSet = new Set<string>();
    completedMatches.forEach(m => {
      if (ratedReqIds.has(m.request_id)) ratedSet.add(m.id);
    });
    setRatedMatchIds(ratedSet);

    if (unratedMatches.length === 0) {
      setPendingRatingsState({ kind: "ok", items: [] });
      return;
    }

    // Fetch customer info
    const customerIds = [...new Set(
      unratedMatches.map(m => getReq(m)?.customer_id).filter(Boolean)
    )] as string[];

    const { data: customers } = customerIds.length > 0
      ? await supabase.from("palata_users").select("id, full_name, email").in("id", customerIds)
      : { data: [] };

    const custMap = Object.fromEntries(
      (customers ?? []).map((u: { id: string; full_name: string | null; email: string }) => [u.id, u])
    );

    const items: PendingCustomerRating[] = unratedMatches.map(m => {
      const req = getReq(m);
      const custId = req?.customer_id ?? null;
      const cust = custId ? custMap[custId] : null;
      return {
        match_id: m.id,
        request_id: m.request_id,
        title: req?.title ?? "—",
        customer_id: custId,
        customer_name: cust?.full_name ?? null,
        customer_email: cust?.email ?? null,
        responded_at: m.responded_at,
      };
    });

    setPendingRatingsState({ kind: "ok", items });
  };

  useEffect(() => {
    if (guard.status !== "ok") return;
    const userId = guard.user.id;

    supabase
      .from("palata_request_matches")
      .select(`
        id, request_id, status, matching_round, decline_reason, responded_at,
        palata_requests ( title, expertise_type, region, urgency, customer_id )
      `)
      .eq("expert_id", userId)
      .order("matching_round", { ascending: true })
      .then(({ data, error }) => {
        if (error) { setMatchState({ kind: "error", message: error.message }); return; }
        setMatchState({ kind: "ok", rows: (data as unknown as Match[]) ?? [] });
      });

    supabase
      .from("palata_expert_profiles")
      .select(`
        id, status, specializations, regions, experience_years,
        education, certifications, accepts_requests, business_trip_ready,
        palata_registry_verified, centrsudexpert_verified,
        palata_registry_number, centrsudexpert_registry_number,
        avg_customer_rating, completed_orders_count, bio
      `)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { setProfileState({ kind: "error", message: error.message }); return; }
        setProfileState({ kind: "ok", profile: data as ExpertProfile | null });
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
    items: matchState.kind === "ok"
      ? matchState.rows.filter((r) => col.statuses.includes(r.status))
      : [],
  }));

  const pendingCount = pendingRatingsState.kind === "ok" ? pendingRatingsState.items.length : null;

  function getRatingForm(matchId: string): RatingFormState {
    return ratingForms[matchId] ?? { kind: "idle", score: 5, comment: "" };
  }
  function setRatingForm(matchId: string, s: RatingFormState) {
    setRatingForms(p => ({ ...p, [matchId]: s }));
  }

  async function handleRateCustomer(item: PendingCustomerRating) {
    const form = getRatingForm(item.match_id);
    if (form.kind !== "idle" || !item.customer_id) return;
    setRatingForm(item.match_id, { kind: "submitting" });
    const { error } = await supabase.from("palata_customer_ratings").insert({
      request_id: item.request_id,
      customer_id: item.customer_id,
      expert_id: user.id,
      score: form.score,
      comment: form.comment || null,
    });
    if (error) { setRatingForm(item.match_id, { kind: "idle", score: 5, comment: "" }); return; }
    await supabase.from("palata_status_events").insert({
      entity_type: "request", entity_id: item.request_id,
      old_status: "completed", new_status: "completed",
      actor_id: null, note: `Эксперт оценил заказчика: ${form.score}/5`,
    });
    if (item.customer_email && item.customer_id) {
      await supabase.from("palata_email_events").insert({
        recipient_id: item.customer_id,
        email_address: item.customer_email,
        template_name: "customer_rated_by_expert",
        subject: `Эксперт оставил вам оценку — ${form.score} из 5`,
        context: { request_id: item.request_id, score: form.score },
        sent_at: new Date().toISOString(),
        error: "TEST_MODE",
      });
    }
    setRatingForm(item.match_id, { kind: "done" });
    setRatedMatchIds(prev => new Set([...prev, item.match_id]));
    if (pendingRatingsState.kind === "ok") {
      setPendingRatingsState({
        kind: "ok",
        items: pendingRatingsState.items.filter(i => i.match_id !== item.match_id),
      });
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-screen-2xl mx-auto">

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Личный кабинет эксперта</p>
          <h1 className="text-xl font-bold text-slate-900">{user.full_name ?? user.email}</h1>
          <p className="text-xs text-slate-400 mt-0.5">{user.email}</p>
        </div>

      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <TabButton active={tab === "profile"} onClick={() => setTab("profile")}>
          <User className="w-3.5 h-3.5" />
          Мой профиль
        </TabButton>
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
          Оценить заказчика
          {pendingCount != null && pendingCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-amber-500 text-white rounded-full">
              {pendingCount}
            </span>
          )}
        </TabButton>
      </div>

      {/* Tab: Requests */}
      {tab === "requests" && (
        <>
          {matchState.kind === "loading" && <LoadingRows />}
          {matchState.kind === "error" && <ErrorCard message={matchState.message} />}
          {matchState.kind === "ok" && matchState.rows.length === 0 && <EmptyState />}
          {matchState.kind === "ok" && matchState.rows.length > 0 && (
            <KanbanBoard
              columns={columns}
              renderCard={(m: Match) => (
                <ExpertCard
                  match={m}
                  needsRating={m.status === "completed" && !ratedMatchIds.has(m.id)}
                />
              )}
              emptyText="Нет обращений"
            />
          )}
        </>
      )}

      {/* Tab: Action Items */}
      {tab === "actions" && (
        <div>
          {aiLoading ? <LoadingRows /> : (
            <ExpertActionInbox
              items={actionItems}
              userId={user.id}
              userEmail={user.email}
              onDone={reloadActionItems}
            />
          )}
        </div>
      )}

      {/* Tab: Rate Customer */}
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
                  Все завершённые заказы уже оценены. Спасибо за обратную связь!
                </p>
              </div>
            </div>
          )}
          {pendingRatingsState.kind === "ok" && pendingRatingsState.items.map(item => {
            const form = getRatingForm(item.match_id);
            return (
              <div key={item.match_id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-[10px] font-mono text-slate-400 mb-0.5">#{item.request_id.slice(0, 8).toUpperCase()}</p>
                    <Link href={`/requests/${item.request_id}`}>
                      <p className="text-sm font-semibold text-slate-800 hover:text-indigo-700 transition-colors cursor-pointer">
                        {item.title}
                      </p>
                    </Link>
                    {(item.customer_name || item.customer_email) && (
                      <p className="text-xs text-slate-500 mt-1">
                        Заказчик: <span className="font-medium text-slate-700">{item.customer_name ?? item.customer_email}</span>
                      </p>
                    )}
                  </div>
                  {item.responded_at && (
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {new Date(item.responded_at).toLocaleDateString("ru-RU")}
                    </span>
                  )}
                </div>

                {form.kind === "done" ? (
                  <p className="text-sm font-medium text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
                    ✓ Оценка сохранена. Спасибо!
                  </p>
                ) : (
                  <div className="space-y-3 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-500 font-medium">Ваша оценка заказчика:</p>
                    <div className="flex gap-1 items-center">
                      {[1, 2, 3, 4, 5].map(s => (
                        <button
                          key={s}
                          onClick={() => form.kind === "idle" && setRatingForm(item.match_id, { ...form, score: s })}
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
                      onChange={e => form.kind === "idle" && setRatingForm(item.match_id, { ...form, comment: e.target.value })}
                    />
                    <button
                      className="btn-primary"
                      disabled={form.kind !== "idle"}
                      onClick={() => handleRateCustomer(item)}
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
          {profileState.kind === "ok" && profileState.profile === null && <NoProfileState />}
          {profileState.kind === "ok" && profileState.profile !== null && (
            <ProfileView profile={profileState.profile} user={user} />
          )}
        </>
      )}
    </div>
  );
}

// ─── Tab button ────────────────────────────────────────────────────────────────

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

// ─── Profile view ──────────────────────────────────────────────────────────────

function ProfileView({ profile: p, user }: { profile: ExpertProfile; user: { full_name?: string | null; email: string } }) {
  const rating = p.avg_customer_rating ? Number(p.avg_customer_rating).toFixed(2) : null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

      {/* Left column */}
      <div className="xl:col-span-1 flex flex-col gap-4">

        {/* Identity card */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
              <User className="w-6 h-6 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{user.full_name ?? "—"}</p>
              <p className="text-xs text-slate-400 truncate">{user.email}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1 rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">Рейтинг</p>
              {rating ? (
                <div className="flex items-center justify-center gap-1">
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <p className="text-base font-bold text-slate-800">{rating}</p>
                </div>
              ) : (
                <p className="text-base font-bold text-slate-400">—</p>
              )}
            </div>
            <div className="flex-1 rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">Выполнено</p>
              <p className="text-base font-bold text-slate-800">{p.completed_orders_count}</p>
            </div>
          </div>
        </div>

        {/* Status flags */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Настройки</p>
          <div className="space-y-2.5">
            <FlagRow active={p.accepts_requests} label="Принимает заказы" activeColor="text-emerald-700 bg-emerald-50" inactiveColor="text-slate-500 bg-slate-50" />
            <FlagRow active={p.business_trip_ready} label="Готов к командировкам" activeColor="text-teal-700 bg-teal-50" inactiveColor="text-slate-500 bg-slate-50" />
          </div>
        </div>

        {/* Registry */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Регистрация</p>
          <div className="space-y-3">
            <RegistryRow verified={p.palata_registry_verified} label="Палата судебных экспертов РФ" number={p.palata_registry_number} />
            <RegistryRow verified={p.centrsudexpert_verified} label="Центр судебных экспертиз" number={p.centrsudexpert_registry_number} />
          </div>
        </div>
      </div>

      {/* Right column */}
      <div className="xl:col-span-2 flex flex-col gap-4">

        {/* Specializations */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className="w-4 h-4 text-slate-400" />
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Направления экспертиз</p>
          </div>
          {p.specializations.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {p.specializations.map((s) => (
                <span key={s} className="text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1">
                  {SPEC_LABEL[s] ?? s}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Не указаны</p>
          )}
        </div>

        {/* Regions */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-slate-400" />
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Регионы работы</p>
          </div>
          {p.regions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {p.regions.map((r) => (
                <span key={r} className="text-xs font-medium text-slate-700 bg-slate-100 rounded-lg px-2.5 py-1">
                  {REGION_LABEL[r] ?? r}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Не указаны</p>
          )}
        </div>

        {/* Bio */}
        {p.bio && (
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-slate-400" />
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Описание опыта</p>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{p.bio}</p>
          </div>
        )}

        {/* Education & Certs */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="w-4 h-4 text-slate-400" />
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Образование и сертификаты</p>
          </div>

          {p.experience_years != null && (
            <p className="text-xs text-slate-500 mb-3">
              Стаж: <span className="font-semibold text-slate-700">{p.experience_years} лет</span>
            </p>
          )}

          {p.education && (
            <p className="text-sm text-slate-600 mb-3">{p.education}</p>
          )}

          {p.certifications && p.certifications.length > 0 && (
            <ul className="space-y-1.5">
              {p.certifications.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  {c}
                </li>
              ))}
            </ul>
          )}

          {!p.education && (!p.certifications || p.certifications.length === 0) && (
            <p className="text-xs text-slate-400">Не заполнено</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function FlagRow({ active, label, activeColor, inactiveColor }: {
  active: boolean; label: string; activeColor: string; inactiveColor: string;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${active ? activeColor : inactiveColor}`}>
      {active ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

function RegistryRow({ verified, label, number }: { verified: boolean; label: string; number: string | null }) {
  return (
    <div className="flex items-start gap-2.5">
      {verified
        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
        : <XCircle className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" />}
      <div>
        <p className={`text-xs font-medium ${verified ? "text-slate-800" : "text-slate-400"}`}>{label}</p>
        {verified && number && <p className="text-[11px] text-slate-400 font-mono mt-0.5">{number}</p>}
        {!verified && <p className="text-[11px] text-slate-400 mt-0.5">Не подтверждено</p>}
      </div>
    </div>
  );
}

// ─── Expert request card ──────────────────────────────────────────────────────

function ExpertCard({ match: m, needsRating }: { match: Match; needsRating?: boolean }) {
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
              {SPEC_LABEL[req.expertise_type] ?? req.expertise_type}
            </p>
          )}
          {req?.region && (
            <p className="text-[11px] text-slate-400 truncate">{REGION_LABEL[req.region] ?? req.region}</p>
          )}
          {m.decline_reason && (
            <span className="inline-block text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
              {DECLINE_LABEL[m.decline_reason] ?? m.decline_reason}
            </span>
          )}
          {needsRating && (
            <span className="inline-block text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
              ★ Оцените заказчика
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

// ─── States ───────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center">
        <Inbox className="w-8 h-8 text-slate-300" />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-slate-700 mb-1">Обращений пока нет</p>
        <p className="text-sm text-slate-400 max-w-xs">
          Система уведомит вас, когда появится заказ, подходящий под вашу специализацию и регион
        </p>
      </div>
    </div>
  );
}

function NoProfileState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center">
        <User className="w-8 h-8 text-slate-300" />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-slate-700 mb-1">Профиль не заполнен</p>
        <p className="text-sm text-slate-400 max-w-xs">
          Профиль эксперта ещё не создан. Обратитесь к администратору для его заполнения.
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

// ─── Expert Action Inbox ───────────────────────────────────────────────────────

const ACTION_LABEL_EX: Record<string, { label: string; color: string }> = {
  customer_selected_you:        { label: "Вас выбрали", color: "text-indigo-700 bg-indigo-50" },
  customer_approved_start_date: { label: "Дата согласована", color: "text-emerald-700 bg-emerald-50" },
  experts_matched:              { label: "Подобраны эксперты", color: "text-indigo-700 bg-indigo-50" },
  expert_declined:              { label: "Эксперт отказался", color: "text-red-700 bg-red-50" },
  expert_can_start_from:        { label: "Предложена дата", color: "text-amber-700 bg-amber-50" },
  expert_completed_order:       { label: "Заказ завершён", color: "text-emerald-700 bg-emerald-50" },
};

function ExpertActionItemHeader({ item }: { item: ActionItem }) {
  const meta = ACTION_LABEL_EX[item.action_type] ?? { label: item.action_type, color: "text-slate-600 bg-slate-100" };
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${meta.color}`}>
            {meta.label}
          </span>
          {!item.is_read && <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0" />}
        </div>
        <p className="text-sm font-semibold text-slate-800 leading-snug">{item.title}</p>
      </div>
      <span className="text-[10px] text-slate-400 flex-shrink-0 tabular-nums">
        {new Date(item.created_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}
      </span>
    </div>
  );
}

function ExpertActionInbox({ items, userId, userEmail, onDone }: {
  items: ActionItem[];
  userId: string;
  userEmail: string;
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
            Здесь появятся задачи, когда заказчик выберет вас или нужно будет принять решение.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-2xl space-y-4">
      {items.map(item => (
        <ExpertActionCard key={item.id} item={item} userId={userId} userEmail={userEmail} onDone={onDone} />
      ))}
    </div>
  );
}

function ExpertActionCard({ item, userId, userEmail, onDone }: {
  item: ActionItem;
  userId: string;
  userEmail: string;
  onDone: () => void;
}) {
  if (item.action_type === "customer_selected_you") {
    return <CustomerSelectedCard item={item} userId={userId} userEmail={userEmail} onDone={onDone} />;
  }
  if (item.action_type === "customer_approved_start_date") {
    return <CustomerApprovedCard item={item} onDone={onDone} />;
  }
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <ExpertActionItemHeader item={item} />
      <p className="text-sm text-slate-600 mt-2">{item.description}</p>
    </div>
  );
}

// ─── customer_selected_you ────────────────────────────────────────────────────

type RequestDetails = {
  title: string;
  expertise_type: string | null;
  region: string | null;
  description: string | null;
  customer_id: string | null;
  requires_travel: boolean;
  status: string;
};

function CustomerSelectedCard({ item, userId, userEmail, onDone }: {
  item: ActionItem;
  userId: string;
  userEmail: string;
  onDone: () => void;
}) {
  const [req, setReq] = useState<RequestDetails | null>(null);
  const [reqLoading, setReqLoading] = useState(true);
  const [action, setAction] = useState<"idle" | "take" | "date" | "decline">("idle");
  const [busy, setBusy] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [comment, setComment] = useState("");
  const [declineReason, setDeclineReason] = useState("other");
  const [declineComment, setDeclineComment] = useState("");

  useEffect(() => {
    supabase.from("palata_requests")
      .select("title, expertise_type, region, description, customer_id, requires_travel, status")
      .eq("id", item.request_id)
      .maybeSingle()
      .then(({ data }) => {
        setReq(data as RequestDetails | null);
        setReqLoading(false);
      });
  }, [item.request_id]);

  async function getCustomerEmail(customerId: string): Promise<string | null> {
    const { data } = await supabase.from("palata_users").select("email").eq("id", customerId).maybeSingle();
    return (data as { email: string } | null)?.email ?? null;
  }

  async function handleTakeWork() {
    setBusy(true);
    const matchId = await getMatchId();
    if (matchId) {
      await supabase.from("palata_request_matches").update({
        status: "accepted_work", responded_at: new Date().toISOString(),
      }).eq("id", matchId);
    }
    await supabase.from("palata_request_matches").update({ status: "closed_by_other_expert" })
      .eq("request_id", item.request_id).neq("expert_id", userId).neq("status", "declined");
    await supabase.from("palata_requests").update({ status: "in_work" }).eq("id", item.request_id);

    const custId = item.customer_id ?? req?.customer_id ?? null;
    if (custId) {
      const custEmail = await getCustomerEmail(custId);
      await createActionItem({
        request_id: item.request_id,
        expert_id: userId,
        customer_id: custId,
        assigned_to_user_id: custId,
        assigned_role: "customer",
        action_type: "expert_started_work",
        title: "Эксперт взял заказ в работу",
        description: "Эксперт принял заказ в работу. Заказ передан на исполнение.",
        payload: { expert_id: userId, expert_email: userEmail },
      });
      if (custEmail) {
        await logEmailTestEvent(custId, custEmail, "expert_took_work",
          "Эксперт принял ваш заказ в работу", { request_id: item.request_id });
      }
    }
    await resolveActionItem(item.id);
    await cancelRequestActionItems(item.request_id, item.id);
    await logStatusEvent(item.request_id, "expert_selection", "in_work", "Эксперт взял заказ в работу");
    setBusy(false);
    onDone();
  }

  async function handleCanStartFrom() {
    if (!startDate) return;
    setBusy(true);
    const matchId = await getMatchId();
    if (matchId) {
      await supabase.from("palata_request_matches").update({
        status: "can_start_from", responded_at: new Date().toISOString(),
      }).eq("id", matchId);
    }

    const custId = item.customer_id ?? req?.customer_id ?? null;
    if (custId) {
      const custEmail = await getCustomerEmail(custId);
      await createActionItem({
        request_id: item.request_id,
        expert_id: userId,
        customer_id: custId,
        assigned_to_user_id: custId,
        assigned_role: "customer",
        action_type: "expert_can_start_from",
        title: "Эксперт предложил дату начала",
        description: `Эксперт готов начать работу с ${new Date(startDate).toLocaleDateString("ru-RU")}`,
        payload: { expert_id: userId, expert_email: userEmail, expert_name: userEmail, start_date: startDate, comment },
      });
      if (custEmail) {
        await logEmailTestEvent(custId, custEmail, "expert_can_start",
          "Эксперт предложил дату начала работы", { request_id: item.request_id, start_date: startDate });
      }
    }
    await resolveActionItem(item.id);
    await logStatusEvent(item.request_id, "expert_selection", "expert_selection",
      `Эксперт предложил дату начала: ${startDate}`);
    setBusy(false);
    onDone();
  }

  async function handleDecline() {
    setBusy(true);
    const matchId = await getMatchId();
    if (matchId) {
      await supabase.from("palata_request_matches").update({
        status: "declined",
        decline_reason: declineReason,
        responded_at: new Date().toISOString(),
      }).eq("id", matchId);
    }

    const custId = item.customer_id ?? req?.customer_id ?? null;
    if (custId) {
      const custEmail = await getCustomerEmail(custId);
      await createActionItem({
        request_id: item.request_id,
        expert_id: userId,
        customer_id: custId,
        assigned_to_user_id: custId,
        assigned_role: "customer",
        action_type: "expert_declined",
        title: "Эксперт отказался от заказа",
        description: `Причина: ${DECLINE_LABEL[declineReason] ?? declineReason}`,
        payload: {
          expert_id: userId,
          decline_reason: declineReason,
          comment: declineComment || null,
        },
      });
      if (custEmail) {
        await logEmailTestEvent(custId, custEmail, "expert_declined_order",
          "Эксперт отказался от заказа", { request_id: item.request_id, reason: declineReason });
      }
    }
    await resolveActionItem(item.id);
    await logStatusEvent(item.request_id, "expert_selection", "matching",
      `Эксперт отказался: ${declineReason} — ${declineComment}`);

    // Check if all active matches are now declined → trigger repeat matching
    try {
      const { data: allMatches } = await supabase
        .from("palata_request_matches")
        .select("id, status")
        .eq("request_id", item.request_id)
        .not("status", "in", '("closed_by_other_expert","withdrawn")');

      const allDeclined =
        allMatches != null &&
        allMatches.length > 0 &&
        allMatches.every((m: { status: string }) =>
          m.status === "declined" || m.status === "withdrawn",
        );

      if (allDeclined && req?.expertise_type && req?.region) {
        const custId2 = item.customer_id ?? req?.customer_id ?? undefined;
        await runMatching({
          requestId: item.request_id,
          expertiseType: req.expertise_type,
          region: req.region,
          requiresTravel: req.requires_travel ?? false,
          customerId: custId2 ?? undefined,
        });
      }
    } catch { /* non-fatal: repeat matching failed */ }

    setBusy(false);
    onDone();
  }

  async function getMatchId(): Promise<string | null> {
    const { data } = await supabase.from("palata_request_matches")
      .select("id").eq("request_id", item.request_id).eq("expert_id", userId).maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  }

  const SPEC_L: Record<string, string> = {
    "avtotechnicheskaya": "Автотехническая", "zemleustroitelnaya": "Землеустроительная",
    "pocherkovedcheskaya": "Почерковедческая", "finansovo-ekonomicheskaya": "Финансово-экономическая",
    "kompyuterno-tehnicheskaya": "Компьютерно-техническая", "stroitelno-tehnicheskaya": "Строительно-техническая",
    "pozharno-tehnicheskaya": "Пожарно-техническая", "tovaroved": "Товароведческая",
    "psihologicheskaya": "Психологическая", "lingvisticheskaya": "Лингвистическая",
  };
  const REG_L: Record<string, string> = {
    "Moskva": "Москва", "Sankt-Peterburg": "Санкт-Петербург", "Krasnodar": "Краснодар",
    "Nizhny Novgorod": "Нижний Новгород", "Ekaterinburg": "Екатеринбург",
  };

  return (
    <div className="bg-white border border-indigo-200 rounded-xl shadow-sm overflow-hidden">
      <div className="p-5">
        <ExpertActionItemHeader item={item} />
        {reqLoading ? (
          <p className="text-xs text-slate-400 mt-3">Загрузка деталей заказа…</p>
        ) : req ? (
          <div className="mt-3 bg-slate-50 rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-sm font-semibold text-slate-800">{req.title}</p>
            <div className="flex flex-wrap gap-2 mt-1">
              {req.expertise_type && (
                <span className="text-[11px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                  {SPEC_L[req.expertise_type] ?? req.expertise_type}
                </span>
              )}
              {req.region && (
                <span className="text-[11px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                  {REG_L[req.region] ?? req.region}
                </span>
              )}
            </div>
            {req.description && (
              <p className="text-xs text-slate-500 leading-relaxed mt-1.5 line-clamp-3">{req.description}</p>
            )}
          </div>
        ) : null}

        {/* Action buttons */}
        {action === "idle" && (
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              disabled={busy}
              onClick={handleTakeWork}
              className="btn-primary text-xs py-1.5 px-4"
            >
              {busy ? "Сохранение…" : "Взять в работу"}
            </button>
            <button
              disabled={busy}
              onClick={() => setAction("date")}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors"
            >
              Могу начать с даты
            </button>
            <button
              disabled={busy}
              onClick={() => setAction("decline")}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-600 hover:border-red-300 hover:text-red-600 transition-colors"
            >
              Отказаться
            </button>
          </div>
        )}

        {/* Date picker form */}
        {action === "date" && (
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-700">Укажите дату готовности начать:</p>
            <input
              type="date"
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 w-full"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
            <textarea
              rows={2}
              placeholder="Комментарий (необязательно)"
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              value={comment}
              onChange={e => setComment(e.target.value)}
            />
            <div className="flex gap-2">
              <button disabled={busy || !startDate} onClick={handleCanStartFrom} className="btn-primary text-xs py-1.5 px-4">
                {busy ? "…" : "Подтвердить дату"}
              </button>
              <button onClick={() => setAction("idle")} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
                Отмена
              </button>
            </div>
          </div>
        )}

        {/* Decline form */}
        {action === "decline" && (
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-700">Причина отказа:</p>
            <select
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300"
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
            >
              {Object.entries(DECLINE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <textarea
              rows={2}
              placeholder="Комментарий (необязательно)"
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
              value={declineComment}
              onChange={e => setDeclineComment(e.target.value)}
            />
            <div className="flex gap-2">
              <button disabled={busy} onClick={handleDecline}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50">
                {busy ? "…" : "Подтвердить отказ"}
              </button>
              <button onClick={() => setAction("idle")} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── customer_approved_start_date ─────────────────────────────────────────────

function CustomerApprovedCard({ item, onDone }: { item: ActionItem; onDone: () => void }) {
  const payload = item.payload ?? {};
  const startDate = payload.start_date as string | null ?? null;
  const [done, setDone] = useState(false);

  async function handleAck() {
    await resolveActionItem(item.id);
    setDone(true);
    onDone();
  }

  if (done) return null;

  return (
    <div className="bg-white border border-emerald-200 rounded-xl p-5 shadow-sm">
      <ExpertActionItemHeader item={item} />
      <div className="mt-3 bg-emerald-50 rounded-xl px-4 py-3 space-y-1">
        {startDate && (
          <p className="text-xs text-slate-700 flex items-center gap-1.5">
            <Calendar className="w-3 h-3 text-emerald-500" />
            <span className="text-slate-400">Дата начала:</span>
            <span className="font-semibold">{new Date(startDate).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })}</span>
          </p>
        )}
        <p className="text-xs text-emerald-700 font-medium">Заказ передан в работу. Ваши контакты открыты для заказчика.</p>
      </div>
      <div className="mt-4">
        <button onClick={handleAck}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
          <CheckCircle2 className="w-3.5 h-3.5" /> Понятно, приступаю
        </button>
      </div>
    </div>
  );
}
