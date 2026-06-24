import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";
import { RegionMultiSelect } from "@/components/RegionMultiSelect";
import { KanbanBoard } from "@/components/KanbanBoard";
import {
  PlusCircle, FileText, User, MapPin, Building2,
  Phone, Mail, ClipboardList, Hash, Star,
  Zap, Calendar, CheckCircle2, XCircle, ChevronDown, ChevronUp, GraduationCap,
  Pencil, X,
} from "lucide-react";
import {
  loadOpenActionItems, createActionItem, resolveActionItem, cancelRequestActionItems,
  logStatusEvent, logEmailTestEvent, type ActionItem,
} from "@/lib/actionItems";

// ─── Action inbox filter ──────────────────────────────────────────────────────
// Only these action types should appear in the customer's "Требуют действия" tab.
// "experts_matched" and "manual_matching_required" are informational only and
// don't require action. "expert_completed_order" lives in the "Оценить эксперта" tab.

const CUSTOMER_INBOX_ALLOWED = new Set(["expert_can_start_from", "expert_declined"]);

function filterCustomerActionItems(items: ActionItem[]): ActionItem[] {
  return items.filter(i => CUSTOMER_INBOX_ALLOWED.has(i.action_type));
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Request = {
  id: string;
  title: string;
  status: string;
  expertise_type: string;
  expertise_direction_id: string | null;
  matching_round: number;
  urgency: string | null;
  created_at: string;
};

type CustomerProfile = {
  company_name: string | null;
  inn: string | null;
  contact_name: string | null;
  notes: string | null;
  region_id: string | null;
  palata_regions: { name: string } | null;
};

type PendingExpertRating = {
  action_item_id: string;
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
  direction_names: string[];
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
  { id: "new",     label: "Новый",          hint: "Заказ создан, подбор не запущен",       dotColor: "bg-slate-400",  bgColor: "bg-white border-slate-200",         accent: "", statuses: ["draft", "new"] },
  { id: "pending", label: "Идёт подбор",   hint: "Система ищет подходящих экспертов",     dotColor: "bg-amber-400",  bgColor: "bg-amber-50/60 border-amber-200",   accent: "", statuses: ["pending", "matching"] },
  { id: "match",   label: "Выбор эксперта",hint: "Эксперты найдены — выберите нужного",   dotColor: "bg-[#0F4C9A]",  bgColor: "bg-[#F4F4F4] border-[#D0D0D0]",    accent: "", statuses: ["expert_selection"] },
  { id: "working", label: "В работе",      hint: "Эксперт принял заказ и ведёт работу",  dotColor: "bg-[#002B5C]",  bgColor: "bg-[#E9E9E9]/60 border-[#D0D0D0]", accent: "", statuses: ["in_progress", "in_work"] },
  { id: "done",    label: "Выполнен",      hint: "Работа завершена, оцените эксперта",    dotColor: "bg-emerald-400",bgColor: "bg-emerald-50/60 border-emerald-200",accent:"", statuses: ["completed"] },
  { id: "closed",  label: "Неактуален",    hint: "Заказ закрыт или отменён",              dotColor: "bg-slate-300",  bgColor: "bg-slate-50 border-slate-200",      accent: "", statuses: ["cancelled", "failed", "declined"] },
];



// ─── Main component ───────────────────────────────────────────────────────────

export default function CustomerDashboard() {
  const guard = useRequireRole("customer");
  const [allDirections, setAllDirections] = useState<Array<{ id: string; name: string; slug: string }>>([]);

  useEffect(() => {
    supabase.from("palata_expertise_directions")
      .select("id, name, slug")
      .eq("is_active", true)
      .then(({ data }) => setAllDirections(data ?? []));
  }, []);
  const directionMap = Object.fromEntries(allDirections.map(d => [d.id, d.name]));
  const slugMap = Object.fromEntries(allDirections.map(d => [d.slug, d.name]));
  const search = useSearch();
  const initialTab = (() => {
    const t = new URLSearchParams(search).get("tab");
    if (t === "actions" || t === "rate" || t === "profile") return t;
    return "requests";
  })();
  const [tab, setTab] = useState<"requests" | "actions" | "rate" | "profile">(initialTab);
  const [requestState, setRequestState] = useState<RequestState>({ kind: "loading" });
  const [profileState, setProfileState] = useState<ProfileState>({ kind: "loading" });
  const [pendingRatingsState, setPendingRatingsState] = useState<PendingRatingsState>({ kind: "loading" });
  const [ratedRequestIds, setRatedRequestIds] = useState<Set<string>>(new Set());
  const [ratingForms, setRatingForms] = useState<Record<string, RatingFormState>>({});
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [userPhone, setUserPhone] = useState<string | null>(null);
  const [myRating, setMyRating] = useState<number | null>(null);

  const loadPendingRatings = async (userId: string) => {
    // Load open expert_completed_order action items assigned to this customer
    const { data: aiData, error: aiErr } = await supabase
      .from("palata_action_items")
      .select("id, request_id, expert_id, payload, created_at")
      .eq("assigned_to_user_id", userId)
      .eq("action_type", "expert_completed_order")
      .eq("is_resolved", false)
      .order("created_at", { ascending: false });

    if (aiErr) { setPendingRatingsState({ kind: "error", message: aiErr.message }); return; }
    if (!aiData || aiData.length === 0) {
      setPendingRatingsState({ kind: "ok", items: [] });
      setRatedRequestIds(new Set());
      return;
    }

    type AiRow = { id: string; request_id: string; expert_id: string | null; payload: Record<string, unknown>; created_at: string };
    const rows = aiData as AiRow[];
    const reqIds = [...new Set(rows.map(a => a.request_id))];

    // Filter out already rated
    const { data: ratings } = await supabase
      .from("palata_expert_ratings")
      .select("request_id")
      .eq("customer_id", userId)
      .in("request_id", reqIds);

    const ratedIds = new Set((ratings ?? []).map((r: { request_id: string }) => r.request_id));
    setRatedRequestIds(ratedIds);

    const unrated = rows.filter(a => !ratedIds.has(a.request_id));
    if (unrated.length === 0) {
      setPendingRatingsState({ kind: "ok", items: [] });
      return;
    }

    // Fetch expert info and request titles in parallel
    const expertIds = [...new Set(unrated.map(a => a.expert_id).filter(Boolean))] as string[];
    const unratedReqIds = [...new Set(unrated.map(a => a.request_id))];

    const [{ data: experts }, { data: reqs }] = await Promise.all([
      supabase.from("palata_users").select("id, full_name, email").in("id", expertIds),
      supabase.from("palata_requests").select("id, title").in("id", unratedReqIds),
    ]);

    const expertMap = Object.fromEntries(
      (experts ?? []).map((u: { id: string; full_name: string | null; email: string }) => [u.id, u])
    );
    const reqMap = Object.fromEntries(
      (reqs ?? []).map((r: { id: string; title: string }) => [r.id, r])
    );

    const items: PendingExpertRating[] = unrated.map(a => {
      const eid = a.expert_id ?? (a.payload.expert_id as string | null) ?? "";
      const expert = expertMap[eid];
      const req = reqMap[a.request_id];
      return {
        action_item_id:    a.id,
        request_id:        a.request_id,
        title:             req?.title ?? a.request_id,
        assigned_expert_id: eid,
        expert_name:       expert?.full_name ?? null,
        expert_email:      expert?.email ?? null,
        updated_at:        a.created_at,
      };
    });

    setPendingRatingsState({ kind: "ok", items });
  };

  useEffect(() => {
    if (guard.status !== "ok") return;
    const userId = guard.user.id;

    supabase
      .from("palata_requests")
      .select("id, title, status, expertise_type, expertise_direction_id, matching_round, urgency, created_at")
      .eq("customer_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) { setRequestState({ kind: "error", message: error.message }); return; }
        setRequestState({ kind: "ok", rows: (data as Request[]) ?? [] });
      });

    supabase
      .from("palata_customer_profiles")
      .select("company_name, inn, contact_name, notes, region_id, palata_regions(name)")
      .eq("user_id", userId)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (error) { setProfileState({ kind: "error", message: error.message }); return; }
        if (data !== null) {
          setProfileState({ kind: "ok", profile: data as unknown as CustomerProfile });
          return;
        }
        // Profile row missing — restore from auth metadata (email-confirmation registration path)
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const meta = authUser?.user_metadata ?? {};
        const metaRegionId    = (meta.region_id    ?? null) as string | null;
        const metaCompany     = (meta.company_name ?? null) as string | null;
        const metaInn         = (meta.inn          ?? null) as string | null;
        const metaContactName = (meta.contact_name ?? null) as string | null;
        const metaNotes       = (meta.notes        ?? null) as string | null;
        if (metaRegionId || metaCompany || metaInn || metaContactName || metaNotes) {
          await supabase.from("palata_customer_profiles").upsert({
            user_id:      userId,
            region_id:    metaRegionId,
            company_name: metaCompany,
            inn:          metaInn,
            contact_name: metaContactName,
            notes:        metaNotes,
          }, { onConflict: "user_id" });
          const { data: healed } = await supabase
            .from("palata_customer_profiles")
            .select("company_name, inn, contact_name, notes, region_id, palata_regions(name)")
            .eq("user_id", userId)
            .maybeSingle();
          setProfileState({ kind: "ok", profile: healed as CustomerProfile | null });
        } else {
          setProfileState({ kind: "ok", profile: null });
        }
      });


    supabase
      .from("palata_users")
      .select("phone")
      .eq("id", userId)
      .single()
      .then(({ data }) => setUserPhone((data as { phone: string | null } | null)?.phone ?? null));

    // Load avg rating that experts gave to this customer
    supabase
      .from("palata_customer_ratings")
      .select("score")
      .eq("customer_id", userId)
      .then(({ data }) => {
        const rows = (data ?? []) as { score: number }[];
        if (rows.length > 0) {
          const avg = rows.reduce((s, r) => s + r.score, 0) / rows.length;
          setMyRating(avg);
        }
      });

    loadPendingRatings(userId);

    setAiLoading(true);
    loadOpenActionItems(userId).then(items => {
      setActionItems(filterCustomerActionItems(items));
      setAiLoading(false);
    });
  }, [guard.status]);

  function reloadRequests() {
    if (guard.status !== "ok") return;
    const userId = guard.user.id;
    supabase
      .from("palata_requests")
      .select("id, title, status, expertise_type, expertise_direction_id, matching_round, urgency, created_at")
      .eq("customer_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error) setRequestState({ kind: "ok", rows: (data as Request[]) ?? [] });
      });
  }

  function reloadActionItems() {
    if (guard.status !== "ok") return;
    loadOpenActionItems(guard.user.id).then(items => setActionItems(filterCustomerActionItems(items)));
    reloadRequests();
  }

  function reloadProfile() {
    if (guard.status !== "ok") return;
    const uid = guard.user.id;
    supabase.from("palata_users").select("phone").eq("id", uid).single()
      .then(({ data }) => setUserPhone((data as { phone: string | null } | null)?.phone ?? null));
    supabase.from("palata_customer_profiles")
      .select("company_name, inn, contact_name, notes, region_id, palata_regions(name)")
      .eq("user_id", uid).maybeSingle()
      .then(({ data, error }) => {
        if (!error) setProfileState({ kind: "ok", profile: data as CustomerProfile | null });
      });
  }

  useEffect(() => {
    function handleVisible() {
      if (document.visibilityState === "visible") reloadActionItems();
    }
    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  }, [guard.status]);

  useEffect(() => {
    if (guard.status !== "ok") return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") reloadActionItems();
    }, 30_000);
    return () => clearInterval(id);
  }, [guard.status]);

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

    // 1. Insert rating
    const { error } = await supabase.from("palata_expert_ratings").insert({
      request_id: item.request_id,
      expert_id:  item.assigned_expert_id,
      customer_id: user.id,
      score:      form.score,
      comment:    form.comment || null,
    });
    if (error) { setRatingForm(item.request_id, { kind: "idle", score: 5, comment: "" }); return; }

    // 2. Resolve the expert_completed_order action item
    await resolveActionItem(item.action_item_id);

    // 3. Status event
    await logStatusEvent(item.request_id!, "completed", "completed",
      `Заказчик оценил эксперта: ${form.score}/5`);

    // 4. Email test event to expert
    if (item.expert_email) {
      await logEmailTestEvent(item.assigned_expert_id, item.expert_email,
        "customer_rated_expert",
        `Вас оценил заказчик — ${form.score} из 5`,
        { request_id: item.request_id, score: form.score });
    }

    setRatingForm(item.request_id, { kind: "done" });
    setRatedRequestIds(prev => new Set([...prev, item.request_id]));
    if (pendingRatingsState.kind === "ok") {
      setPendingRatingsState({
        kind: "ok",
        items: pendingRatingsState.items.filter(i => i.request_id !== item.request_id),
      });
    }
    reloadActionItems();
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-screen-2xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Личный кабинет заказчика</p>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{user.full_name ?? user.email}</h1>
              {myRating != null && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  {myRating.toFixed(1)}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{user.email}</p>
            <button
              onClick={() => setTab(tab === "profile" ? "requests" : "profile")}
              className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-all ${
                tab === "profile"
                  ? "bg-[#002B5C] border-[#002B5C] text-white"
                  : "bg-[#0F4C9A] border-[#0F4C9A] text-white hover:bg-[#002B5C] hover:border-[#002B5C]"
              }`}
            >
              <User className="w-3.5 h-3.5" />
              Мой профиль
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-slate-200 overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6 scrollbar-none">
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
        <Link href="/customer/new-request" className="flex-shrink-0 pb-px">
          <button className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full bg-[#CC2222] text-white hover:bg-[#a81c1c] active:bg-[#8e1717] transition-colors shadow-sm">
            <PlusCircle className="w-3.5 h-3.5" />
            Создать заказ
          </button>
        </Link>
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
              renderCard={(r: Request) => <CustomerCard request={r} needsRating={r.status === "completed" && !ratedRequestIds.has(r.id)} directionMap={directionMap} />}
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
                      <p className="text-sm font-semibold text-slate-800 hover:text-[#002B5C] transition-colors cursor-pointer">
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
            <ProfileView
              user={{ ...user, phone: userPhone }}
              profile={profileState.profile}
              userId={user.id}
              initialRegionIds={profileState.profile?.region_id ? [profileState.profile.region_id] : []}
              onSave={reloadProfile}
            />
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
      className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition-all rounded-full border-b-2 -mb-px
        ${active
          ? "bg-[#0F4C9A] text-white border-transparent shadow-sm"
          : "border-transparent text-[#002B5C] hover:bg-[#0F4C9A]/10 hover:text-[#0F4C9A]"
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
  userId,
  initialRegionIds,
  onSave,
}: {
  user: { full_name?: string | null; email: string; phone?: string | null };
  profile: CustomerProfile | null;
  userId: string;
  initialRegionIds: string[];
  onSave: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [fullName, setFullName]         = useState(user.full_name ?? "");
  const [phone, setPhone]               = useState(user.phone ?? "");
  const [companyName, setCompanyName]   = useState(profile?.company_name ?? "");
  const [inn, setInn]                   = useState(profile?.inn ?? "");
  const [contactName, setContactName]   = useState(profile?.contact_name ?? "");
  const [regionIds, setRegionIds]       = useState<string[]>(initialRegionIds);
  const [notes, setNotes]               = useState(profile?.notes ?? "");

  useEffect(() => {
    setRegionIds(initialRegionIds);
  }, [initialRegionIds.join(",")]);

  function beginEdit() {
    setFullName(user.full_name ?? "");
    setPhone(user.phone ?? "");
    setCompanyName(profile?.company_name ?? "");
    setInn(profile?.inn ?? "");
    setContactName(profile?.contact_name ?? "");
    setNotes(profile?.notes ?? "");
    setSavedOk(false);
    setSaveErr(null);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setSaveErr(null);
    const cpPayload = {
      company_name: companyName.trim() || null,
      inn:          inn.trim() || null,
      contact_name: contactName.trim() || null,
      notes:        notes.trim() || null,
      region_id:    regionIds[0] ?? null,
    };
    console.log("[profile-save] regionIds:", regionIds);
    console.log("[profile-save] regionIds[0]:", regionIds[0]);
    console.log("[profile-save] palata_customer_profiles payload:", cpPayload);
    const [r1, r2] = await Promise.all([
      supabase.from("palata_users")
        .update({ full_name: fullName.trim() || null, phone: phone.trim() || null })
        .eq("id", userId),
      supabase.from("palata_customer_profiles")
        .update(cpPayload)
        .eq("user_id", userId)
        .select(),
    ]);
    console.log("[profile-save] palata_customer_profiles response → data:", (r2 as { data: unknown }).data, "error:", r2.error);
    if (r1.error || r2.error) {
      setSaving(false);
      setSaveErr((r1.error ?? r2.error)!.message);
      return;
    }
    setSaving(false);
    setEditing(false);
    setSavedOk(true);
    onSave();
    setTimeout(() => setSavedOk(false), 3000);
  }

  const ic = "w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30 focus:border-[#0F4C9A] bg-white";

  if (editing) {
    return (
      <div className="max-w-xl space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-700">Редактирование профиля</p>
          <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors">
            <X className="w-3.5 h-3.5" /> Отмена
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Личные данные</p>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">ФИО</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className={ic} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Телефон</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 (999) 000-00-00" className={ic} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
            <input value={user.email} disabled className={`${ic} bg-slate-50 text-slate-400 cursor-not-allowed`} />
            <p className="text-[10px] text-slate-400 mt-0.5">Email нельзя изменить</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Организация</p>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Компания</label>
            <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} className={ic} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">ИНН</label>
            <input type="text" value={inn} onChange={e => setInn(e.target.value)} className={`${ic} font-mono`} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Контактное лицо</label>
            <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} className={ic} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Регион</label>
            <RegionMultiSelect
              selectedIds={regionIds}
              onChange={setRegionIds}
              max={1}
              placeholder="Выберите регион…"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Примечания</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={`${ic} resize-none`} />
          </div>
        </div>

        {saveErr && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{saveErr}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={handleSave} disabled={saving}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
            <CheckCircle2 className="w-4 h-4" />
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
          <button onClick={() => setEditing(false)}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            Отмена
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-4xl">

      <div className="xl:col-span-3 flex items-center justify-end gap-3 -mb-2">
        {savedOk && (
          <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Профиль сохранён
          </span>
        )}
        <button onClick={beginEdit}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-[#F4F4F4] hover:border-[#D0D0D0] hover:text-[#002B5C] transition-all">
          <Pencil className="w-3.5 h-3.5" />
          Редактировать профиль
        </button>
      </div>

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
                  value={profile.palata_regions?.name ?? "Регион не указан"}
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
                Нажмите «Редактировать профиль», чтобы добавить данные о компании.
              </p>
            </div>
            <button onClick={beginEdit}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-[#D0D0D0] text-[#002B5C] bg-[#F4F4F4] hover:bg-[#E9E9E9] transition-all">
              <Pencil className="w-3.5 h-3.5" />
              Заполнить профиль
            </button>
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

function CustomerCard({ request: r, needsRating, directionMap = {} }: { request: Request; needsRating?: boolean; directionMap?: Record<string, string> }) {
  const urgencyColor = r.urgency === "very_urgent" ? "border-l-red-400"
    : r.urgency === "urgent" ? "border-l-amber-400"
    : "border-l-[#D0D0D0]";

  const urgencyLabel: Record<string, string> = {
    urgent: "Срочно",
    very_urgent: "Очень срочно",
  };

  return (
    <Link href={`/requests/${r.id}`}>
      <div className={`bg-white rounded-xl border border-slate-100 border-l-[3px] ${urgencyColor} p-3.5 hover:shadow-md hover:border-[#D0D0D0] transition-all cursor-pointer group shadow-sm`}>
        <p className="text-xs font-semibold text-slate-800 leading-snug mb-2 line-clamp-2 group-hover:text-[#002B5C] transition-colors">
          {r.title}
        </p>

        <div className="space-y-1 mb-2.5">
          {(r.expertise_direction_id || r.expertise_type) && (
            <p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
              <span className="inline-block h-1 w-1 rounded-full bg-[#666666] flex-shrink-0" />
              {directionMap[r.expertise_direction_id ?? ""] ?? r.expertise_type}
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
      <div className="w-16 h-16 rounded-2xl bg-[#F4F4F4] flex items-center justify-center">
        <FileText className="w-8 h-8 text-[#D0D0D0]" />
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
      <div className="h-5 w-5 rounded-full border-2 border-[#D0D0D0] border-t-[#002B5C] animate-spin" />
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="flex items-center gap-3 py-12 text-sm text-slate-400">
      <div className="h-4 w-4 rounded-full border-2 border-[#D0D0D0] border-t-[#002B5C] animate-spin" />
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
        <div className="w-16 h-16 rounded-2xl bg-[#F4F4F4] flex items-center justify-center">
          <Zap className="w-8 h-8 text-[#666666]" />
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
  if (item.action_type === "expert_can_start_from") {
    return <ExpertCanStartCard item={item} userId={userId} onDone={onDone} />;
  }
  if (item.action_type === "expert_declined") {
    return <ExpertDeclinedCard item={item} onDone={onDone} />;
  }
  return null;
}

// ─── expert_declined ──────────────────────────────────────────────────────────

function ExpertDeclinedCard({ item, onDone }: {
  item: ActionItem;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [reqTitle, setReqTitle] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("palata_requests").select("title").eq("id", item.request_id).maybeSingle()
      .then(({ data }) => { if (data) setReqTitle((data as { title: string }).title); });
  }, [item.request_id]);

  const expertName = (item.payload?.expert_name as string | null) ?? null;

  async function handleAck() {
    setBusy(true);
    await resolveActionItem(item.id);
    onDone();
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
      <ActionItemHeader item={item} />
      <p className="text-sm text-slate-600 mt-2">
        Эксперт не может взять заказ{reqTitle ? ` «${reqTitle}»` : ""}. Выберите другого эксперта.
      </p>
      {expertName && (
        <p className="text-xs text-slate-400 mt-1">Эксперт: {expertName}</p>
      )}
      <div className="mt-4">
        <button
          onClick={handleAck}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0F4C9A] text-white rounded-xl hover:bg-[#002B5C] transition-colors disabled:opacity-50"
        >
          {busy ? "…" : "Ознакомлен"}
        </button>
      </div>
    </div>
  );
}

// ─── experts_matched / choose_another_expert ──────────────────────────────────

function ExpertsMatchedCard({ item, userId, onDone }: {
  item: ActionItem;
  userId: string;
  onDone: () => void;
}) {
  const [experts, setExperts] = useState<MatchedExpert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [selectedExpertId, setSelectedExpertId] = useState<string | null>(null);
  const [slugMap, setSlugMap] = useState<Record<string, string>>({});
  const [dismissing, setDismissing] = useState(false);
  const [blockedByInWork, setBlockedByInWork] = useState(false);

  useEffect(() => {
    supabase.from("palata_expertise_directions").select("slug, name").eq("is_active", true)
      .then(({ data }) => {
        const m: Record<string, string> = {};
        for (const d of data ?? []) if (d.slug) m[d.slug] = d.name;
        setSlugMap(m);
      });
  }, []);

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

      const [{ data: profiles }, { data: users }, { data: expertDirs }, { data: expertRegs }] = await Promise.all([
        supabase.from("palata_expert_profiles").select(
          "user_id, experience_years, business_trip_ready, palata_registry_verified, palata_registry_number, centrsudexpert_verified, centrsudexpert_registry_number, avg_customer_rating, completed_orders_count, bio"
        ).in("user_id", expertIds),
        supabase.from("palata_users").select("id, full_name, email").in("id", expertIds),
        supabase.from("palata_expert_directions")
          .select("expert_id, palata_expertise_directions(name)")
          .in("expert_id", expertIds),
        supabase.from("palata_expert_regions")
          .select("expert_id, palata_regions(name)")
          .in("expert_id", expertIds),
      ]);

      type PRow = {
        user_id: string;
        experience_years: number | null; business_trip_ready: boolean;
        palata_registry_verified: boolean; palata_registry_number: string | null;
        centrsudexpert_verified: boolean; centrsudexpert_registry_number: string | null;
        avg_customer_rating: number | null; completed_orders_count: number; bio: string | null;
      };
      type URow = { id: string; full_name: string | null; email: string };
      type MRow = { id: string; expert_id: string; status: string; decline_reason: string | null };
      type EDRow = { expert_id: string; palata_expertise_directions: { name: string }[] };
      type ERRow = { expert_id: string; palata_regions: { name: string } | { name: string }[] | null };

      const pm = Object.fromEntries(((profiles ?? []) as PRow[]).map(p => [p.user_id, p]));
      const um = Object.fromEntries(((users ?? []) as URow[]).map(u => [u.id, u]));

      const dirNamesMap: Record<string, string[]> = {};
      for (const row of (expertDirs ?? []) as unknown as EDRow[]) {
        for (const d of row.palata_expertise_directions ?? []) {
          if (d.name) (dirNamesMap[row.expert_id] ??= []).push(d.name);
        }
      }

      const regNamesMap: Record<string, string[]> = {};
      for (const row of (expertRegs ?? []) as unknown as ERRow[]) {
        const rg = row.palata_regions;
        const name = Array.isArray(rg) ? rg[0]?.name : rg?.name;
        if (name) (regNamesMap[row.expert_id] ??= []).push(name);
      }

      setExperts(((matches ?? []) as MRow[]).map(m => {
        const p = pm[m.expert_id] as PRow | undefined;
        const u = um[m.expert_id] as URow | undefined;
        return {
          match_id: m.id,
          match_status: m.status,
          expert_id: m.expert_id,
          expert_name: u?.full_name ?? null,
          expert_email: u?.email ?? null,
          direction_names: dirNamesMap[m.expert_id] ?? [],
          regions: regNamesMap[m.expert_id] ?? [],
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
    // Fresh DB check — guard against stale UI when another expert already took the work
    console.log("[choose-expert] fresh assigned check", { requestId: item.request_id, expertId: expert.expert_id });
    const { data: reqCheck } = await supabase
      .from("palata_requests").select("status").eq("id", item.request_id).maybeSingle();
    const freshStatus = (reqCheck as { status: string } | null)?.status;
    if (freshStatus === "in_work" || freshStatus === "completed" || freshStatus === "cancelled") {
      console.log("[choose-expert] blocked because request already assigned", { freshStatus });
      setBlockedByInWork(true);
      return;
    }

    // Optimistic: immediately mark as selected so button deactivates before any network call
    setSelectedExpertId(expert.expert_id);
    setSelecting(expert.expert_id);
    const now = new Date().toISOString();

    // 1. Match → contacts_opened (customer selected this expert)
    await supabase.from("palata_request_matches").update({
      status: "contacts_opened", responded_at: now,
    }).eq("id", expert.match_id);

    // 2. Request: keep expert_selection, set assigned_expert_id
    await supabase.from("palata_requests").update({
      assigned_expert_id: expert.expert_id, status: "expert_selection",
    }).eq("id", item.request_id);

    // 3. Open contacts immediately — fetch customer contact info
    const { data: custUserData } = await supabase
      .from("palata_users")
      .select("email, phone")
      .eq("id", userId)
      .maybeSingle();
    const custU = custUserData as { email: string | null; phone: string | null } | null;

    // Use only base columns that exist in all schema versions
    const baseContactPayload = {
      revealed_at: now,
      customer_email: custU?.email ?? null,
      customer_phone: custU?.phone ?? null,
      expert_email: expert.expert_email ?? null,
    };

    const { data: existingContact } = await supabase
      .from("palata_request_contacts")
      .select("id")
      .eq("request_id", item.request_id)
      .eq("expert_id", expert.expert_id)
      .maybeSingle();

    if (existingContact) {
      await supabase.from("palata_request_contacts")
        .update(baseContactPayload)
        .eq("id", (existingContact as { id: string }).id);
    } else {
      await supabase.from("palata_request_contacts").insert({
        request_id: item.request_id,
        expert_id: expert.expert_id,
        customer_id: userId,
        ...baseContactPayload,
      });
      // Ignore insert errors — contacts are a convenience; match status is the source of truth
    }

    // 4. Action item for expert
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

    // 5. Resolve customer's action item
    await resolveActionItem(item.id);

    // 6. Events
    await logStatusEvent(item.request_id!, "matching", "expert_selection",
      `Заказчик выбрал эксперта: ${expert.expert_name ?? expert.expert_id}`);

    if (expert.expert_email) {
      await logEmailTestEvent(expert.expert_id, expert.expert_email,
        "customer_selected_you", "Заказчик выбрал вас для работы",
        { request_id: item.request_id });
    }
    onDone();
  }

  const isDecline = item.action_type === "expert_declined";

  async function handleDismiss() {
    setDismissing(true);
    await resolveActionItem(item.id);
    onDone();
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="p-5">
        <ActionItemHeader item={item} />
        <p className="text-sm text-slate-600 mt-2">{item.description}</p>

        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setExpanded(v => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#002B5C] hover:text-[#0a1a0f] transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {isDecline ? "Выбрать другого эксперта" : "Посмотреть экспертов"}
            {!loading && experts.length > 0 && (
              <span className="ml-1 text-[#666666] font-normal">({experts.length})</span>
            )}
          </button>

          <button
            onClick={handleDismiss}
            disabled={dismissing}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 border border-slate-200 hover:border-slate-300 px-3 py-1 rounded-full transition-colors disabled:opacity-50"
          >
            {dismissing ? "…" : "Понятно"}
          </button>
        </div>
      </div>

      {blockedByInWork && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4">
          <p className="text-sm text-slate-500">На заказ уже назначен эксперт.</p>
        </div>
      )}

      {!blockedByInWork && expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-3">
          {loading && <div className="flex items-center gap-2 text-xs text-slate-400 py-4"><div className="h-3.5 w-3.5 rounded-full border-2 border-[#D0D0D0] border-t-[#002B5C] animate-spin" />Загрузка экспертов…</div>}
          {!loading && experts.length === 0 && (
            <p className="text-xs text-slate-400 py-4 text-center">Нет доступных экспертов</p>
          )}
          {!loading && experts.map(expert => (
            <ExpertProfileCard
              key={expert.expert_id}
              expert={expert}
              slugMap={slugMap}
              busy={selecting === expert.expert_id}
              selected={selectedExpertId === expert.expert_id}
              anySelected={selectedExpertId !== null}
              onSelect={() => handleSelect(expert)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── expert_can_start_from ────────────────────────────────────────────────────

const REQUEST_STATUS_LABEL: Record<string, string> = {
  new: "Новый", pending: "Ожидает", matching: "Подбор",
  expert_selection: "Выбор эксперта", in_work: "В работе",
  in_progress: "В работе", completed: "Выполнен", cancelled: "Отменён",
};

function ExpertCanStartCard({ item, userId, onDone }: {
  item: ActionItem;
  userId: string;
  onDone: () => void;
}) {
  const payload = item.payload ?? {};
  const expertId = item.expert_id ?? (payload.expert_id as string | null) ?? null;
  // support both old key (start_date) and new key (can_start_from)
  const canStartFrom = ((payload.can_start_from ?? payload.start_date) as string | null) ?? null;
  const comment = (payload.comment as string | null) ?? null;

  const [reqTitle, setReqTitle]     = useState<string | null>(null);
  const [reqStatus, setReqStatus]   = useState<string | null>(null);
  const [expertName, setExpertName] = useState<string | null>((payload.expert_name as string | null) ?? null);
  const [expertEmail, setExpertEmail] = useState<string | null>((payload.expert_email as string | null) ?? null);
  const [loading, setLoading]       = useState(true);
  const [busy, setBusy]             = useState<"approve" | "decline" | null>(null);
  const [done, setDone]             = useState(false);
  const [blockedByInWork, setBlockedByInWork] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: reqData }, { data: expertData }] = await Promise.all([
        supabase.from("palata_requests")
          .select("title, status")
          .eq("id", item.request_id)
          .maybeSingle(),
        expertId
          ? supabase.from("palata_users")
              .select("full_name, email")
              .eq("id", expertId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      const r = reqData as { title: string; status: string } | null;
      setReqTitle(r?.title ?? null);
      setReqStatus(r?.status ?? null);

      // Guard: if request is already in_work, auto-resolve this action item
      if (r?.status === "in_work") {
        setBlockedByInWork(true);
        await resolveActionItem(item.id);
        setLoading(false);
        onDone();
        return;
      }

      const e = expertData as { full_name: string | null; email: string } | null;
      if (e?.full_name) setExpertName(e.full_name);
      if (e?.email) setExpertEmail(prev => prev ?? e!.email);
      setLoading(false);
    }
    load();
  }, [item.request_id, expertId]);

  const shortId = `#${item.request_id?.slice(0, 8).toUpperCase() ?? ""}`;
  const startFmt = canStartFrom
    ? new Date(canStartFrom).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })
    : null;

  async function handleApprove() {
    if (!expertId) return;

    // Guard: request may have been approved by another expert while page was open
    const { data: reqCheck } = await supabase
      .from("palata_requests").select("status").eq("id", item.request_id).maybeSingle();
    if ((reqCheck as { status: string } | null)?.status === "in_work") {
      setBlockedByInWork(true);
      await resolveActionItem(item.id);
      onDone();
      return;
    }

    setBusy("approve");

    // 1. Close customer's action item — request stays in expert_selection
    await resolveActionItem(item.id);

    // 2. Action item for expert: you_are_approved_for_work
    //    Expert must still confirm before order goes to in_work
    await createActionItem({
      request_id:          item.request_id,
      expert_id:           expertId,
      customer_id:         userId,
      assigned_to_user_id: expertId,
      assigned_role:       "expert",
      action_type:         "you_are_approved_for_work",
      title:               "Вы назначены на заказ",
      description:         "Заказчик подтвердил выбор вас как исполнителя. Подтвердите готовность взять заказ в работу.",
      payload:             { can_start_from: canStartFrom, start_date: canStartFrom, customer_id: userId },
    });

    // 3. Events
    await logStatusEvent(item.request_id!, "expert_selection", "expert_selection", "customer_approved_start_date");
    if (expertId && expertEmail) {
      await logEmailTestEvent(expertId, expertEmail, "you_are_approved_for_work",
        "Заказчик подтвердил вашу кандидатуру",
        { request_id: item.request_id, can_start_from: canStartFrom });
    }

    setBusy(null);
    setDone(true);
    onDone();
  }

  async function handleDecline() {
    if (!expertId) return;
    setBusy("decline");

    // 1. Match → customer_declined_start_date + reason for ExpertCard badge
    await supabase.from("palata_request_matches")
      .update({ status: "customer_declined_start_date", decline_reason: "customer_declined_date" })
      .eq("request_id", item.request_id)
      .eq("expert_id", expertId);

    // 2. Resolve customer's action item
    await resolveActionItem(item.id);

    // 3. New action item for customer: choose_another_expert
    await createActionItem({
      request_id:          item.request_id,
      expert_id:           expertId,
      customer_id:         userId,
      assigned_to_user_id: userId,
      assigned_role:       "customer",
      action_type:         "choose_another_expert",
      title:               "Выберите другого эксперта",
      description:         `Вы можете выбрать другого эксперта из ранее подобранных по заказу ${shortId}`,
      payload:             { request_id: item.request_id, excluded_expert_id: expertId },
    });

    // 4. Action item for expert: customer declined the proposed date
    await createActionItem({
      request_id:          item.request_id,
      expert_id:           expertId,
      customer_id:         userId,
      assigned_to_user_id: expertId,
      assigned_role:       "expert",
      action_type:         "customer_declined_start_date",
      title:               "Заказчик отклонил предложенную дату",
      description:         `Заказчик не согласился с предложенной вами датой начала по заказу ${shortId}. Ваша заявка отклонена.`,
      payload:             { request_id: item.request_id },
    });

    // 5. Events
    await logStatusEvent(item.request_id!, "expert_selection", "expert_selection", "customer_declined_start_date");
    if (expertId && expertEmail) {
      await logEmailTestEvent(expertId, expertEmail, "customer_declined_start_date",
        "Заказчик отклонил предложенную дату",
        { request_id: item.request_id });
    }

    setBusy(null);
    setDone(true);
    onDone();
  }

  if (done) return null;

  if (blockedByInWork) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <ActionItemHeader item={item} />
        <p className="text-sm text-slate-400 mt-2">На заказ уже назначен эксперт.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-amber-200 rounded-xl shadow-sm overflow-hidden">
      <div className="p-5">
        <ActionItemHeader item={item} />

        {/* Request name as subtitle under header */}
        {!loading && reqTitle && (
          <p className="text-sm text-slate-600 mt-1">работы по заказу «{reqTitle}»</p>
        )}

        {/* Expert proposal */}
        <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 space-y-1.5">
          {expertName && (
            <p className="text-xs text-slate-700">
              <span className="text-slate-400">Эксперт: </span>
              <span className="font-semibold">{expertName}</span>
            </p>
          )}
          {startFmt && (
            <p className="text-xs text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3 h-3 text-amber-500 shrink-0" />
              <span className="text-slate-400">Готов начать:</span>
              <span className="font-semibold">{startFmt}</span>
            </p>
          )}
          {comment && (
            <p className="text-xs text-slate-500 italic">«{comment}»</p>
          )}
        </div>

        {/* Actions */}
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

function ExpertProfileCard({ expert: e, slugMap, busy, selected, anySelected, onSelect }: {
  expert: MatchedExpert;
  slugMap: Record<string, string>;
  busy: boolean;
  selected: boolean;
  anySelected: boolean;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rating = e.avg_customer_rating ? Number(e.avg_customer_rating).toFixed(1) : null;

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-colors ${selected ? "border-emerald-300" : "border-slate-200"}`}>
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
                <span className="text-[11px] text-[#002B5C] bg-[#F4F4F4] px-1.5 py-0.5 rounded">Командировки ✓</span>
              )}
            </div>
          </div>
          {selected ? (
            <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Выбран
            </span>
          ) : (
            <button
              disabled={busy || anySelected}
              onClick={onSelect}
              className="shrink-0 btn-primary text-xs py-1.5 px-3 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "…" : "Выбрать"}
            </button>
          )}
        </div>

        {(e.direction_names.length > 0 || e.regions.length > 0) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {e.direction_names.slice(0, 3).map(n => (
              <span key={n} className="text-[10px] font-medium text-[#002B5C] bg-[#F4F4F4] px-1.5 py-0.5 rounded">
                {n}
              </span>
            ))}
            {e.regions.slice(0, 2).map(r => (
              <span key={r} className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                {r}
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
  experts_matched:              { label: "Подобраны эксперты",       color: "text-[#002B5C] bg-[#F4F4F4]" },
  expert_declined:              { label: "Эксперт отказался",        color: "text-red-700 bg-red-50" },
  expert_can_start_from:        { label: "Предложена дата",          color: "text-amber-700 bg-amber-50" },
  expert_completed_order:       { label: "Заказ завершён",           color: "text-emerald-700 bg-emerald-50" },
  expert_started_work:          { label: "Эксперт взял в работу",   color: "text-emerald-700 bg-emerald-50" },
  customer_selected_you:        { label: "Вас выбрали",              color: "text-[#002B5C] bg-[#F4F4F4]" },
  customer_approved_start_date: { label: "Дата согласована",         color: "text-emerald-700 bg-emerald-50" },
  choose_another_expert:        { label: "Выберите другого эксперта",color: "text-amber-700 bg-amber-50" },
  manual_matching_required:     { label: "Нет доступных экспертов",  color: "text-slate-600 bg-slate-100" },
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
