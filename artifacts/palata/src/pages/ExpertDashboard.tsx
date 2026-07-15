import { useEffect, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { fetchUsers } from "@/lib/users";
import { fetchRequests } from "@/lib/requests";
import { runMatching } from "@/lib/matching";
import { declineRequest } from "@/lib/declineRequest";
import { useRequireRole } from "@/lib/useRequireRole";
import { RegionMultiSelect } from "@/components/RegionMultiSelect";
import { KanbanBoard } from "@/components/KanbanBoard";
import { CertificateInputList } from "@/components/CertificateInputList";
import {
  verifyCertificate, mergeDirectionIds, normalizeCertNumber,
  type CertResult,
} from "@/lib/certificates";
import { getToken } from "@/lib/authClient";
import {
  Inbox, Star, User, CheckCircle2, XCircle, MapPin,
  Briefcase, FileText, GraduationCap, ClipboardList, Zap, Calendar,
  Pencil, X, Upload, Phone,
} from "lucide-react";
import {
  loadOpenActionItems, resolveActionItem,
  logEmailTestEvent, type ActionItem,
} from "@/lib/actionItems";

// ─── Action inbox filter ──────────────────────────────────────────────────────
const EXPERT_INBOX_EXCLUDED: string[] = [];

function filterExpertActionItems(items: ActionItem[]): ActionItem[] {
  return items.filter(i => !EXPERT_INBOX_EXCLUDED.includes(i.action_type));
}

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
    expertise_direction_id: string | null;
    urgency: string | null;
    customer_id: string | null;
    status: string | null;
  } | null;
};

type ExpertProfile = {
  id: string;
  status: string;
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

type ExpertDocument = {
  id: string;
  doc_type: string;
  file_name: string;
  bucket_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  verified: boolean;
  created_at: string;
};

type DocsState =
  | { kind: "loading" }
  | { kind: "ok"; docs: ExpertDocument[] }
  | { kind: "error"; message: string };

// ─── Lookup tables ────────────────────────────────────────────────────────────


// Валидные значения enum palata_decline_reason — те же что в RequestDetail
const DECLINE_REASONS: { value: string; label: string }[] = [
  { value: "busy",          label: "Занят" },
  { value: "not_competent", label: "Вне компетенции" },
  { value: "location",      label: "Регион не подходит" },
  { value: "conflict",      label: "Конфликт интересов" },
  { value: "conditions",    label: "Условия не подходят" },
  { value: "other",         label: "Другое" },
];

// Используется только для отображения сохранённого decline_reason в карточках канбана
const DECLINE_LABEL: Record<string, string> = Object.fromEntries(
  DECLINE_REASONS.map(r => [r.value, r.label])
);

// ─── Kanban config ─────────────────────────────────────────────────────────────

const COLUMNS = [
  { id: "proposed",  label: "Новые предложения", hint: "Примите решение по этим заказам",      accent: "", dotColor: "bg-amber-400",    bgColor: "bg-amber-50/60 border-amber-200",    statuses: ["proposed", "contacts_opened"] },
  { id: "cantake",   label: "Могу взять",        hint: "Вы откликнулись, ждёте заказчика",    accent: "", dotColor: "bg-[#0F4C9A]",   bgColor: "bg-[#F4F4F4] border-[#D0D0D0]",     statuses: ["can_start_from"] },
  { id: "accepted",  label: "В работе",          hint: "Заказчик выбрал вас, ведите работу",  accent: "", dotColor: "bg-[#002B5C]",   bgColor: "bg-[#E9E9E9]/60 border-[#D0D0D0]",  statuses: ["accepted", "accepted_work"] },
  { id: "completed", label: "Завершено",         hint: "Работа сдана, ожидайте оценки",       accent: "", dotColor: "bg-emerald-400", bgColor: "bg-emerald-50/60 border-emerald-200", statuses: ["completed"] },
  { id: "declined",  label: "Отказ",                    hint: "Вы отказались от выполнения заказа", accent: "", dotColor: "bg-slate-300",  bgColor: "bg-slate-50 border-slate-200",     statuses: ["declined", "withdrawn"] },
  { id: "missed",    label: "Назначен другой эксперт", hint: "Вас не утвердили на заказ",          accent: "", dotColor: "bg-orange-300", bgColor: "bg-orange-50/50 border-orange-200", statuses: ["customer_declined_start_date", "closed_by_other_expert"] },
];

// ─── Main component ──────────────────────────────────────────────────────────

export default function ExpertDashboard() {
  const guard = useRequireRole("expert");
  const search = useSearch();
  const initialTab = (() => {
    const p = new URLSearchParams(search).get("tab");
    if (p === "actions" || p === "profile" || p === "market") return p;
    return "requests";
  })();
  const [tab, setTab] = useState<"requests" | "actions" | "rate-customer" | "profile" | "market">(initialTab);
  const [matchState, setMatchState] = useState<MatchState>({ kind: "loading" });
  const [profileState, setProfileState] = useState<ProfileState>({ kind: "loading" });
  const [pendingRatingsState, setPendingRatingsState] = useState<PendingRatingsState>({ kind: "loading" });
  const [ratedMatchIds, setRatedMatchIds] = useState<Set<string>>(new Set());
  const [ratingForms, setRatingForms] = useState<Record<string, RatingFormState>>({});
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [userPhone, setUserPhone] = useState<string | null>(null);
  const [docsState, setDocsState] = useState<DocsState>({ kind: "loading" });
  const [allDirections, setAllDirections] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    fetch("/api/palata/expertise-directions")
      .then(r => r.json())
      .then(b => setAllDirections(b.rows ?? []))
      .catch(() => {});
  }, []);

  const directionsMap = Object.fromEntries(allDirections.map(d => [d.id, d.name]));

  const loadPendingRatings = async (userId: string) => {
    // Fetch completed matches
    const pendingRes = await fetch("/api/palata/requests/expert/matches?status=completed", {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    }).then(r => r.json()).catch(() => ({ success: false, rows: [] }));
    const matchErr = pendingRes.success ? null : { message: pendingRes.error ?? "Ошибка загрузки" };
    const rawMatches = pendingRes.success ? (pendingRes.rows ?? []) : null;

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

    // Derive all customer ids upfront so we can run ratings + users in parallel
    const allCustomerIds = [...new Set(
      completedMatches.map(m => getReq(m)?.customer_id).filter(Boolean)
    )] as string[];

    // Parallel: check which requests are already rated + fetch customer info
    const [{ data: ratings }, { data: customers }] = await Promise.all([
      fetch(`/api/palata/customer-ratings?expert_id=${encodeURIComponent(userId)}&request_ids=${encodeURIComponent(reqIds.join(","))}`)
        .then(r => r.json())
        .then(b => ({ data: (b.rows ?? []) as { request_id: string }[] }))
        .catch(() => ({ data: [] as { request_id: string }[] })),
      allCustomerIds.length > 0
        ? fetchUsers(allCustomerIds).then(rows => ({ data: rows, error: null }))
        : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
    ]);

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

    // ── Critical queries: needed for first visible render ──────────────────
    fetch("/api/palata/requests/expert/matches", {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    })
      .then(r => r.json())
      .then((b: { success: boolean; rows?: unknown[]; error?: string }) => {
        if (!b.success) { setMatchState({ kind: "error", message: b.error ?? "Ошибка загрузки" }); return; }
        setMatchState({ kind: "ok", rows: (b.rows as unknown as Match[]) ?? [] });
      })
      .catch(e => setMatchState({ kind: "error", message: String(e) }));

    fetch(`/api/palata/expert-profile/${userId}`)
      .then(r => r.json())
      .then(b => {
        if (!b.success) { setProfileState({ kind: "error", message: b.message ?? "Failed to load profile" }); return; }
        setProfileState({ kind: "ok", profile: b.profile as ExpertProfile | null });
      })
      .catch(e => setProfileState({ kind: "error", message: String(e) }));

    // ── Background queries: deferred so critical requests get first pick ───
    const bgTimer = setTimeout(() => {
      fetchUsers([userId])
        .then(rows => setUserPhone((rows[0] as { phone: string | null } | undefined)?.phone ?? null));

      fetch(`/api/palata/expert-documents/${encodeURIComponent(userId)}`)
        .then(r => r.json())
        .then(b => {
          if (!b.success) { setDocsState({ kind: "error", message: b.message ?? "Ошибка загрузки" }); return; }
          setDocsState({ kind: "ok", docs: (b.rows ?? []) as ExpertDocument[] });
        })
        .catch(e => { setDocsState({ kind: "error", message: String(e) }); });

      loadPendingRatings(userId);

      setAiLoading(true);
      loadOpenActionItems(userId).then(items => {
        setActionItems(filterExpertActionItems(items));
        setAiLoading(false);
      });
    }, 50);

    return () => clearTimeout(bgTimer);
  }, [guard.status]);

  function reloadMatches(): Promise<void> {
    if (guard.status !== "ok") return Promise.resolve();
    const userId = guard.user.id;
    return fetch("/api/palata/requests/expert/matches", {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    })
      .then(r => r.json())
      .then((b: { success: boolean; rows?: unknown[] }) => {
        if (b.success) setMatchState({ kind: "ok", rows: (b.rows as unknown as Match[]) ?? [] });
      })
      .catch(() => {});
  }

  function reloadActionItems() {
    if (guard.status !== "ok") return;
    Promise.all([
      loadOpenActionItems(guard.user.id).then(items => setActionItems(filterExpertActionItems(items))),
      reloadMatches(),
    ]);
  }

  // Optimistic update: immediately mark match as declined in local state so the
  // kanban switches columns without waiting for the async Supabase reload.
  function handleMatchDeclined(requestId: string) {
    setMatchState(prev => {
      if (prev.kind !== "ok") return prev;
      return {
        kind: "ok",
        rows: prev.rows.map(r =>
          r.request_id === requestId
            ? { ...r, status: "declined" as Match["status"] }
            : r,
        ),
      };
    });
  }

  function reloadProfile() {
    if (guard.status !== "ok") return;
    const uid = guard.user.id;
    fetchUsers([uid])
      .then(rows => setUserPhone((rows[0] as { phone: string | null } | undefined)?.phone ?? null));
    fetch(`/api/palata/expert-profile/${uid}`)
      .then(r => r.json())
      .then(b => {
        if (b.success) setProfileState({ kind: "ok", profile: b.profile as ExpertProfile | null });
      });
  }

  function reloadDocs() {
    if (guard.status !== "ok") return;
    const uid = guard.user.id;
    fetch(`/api/palata/expert-documents/${encodeURIComponent(uid)}`)
      .then(r => r.json())
      .then(b => {
        if (!b.success) { setDocsState({ kind: "error", message: b.message ?? "Ошибка загрузки" }); return; }
        setDocsState({ kind: "ok", docs: (b.rows ?? []) as ExpertDocument[] });
      })
      .catch(e => { setDocsState({ kind: "error", message: String(e) }); });
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
    items: matchState.kind === "ok"
      ? matchState.rows.filter((r) => {
          if (!col.statuses.includes(r.status)) return false;
          // Hide matches for cancelled requests
          if (r.palata_requests?.status === "cancelled") return false;
          // Hide auto-matched "proposed" offers until customer explicitly selects
          // the expert (signalled by responded_at being set in handleSelectExpert).
          if (r.status === "proposed" && !r.responded_at) return false;
          return true;
        })
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
    const insRes = await fetch("/api/palata/customer-ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_id: item.request_id,
        customer_id: item.customer_id,
        expert_id: user.id,
        score: form.score,
        comment: form.comment || null,
      }),
    }).then(r => r.json()).catch(() => ({ success: false }));
    if (!insRes.success) { setRatingForm(item.match_id, { kind: "idle", score: 5, comment: "" }); return; }
    if (item.customer_email && item.customer_id) {
      await fetch("/api/palata/email-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_id: item.customer_id,
          email_address: item.customer_email,
          template_name: "customer_rated_by_expert",
          subject: `Эксперт оставил вам оценку — ${form.score} из 5`,
          context: { request_id: item.request_id, score: form.score },
          sent_at: new Date().toISOString(),
          error: "TEST_MODE",
        }),
      }).catch(() => {});
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
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Личный кабинет эксперта</p>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-slate-900">{user.full_name ?? user.email}</h1>
          {profileState.kind === "ok" && profileState.profile?.avg_customer_rating != null && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              {Number(profileState.profile.avg_customer_rating).toFixed(1)}
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

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200 overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6 scrollbar-none">
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
        <TabButton active={tab === "rate-customer"} onClick={() => setTab("rate-customer")}>
          <Star className="w-3.5 h-3.5" />
          Оценить заказчика
          {pendingCount !== null && pendingCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold bg-amber-500 text-white rounded-full">
              {pendingCount}
            </span>
          )}
        </TabButton>
        <button
          onClick={() => setTab("market")}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition-all rounded-full border-b-2 -mb-px
            ${tab === "market"
              ? "bg-[#CC2222] text-white border-transparent shadow-sm"
              : "border-transparent text-[#CC2222] hover:bg-[#CC2222]/10"
            }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          Рынок
        </button>
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
                  directionsMap={directionsMap}
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
              onMatchDeclined={handleMatchDeclined}
            />
          )}
        </div>
      )}

      {/* Tab: Rate Customer */}
      {tab === "rate-customer" && (
        <div className="space-y-4">
          {pendingRatingsState.kind === "loading" && <LoadingRows />}
          {pendingRatingsState.kind === "error" && <ErrorCard message={pendingRatingsState.message} />}
          {pendingRatingsState.kind === "ok" && pendingRatingsState.items.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">Нет заказов, требующих оценки заказчика</div>
          )}
          {pendingRatingsState.kind === "ok" && pendingRatingsState.items.map(item => {
            const form = getRatingForm(item.match_id);
            const idleForm = form.kind === "idle" ? form : null;
            const isSubmitting = form.kind === "submitting";
            return (
              <div key={item.match_id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <h2 className="text-sm font-semibold text-slate-700">Требуется оценка заказчика</h2>
                </div>
                <p className="text-sm text-slate-800 mb-1">Заказ: {item.title}</p>
                {item.customer_name && (
                  <p className="text-sm text-slate-500 mb-3">Заказчик: {item.customer_name}</p>
                )}
                {form.kind === "done" ? (
                  <p className="text-sm text-emerald-600 font-medium">Оценка сохранена. Спасибо!</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-500">Ваша оценка заказчика:</p>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(s => (
                        <button
                          key={s}
                          disabled={isSubmitting}
                          onClick={() => idleForm && setRatingForm(item.match_id, { ...idleForm, score: s })}
                          className={`text-2xl transition-colors ${idleForm && idleForm.score >= s ? "text-amber-400" : "text-slate-200"}`}
                        >★</button>
                      ))}
                      <span className="ml-2 text-sm text-slate-500 self-center">
                        {idleForm ? `${idleForm.score} / 5` : ""}
                      </span>
                    </div>
                    <input
                      type="text"
                      disabled={isSubmitting}
                      placeholder="Комментарий (необязательно)"
                      value={idleForm?.comment ?? ""}
                      onChange={e => idleForm && setRatingForm(item.match_id, { ...idleForm, comment: e.target.value })}
                      className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <button
                      disabled={isSubmitting || !item.customer_id}
                      onClick={() => handleRateCustomer(item)}
                      className="btn-primary"
                    >
                      {isSubmitting ? "Сохранение…" : "Отправить оценку"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Market */}
      {tab === "market" && (
        <MarketTab
          userId={user.id}
          profile={profileState.kind === "ok" ? profileState.profile : null}
          allDirections={allDirections}
          liveMatchStatuses={matchState.kind === "ok"
            ? Object.fromEntries(matchState.rows.map(r => [r.request_id, r.status]))
            : undefined}
        />
      )}

      {/* Tab: Profile */}
      {tab === "profile" && (
        <>
          {profileState.kind === "loading" && <LoadingRows />}
          {profileState.kind === "error" && <ErrorCard message={profileState.message} />}
          {profileState.kind === "ok" && profileState.profile === null && <NoProfileState />}
          {profileState.kind === "ok" && profileState.profile !== null && (
            <div className="space-y-6">
              <ProfileView
                profile={profileState.profile}
                user={{ ...user, phone: userPhone }}
                userId={user.id}
                allDirections={allDirections}
                onSave={reloadProfile}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Market Tab ───────────────────────────────────────────────────────────────

type MarketOrder = {
  id: string;
  title: string;
  status: string;
  expertise_direction_id: string | null;
  region_id: string | null;
  requires_travel: boolean;
  description: string | null;
  created_at: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_rating: number | null;
};

type MarketState =
  | { kind: "loading" }
  | { kind: "ok"; orders: MarketOrder[]; myMatchStatuses: Record<string, string> }
  | { kind: "error"; message: string };

const MATCH_STATUS_LABEL: Record<string, string> = {
  can_start_from: "Вы откликнулись",
  proposed: "Вы предложены",
  contacts_opened: "Контакты открыты",
  accepted: "В работе",
  accepted_work: "В работе",
  declined: "Вы отказались",
  withdrawn: "Отозвано",
  closed_by_other_expert: "Назначен другой эксперт",
};

type MarketBadge = { label: string; cls: string } | null;
function getMarketBadge(status: string | undefined): MarketBadge {
  if (!status || status === "proposed") return null; // auto-matched, no expert action yet
  if (status === "declined" || status === "withdrawn")
    return { label: "Вы отказались", cls: "bg-red-50 text-red-700 border border-red-200" };
  if (status === "can_start_from")
    return { label: "Вы откликнулись", cls: "bg-amber-50 text-amber-700 border border-amber-200" };
  // contacts_opened / accepted / accepted_work — handled in "Мои заказы"
  return { label: MATCH_STATUS_LABEL[status] ?? status, cls: "bg-slate-100 text-slate-600 border border-slate-200" };
}

type SortBy = "rating_desc" | "date_desc" | "date_asc";

function MarketTab({ userId, profile, allDirections, liveMatchStatuses }: {
  userId: string;
  profile: ExpertProfile | null;
  allDirections: Array<{ id: string; name: string }>;
  liveMatchStatuses?: Record<string, string>;
}) {
  const [state, setState] = useState<MarketState>({ kind: "loading" });
  const [filterDirection, setFilterDirection] = useState("");
  const [filterRegion, setFilterRegion] = useState("");
  const [filterTravel, setFilterTravel] = useState<"all" | "remote" | "travel">("all");
  const [filterMyStatus, setFilterMyStatus] = useState<"all" | "new" | "responded">("all");
  const [sortBy, setSortBy] = useState<SortBy>("rating_desc");
  const allDirs = allDirections;
  const [allRegs, setAllRegs] = useState<Array<{ id: string; name: string }>>([]);
  const [takeDates, setTakeDates] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [certErrors, setCertErrors] = useState<Record<string, boolean>>({});
  const [blockedOrders, setBlockedOrders] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/palata/regions")
      .then(r => r.json())
      .then(b => {
        const list = (b.rows ?? []) as { id: string; name: string }[];
        list.sort((a, b) => {
          if (a.name === "Вся Россия") return -1;
          if (b.name === "Вся Россия") return 1;
          return 0;
        });
        setAllRegs(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadMarket(); }, [userId]);

  async function loadMarket() {
    setState({ kind: "loading" });

    // Show all requests except "неактуально" (cancelled) and "в работе" (completed / in_work)
    const HIDDEN_STATUSES = ["cancelled", "completed", "in_work"];

    const marketRes = await fetch("/api/palata/requests/expert/market", {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    }).then(r => r.json()).catch(() => ({ success: false, error: "FETCH_FAILED", orders: [], myMatches: [] }));

    if (!marketRes.success) { setState({ kind: "error", message: marketRes.error ?? "Ошибка загрузки" }); return; }

    type RawOrder = {
      id: string; title: string; status: string;
      expertise_direction_id: string | null; region_id: string | null;
      requires_travel: boolean; description: string | null;
      created_at: string; customer_id: string | null;
    };

    const allOrders = (marketRes.orders ?? []) as RawOrder[];

    if (allOrders.length === 0) {
      setState({ kind: "ok", orders: [], myMatchStatuses: {} });
      return;
    }

    // Fetch only this expert's matches to show their personal status on each card
    const matchList = (marketRes.myMatches ?? []) as Array<{ request_id: string; expert_id: string; status: string }>;

    const myMatchStatuses: Record<string, string> = {};
    matchList.forEach(m => { myMatchStatuses[m.request_id] = m.status; });

    // All experts see all qualifying orders — no filtering by other experts' matches
    const marketOrders = allOrders;

    if (marketOrders.length === 0) {
      setState({ kind: "ok", orders: [], myMatchStatuses });
      return;
    }

    const customerIds = [...new Set(marketOrders.map(o => o.customer_id).filter(Boolean))] as string[];

    const [{ data: customers }, { data: ratings }] = await Promise.all([
      customerIds.length > 0
        ? fetchUsers(customerIds).then(rows => ({ data: rows, error: null }))
        : Promise.resolve({ data: [] }),
      customerIds.length > 0
        ? fetch(`/api/palata/customer-ratings?customer_ids=${encodeURIComponent(customerIds.join(","))}`)
            .then(r => r.json())
            .then(b => ({ data: (b.rows ?? []) as { customer_id: string; score: number }[] }))
            .catch(() => ({ data: [] as { customer_id: string; score: number }[] }))
        : Promise.resolve({ data: [] as { customer_id: string; score: number }[] }),
    ]);

    const ratingAcc: Record<string, number[]> = {};
    for (const r of ratings ?? []) {
      const cr = r as { customer_id: string; score: number };
      if (!ratingAcc[cr.customer_id]) ratingAcc[cr.customer_id] = [];
      ratingAcc[cr.customer_id].push(cr.score);
    }
    const avgRating = (id: string): number => {
      const s = ratingAcc[id]; return s?.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;
    };
    const custMap = Object.fromEntries(
      (customers ?? []).map((u: { id: string; full_name: string | null; email: string }) => [u.id, u])
    );

    const result: MarketOrder[] = marketOrders.map(o => {
      const c = o.customer_id ? custMap[o.customer_id] : null;
      return {
        ...o,
        customer_name: c?.full_name ?? null,
        customer_email: c?.email ?? null,
        customer_rating: o.customer_id ? avgRating(o.customer_id) : null,
      };
    }).sort((a, b) => (b.customer_rating ?? 0) - (a.customer_rating ?? 0));

    setState({ kind: "ok", orders: result, myMatchStatuses });
  }

  async function handleTake(order: MarketOrder) {
    const date = takeDates[order.id];
    if (!date) return;
    setSubmitting(p => ({ ...p, [order.id]: true }));
    setCertErrors(p => ({ ...p, [order.id]: false }));
    try {
      // ── Certificate check: expert must have a valid verified cert for this direction ──
      if (order.expertise_direction_id) {
        const today = new Date().toISOString().slice(0, 10);
        const _certQp = new URLSearchParams({ expert_ids: userId, status: "verified", valid_from: today, direction_id: order.expertise_direction_id, limit: "1" });
        const _certApiRes = await fetch(`/api/palata/expert-certificate?${_certQp}`);
        const _certApiBody = await _certApiRes.json().catch(() => null);
        const certs = (_certApiBody?.rows ?? []) as { id: string }[];
        if (!certs || certs.length === 0) {
          setCertErrors(p => ({ ...p, [order.id]: true }));
          return;
        }
      }

      const apRes = await fetch(`/api/palata/requests/${order.id}/apply-market`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken() ?? ""}`,
        },
        body: JSON.stringify({ date }),
      }).then(r => r.json()).catch(() => ({ success: false }));

      // ── Guard: request was taken while the page was open ──
      if (apRes.alreadyInWork) {
        setBlockedOrders(p => ({ ...p, [order.id]: true }));
        return;
      }

      if (!apRes.success) return;

      await loadMarket();
    } catch (_e) {
      // silently retry
    } finally {
      setSubmitting(p => ({ ...p, [order.id]: false }));
    }
  }

  const dirsMap = Object.fromEntries(allDirs.map(d => [d.id, d.name]));
  const regsMap = Object.fromEntries(allRegs.map(r => [r.id, r.name]));

  const baseStatuses = state.kind === "ok" ? state.myMatchStatuses : {};
  const myMatchStatuses = liveMatchStatuses
    ? { ...baseStatuses, ...liveMatchStatuses }
    : baseStatuses;

  const filtered = state.kind === "ok" ? state.orders
    .filter(o => {
      if (filterDirection && o.expertise_direction_id !== filterDirection) return false;
      if (filterRegion && o.region_id !== filterRegion) return false;
      if (filterTravel === "remote" && o.requires_travel) return false;
      if (filterTravel === "travel" && !o.requires_travel) return false;
      const ms = myMatchStatuses[o.id];
      if (ms === "declined" || ms === "withdrawn") return false;
      if (filterMyStatus === "new" && ms && ms !== "proposed") return false;
      if (filterMyStatus === "responded" && ms !== "can_start_from") return false;
      return true;
    })
    .slice()
    .sort((a, b) => {
      if (sortBy === "rating_desc")
        return (b.customer_rating ?? 0) - (a.customer_rating ?? 0);
      if (sortBy === "date_desc")
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      // date_asc
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    })
  : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-bold text-slate-700">Заказы на рынке</h2>
        {state.kind === "ok" && (
          <button onClick={loadMarket} className="text-xs text-[#0F4C9A] hover:underline">Обновить</button>
        )}
      </div>

      {/* Filters + Sort */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={filterDirection}
          onChange={e => setFilterDirection(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30"
        >
          <option value="">Все направления</option>
          {allDirs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select
          value={filterRegion}
          onChange={e => setFilterRegion(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30"
        >
          <option value="">Все регионы</option>
          {allRegs.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select
          value={filterTravel}
          onChange={e => setFilterTravel(e.target.value as "all" | "remote" | "travel")}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30"
        >
          <option value="all">Все форматы</option>
          <option value="remote">Дистанционно</option>
          <option value="travel">Выезд</option>
        </select>
        <select
          value={filterMyStatus}
          onChange={e => setFilterMyStatus(e.target.value as "all" | "new" | "responded")}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30"
        >
          <option value="all">Мой статус: все</option>
          <option value="new">Новые (без действий)</option>
          <option value="responded">Вы откликнулись</option>
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortBy)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30 ml-auto"
        >
          <option value="rating_desc">↓ По рейтингу заказчика</option>
          <option value="date_desc">↓ Новые сначала</option>
          <option value="date_asc">↑ Старые сначала</option>
        </select>
      </div>

      {state.kind === "loading" && <LoadingRows />}
      {state.kind === "error" && <ErrorCard message={state.message} />}

      {state.kind === "ok" && !profile?.accepts_requests && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700">
          Для просмотра рынка включите приём заявок в профиле.
        </div>
      )}

      {state.kind === "ok" && profile?.accepts_requests && filtered.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-sm">
          <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>Нет подходящих заказов на рынке</p>
          <p className="text-xs mt-1 text-slate-300">Заказы появятся, когда автоподбор не найдёт совпадений</p>
        </div>
      )}

      {state.kind === "ok" && filtered.map(order => {
        const myStatus = myMatchStatuses[order.id];
        const badge = getMarketBadge(myStatus);
        // Can respond if not already responded (proposed = auto-matched = can still apply; declined = cannot)
        const canRespond = !myStatus || myStatus === "proposed";
        const isOpen = expanded[order.id];

        return (
          <div key={order.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div
              className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => setExpanded(p => ({ ...p, [order.id]: !p[order.id] }))}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{order.title}</p>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    {order.expertise_direction_id && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-[#0F4C9A]/8 text-[#0F4C9A] px-2 py-0.5 rounded-full font-medium">
                        <GraduationCap className="w-3 h-3" />
                        {dirsMap[order.expertise_direction_id] ?? "—"}
                      </span>
                    )}
                    {order.region_id && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                        <MapPin className="w-3 h-3" />
                        {regsMap[order.region_id] ?? "—"}
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${order.requires_travel ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                      {order.requires_travel ? "Выезд" : "Дистанционно"}
                    </span>
                    {order.customer_rating != null && order.customer_rating > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 font-semibold">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        {order.customer_rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {badge && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
                      {badge.label}
                    </span>
                  )}
                  <span className="text-slate-300 text-xs">{isOpen ? "▲" : "▼"}</span>
                </div>
              </div>
            </div>

            {isOpen && (
              <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/50">
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div>
                    <span className="text-slate-400">Заказчик:</span>{" "}
                    <span className="font-medium">{order.customer_name ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Дата размещения:</span>{" "}
                    <span className="font-medium">
                      {new Date(order.created_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Регион:</span>{" "}
                    <span className="font-medium">{order.region_id ? regsMap[order.region_id] ?? "—" : "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Формат:</span>{" "}
                    <span className="font-medium">{order.requires_travel ? "Выезд" : "Дистанционно"}</span>
                  </div>
                </div>
                {order.description && (
                  <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                    {order.description}
                  </p>
                )}

                {canRespond && blockedOrders[order.id] && (
                  <div className="border-t border-slate-100 pt-3">
                    <p className="text-sm text-slate-500">На заказ уже назначен эксперт.</p>
                  </div>
                )}
                {canRespond && !blockedOrders[order.id] && (
                  <div className="border-t border-slate-100 pt-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Могу взять с</label>
                      <input
                        type="date"
                        value={takeDates[order.id] ?? ""}
                        min={new Date().toISOString().split("T")[0]}
                        onChange={e => {
                          setTakeDates(p => ({ ...p, [order.id]: e.target.value }));
                          setCertErrors(p => ({ ...p, [order.id]: false }));
                        }}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#CC2222]/30"
                      />
                      <button
                        disabled={!takeDates[order.id] || submitting[order.id]}
                        onClick={() => handleTake(order)}
                        className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#CC2222] text-white hover:bg-[#A01818] transition-colors disabled:opacity-40"
                      >
                        {submitting[order.id] ? "…" : "Откликнуться"}
                      </button>
                    </div>
                    {certErrors[order.id] && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800 leading-relaxed">
                        <p className="font-semibold mb-0.5">Сертификат не найден</p>
                        <p>
                          Вам необходимо получить сертификат Палаты судебных экспертов
                          по данному направлению, прежде чем откликаться на этот заказ.{" "}
                          <a
                            href="https://палатаэкспертов.рф/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline font-semibold text-amber-900 hover:text-amber-700"
                          >
                            палатаэкспертов.рф
                          </a>
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {!canRespond && badge && (
                  <div className="border-t border-slate-100 pt-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg ${badge.cls}`}>
                      {myStatus === "can_start_from" && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {badge.label}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
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

// ─── Profile view ──────────────────────────────────────────────────────────────

function ProfileView({
  profile: p,
  user,
  userId,
  allDirections,
  onSave,
}: {
  profile: ExpertProfile;
  user: { full_name?: string | null; email: string; phone?: string | null };
  userId: string;
  allDirections: Array<{ id: string; name: string }>;
  onSave: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [fullName, setFullName]       = useState(user.full_name ?? "");
  const [phone, setPhone]             = useState(user.phone ?? "");
  const [bio, setBio]                 = useState(p.bio ?? "");
  const [expYears, setExpYears]       = useState(p.experience_years?.toString() ?? "");
  const [education, setEducation]     = useState(p.education ?? "");
  const [dirIds, setDirIds]           = useState<string[]>([]);
  const [regs, setRegs]               = useState<string[]>([]);
  const [regionNames, setRegionNames] = useState<string[]>([]);
  const [certNumbers, setCertNumbers]     = useState<string[]>([""]);
  const [certResults, setCertResultsS]    = useState<(CertResult | null)[]>([null]);
  const [certVerifying, setCertVerifying] = useState<boolean[]>([false]);
  const [certWarnMsgs, setCertWarnMsgs]   = useState<string[]>([]);
  const [certsLoaded, setCertsLoaded]     = useState(false);

  const PALATA_URL = "палатаэкспертов.рф";

  useEffect(() => {
    fetch(`/api/palata/expert-directions/${userId}`)
      .then(r => r.json())
      .then(b =>
        setDirIds((b.rows ?? []).map((r: { expertise_direction_id: string }) => r.expertise_direction_id))
      );
    fetch(`/api/palata/expert-regions/${userId}`)
      .then(r => r.json())
      .then(b => {
        const rows = (b.rows ?? []) as { region_id: string; region_name: string | null }[];
        if (rows.length > 0) {
          setRegs(rows.map(r => r.region_id));
          setRegionNames(rows.map(r => r.region_name ?? r.region_id));
        }
      });
  }, [userId]);

  // Load certs separately (depends on allDirections for auto-heal fallback)
  useEffect(() => {
    if (!userId || !allDirections.length) return;

    async function loadAndAutoHeal() {
      const _loadCertRes = await fetch(`/api/palata/expert-certificate/${userId}`);
      const _loadCertBody = await _loadCertRes.json().catch(() => null);
      const data = (_loadCertBody?.rows ?? []) as { certificate_number: string; status: string; cert_valid_to: string | null; cert_direction_ids: string[] }[];

      if (data && data.length > 0) {
        setCertNumbers(data.map((c: { certificate_number: string }) => c.certificate_number));
        setCertResultsS(data.map(() => null));
        setCertVerifying(data.map(() => false));
        return;
      }

      // Fallback for existing experts whose metadata has no verified_certs:
      // re-verify using the cert number stored in their profile
      if (p.palata_registry_verified && p.palata_registry_number) {
        const result = await verifyCertificate(p.palata_registry_number, allDirections, user.full_name ?? "");
        if (result?.status === "verified") {
          const _insApiRes = await fetch("/api/palata/expert-certificate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
            },
            body: JSON.stringify({ certs: [{ certificate_number: result.number, status: "verified", cert_valid_to: result.validTo ?? null, cert_expert_name: result.expertName ?? null, cert_direction_ids: result.directionIds }] }),
          });
          const _insApiBody = await _insApiRes.json().catch(() => null);
          const insErr = (!_insApiRes.ok || !_insApiBody?.success) ? { message: _insApiBody?.message ?? String(_insApiRes.status) } : null;
          if (!insErr) {
            if (result.directionIds.length > 0) {
              await fetch("/api/palata/expert-directions", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
                },
                body: JSON.stringify({ direction_ids: result.directionIds }),
              });
              setDirIds(result.directionIds);
            }
            setCertNumbers([result.number]);
            setCertResultsS([null]);
            setCertVerifying([false]);
          }
        }
      }
    }

    loadAndAutoHeal().finally(() => setCertsLoaded(true));
  }, [userId, allDirections.length]);
  const [tripReady, setTripReady]     = useState(p.business_trip_ready);
  const [accepts, setAccepts]         = useState(p.accepts_requests);
  const [palataOk, setPalataOk]       = useState(p.palata_registry_verified);
  const [palataNum, setPalataNum]     = useState(p.palata_registry_number ?? "");
  const [centrsudOk, setCentrsudOk]   = useState(p.centrsudexpert_verified);
  const [centrsudNum, setCentrsudNum] = useState(p.centrsudexpert_registry_number ?? "");

  function beginEdit() {
    setFullName(user.full_name ?? "");
    setPhone(user.phone ?? "");
    setBio(p.bio ?? "");
    setExpYears(p.experience_years?.toString() ?? "");
    setEducation(p.education ?? "");
    setTripReady(p.business_trip_ready);
    setAccepts(p.accepts_requests);
    setPalataOk(p.palata_registry_verified);
    setPalataNum(p.palata_registry_number ?? "");
    setCentrsudOk(p.centrsudexpert_verified);
    setCentrsudNum(p.centrsudexpert_registry_number ?? "");
    setSavedOk(false);
    setSaveErr(null);
    setEditing(true);
  }

  function addCert() {
    setCertNumbers(p => [...p, ""]);
    setCertResultsS(p => [...p, null]);
    setCertVerifying(p => [...p, false]);
  }
  function removeCert(idx: number) {
    setCertNumbers(p => p.filter((_, i) => i !== idx));
    setCertResultsS(p => p.filter((_, i) => i !== idx));
    setCertVerifying(p => p.filter((_, i) => i !== idx));
  }
  function updateCert(idx: number, val: string) {
    setCertNumbers(p => p.map((v, i) => i === idx ? val : v));
    setCertResultsS(p => p.map((v, i) => i === idx ? null : v));
  }
  async function verifyCert(idx: number) {
    const raw = certNumbers[idx];
    if (!raw.trim()) return;
    setCertVerifying(p => p.map((v, i) => i === idx ? true : v));
    const result = await verifyCertificate(raw, allDirections, fullName);
    setCertResultsS(p => p.map((v, i) => i === idx ? result : v));
    setCertVerifying(p => p.map((v, i) => i === idx ? false : v));
  }

  async function handleSave() {
    setSaving(true);
    setSaveErr(null);
    setCertWarnMsgs([]);

    // 0. Validate required fields
    if (!fullName.trim()) {
      setSaveErr("Введите ФИО.");
      setSaving(false);
      return;
    }
    if (regs.length === 0) {
      setSaveErr("Укажите хотя бы один регион работы.");
      setSaving(false);
      return;
    }

    // 1. Re-verify any unverified certs
    const finalResults = [...certResults];
    for (let i = 0; i < certNumbers.length; i++) {
      if (certNumbers[i].trim() && !certResults[i]) {
        finalResults[i] = await verifyCertificate(certNumbers[i], allDirections, fullName);
      }
    }
    setCertResultsS(finalResults);

    // 2. Keep only verified certs
    const verifiedResults = finalResults.filter(
      (r): r is CertResult => r?.status === "verified"
    );

    // 3. Warn about invalid certs
    const warnMsgs: string[] = certNumbers
      .map((num, i) => ({ num: normalizeCertNumber(num.trim()), result: finalResults[i] }))
      .filter(({ num, result }) => num.length > 0 && result?.status !== "verified")
      .map(({ num }) =>
        `Сертификат ${num} не найден или срок его действия истёк. Добавить можно только действующий сертификат. ` +
        `Новый сертификат можно получить на сайте Палаты: ${PALATA_URL}`
      );
    setCertWarnMsgs(warnMsgs);

    // 4. accepts_requests → false if no verified certs remain
    const hasVerified = verifiedResults.length > 0;
    const effectiveAccepts = hasVerified ? accepts : false;
    if (!hasVerified) setAccepts(false);

    // 5. Save user + profile
    const [r1, r2] = await Promise.all([
      fetch("/api/palata/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ full_name: fullName.trim() || null, phone: phone.trim() || null }),
      }).then(r => r.json()).then((b: { success: boolean; error?: string }) => ({
        error: b.success ? null : { message: b.error ?? "user update failed" },
      })).catch((e: unknown) => ({ error: { message: String(e) } })),
      fetch("/api/palata/expert-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id:                          userId,
          bio:                              bio.trim() || null,
          experience_years:                 expYears ? parseInt(expYears) : null,
          education:                        education.trim() || null,
          business_trip_ready:              tripReady,
          accepts_requests:                 effectiveAccepts,
          palata_registry_verified:         palataOk,
          palata_registry_number:           palataOk ? palataNum.trim() || null : null,
          centrsudexpert_verified:          centrsudOk,
          centrsudexpert_registry_number:   centrsudOk ? centrsudNum.trim() || null : null,
        }),
      })
        .then(r => r.json())
        .then(b => ({ error: b.success ? null : { message: b.message ?? "Expert profile upsert failed" } }))
        .catch((e: unknown) => ({ error: { message: String(e) } })),
    ]);
    if (r1.error || r2.error) {
      setSaving(false);
      setSaveErr((r1.error ?? r2.error)!.message);
      return;
    }

    // 6. Recalculate directions from verified certs only
    const newDirIds = mergeDirectionIds(verifiedResults);
    await fetch("/api/palata/expert-directions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: JSON.stringify({ direction_ids: newDirIds }),
    }).catch(err => console.error("[expert-save] expert-directions replace:", err));
    setDirIds(newDirIds);

    // 7. Save only verified certs (replace all)
    await fetch("/api/palata/expert-certificate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: JSON.stringify({
        certs: verifiedResults.map(r => ({
          certificate_number: r.number,
          status: "verified",
          cert_valid_to: r.validTo ?? null,
          cert_expert_name: r.expertName ?? null,
          cert_direction_ids: r.directionIds,
        })),
      }),
    }).catch(err => console.error("[expert-save] expert-certificate replace:", err));

    // 8. Update cert UI to show only verified certs
    const verifiedNums = verifiedResults.map(r => r.number);
    setCertNumbers(verifiedNums.length > 0 ? verifiedNums : [""]);
    setCertResultsS(verifiedNums.length > 0 ? verifiedResults : [null]);
    setCertVerifying(verifiedNums.length > 0 ? verifiedNums.map(() => false) : [false]);

    // 9. Save regions
    console.log("[expert-save] regs before save:", regs);
    const regReplaceRes = await fetch("/api/palata/expert-regions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: JSON.stringify({ region_ids: regs }),
    });
    const regReplaceBody = await regReplaceRes.json().catch(() => null);
    if (!regReplaceRes.ok || !regReplaceBody?.success) {
      setSaving(false);
      setSaveErr("Ошибка сохранения регионов: " + (regReplaceBody?.message ?? regReplaceRes.status));
      return;
    }
    if (regs.length > 0) {
      const namesRes = await fetch(`/api/palata/expert-regions/${userId}`);
      const namesBody = await namesRes.json().catch(() => null);
      const rows = (namesBody?.rows ?? []) as { region_id: string; region_name: string | null }[];
      setRegionNames(rows.map(r => r.region_name ?? r.region_id));
    } else {
      setRegionNames([]);
    }

    setSaving(false);
    setEditing(false);
    setSavedOk(true);
    onSave();
    setTimeout(() => setSavedOk(false), 3000);
  }

  const ic = "w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30 focus:border-[#0F4C9A] bg-white";
  const rating = p.avg_customer_rating ? Number(p.avg_customer_rating).toFixed(2) : null;

  if (editing) {
    return (
      <div className="max-w-2xl space-y-4">
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
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Профессиональные данные</p>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Описание опыта</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={4} className={`${ic} resize-none`} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Стаж (лет)</label>
            <input type="number" min="0" max="60" value={expYears} onChange={e => setExpYears(e.target.value)}
              placeholder="Например: 12" className={ic} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Образование</label>
            <textarea value={education} onChange={e => setEducation(e.target.value)} rows={3} className={`${ic} resize-none`} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
            Регионы работы <span className="text-red-500">*</span>
          </p>
          <RegionMultiSelect
            selectedIds={regs}
            onChange={setRegs}
            placeholder="Выберите регионы работы…"
          />
          {regs.length === 0 && (
            <p className="mt-1.5 text-xs text-slate-400">Укажите хотя бы один регион</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Статус и реестры</p>

          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={accepts} onChange={e => setAccepts(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#002B5C]" />
            <div>
              <p className="text-sm font-medium text-slate-800">Принимает заказы</p>
              <p className="text-xs text-slate-400">Новые запросы будут поступать</p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={tripReady} onChange={e => setTripReady(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#002B5C]" />
            <div>
              <p className="text-sm font-medium text-slate-800">Готов к командировкам</p>
              <p className="text-xs text-slate-400">Выезд в другой регион</p>
            </div>
          </label>

          {/* Палата: checkbox + сертификаты */}
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={palataOk} onChange={e => setPalataOk(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#002B5C]" />
              <p className="text-sm font-medium text-slate-800">Сертифицирован Палатой судебных экспертов</p>
            </label>
            {palataOk ? (
              <div className="ml-7">
                <p className="text-xs text-slate-400 mb-3">
                  Введите номера сертификатов. Направления экспертизы определяются автоматически.
                </p>
                <CertificateInputList
                  numbers={certNumbers}
                  results={certResults}
                  verifying={certVerifying}
                  onChange={updateCert}
                  onVerify={verifyCert}
                  onAdd={addCert}
                  onRemove={removeCert}
                  allowRemove={false}
                />
              </div>
            ) : (
              <p className="ml-7 text-xs text-slate-400">
                Принятие заказов возможно только при наличии действующего сертификата Палаты.
              </p>
            )}
          </div>

          {/* СРО ЦСЭ */}
          <div className="space-y-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={centrsudOk} onChange={e => setCentrsudOk(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#002B5C]" />
              <p className="text-sm font-medium text-slate-800">Являюсь участником СРО «ЦСЭ»</p>
            </label>
            {centrsudOk && (
              <input type="text" value={centrsudNum} onChange={e => setCentrsudNum(e.target.value)}
                placeholder="Номер регистрации" className={`${ic} font-mono ml-7`} />
            )}
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
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

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

      {/* Left column */}
      <div className="xl:col-span-1 flex flex-col gap-4">

        {/* Identity card */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-[#F4F4F4] flex items-center justify-center flex-shrink-0">
              <User className="w-6 h-6 text-[#666666]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{user.full_name ?? "—"}</p>
              <p className="text-xs text-slate-400 truncate">{user.email}</p>
            </div>
          </div>

          {user.phone && (
            <div className="flex items-center gap-2 mb-4">
              <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <p className="text-xs text-slate-600">{user.phone}</p>
            </div>
          )}

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
            <FlagRow active={p.business_trip_ready} label="Готов к командировкам" activeColor="text-[#002B5C] bg-[#F4F4F4]" inactiveColor="text-slate-500 bg-slate-50" />
          </div>
        </div>

        {/* Реестры */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Реестры</p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <RegistryRow verified={p.palata_registry_verified} label="Сертифицирован Палатой судебных экспертов" number={null} />
              {p.palata_registry_verified && certNumbers.filter(n => n.trim()).length > 0 && (
                <div className="ml-6 space-y-1">
                  {certNumbers.filter(n => n.trim()).map((num, i) => (
                    <p key={i} className="text-xs font-mono text-slate-500">{num}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <RegistryRow verified={p.centrsudexpert_verified} label="Являюсь участником СРО «ЦСЭ»" number={p.centrsudexpert_registry_number} />
            </div>
          </div>
        </div>
      </div>

      {/* Right column */}
      <div className="xl:col-span-2 flex flex-col gap-4">

        {/* No active certs warning — only after certs have finished loading/healing */}
        {certsLoaded && certNumbers.filter(n => n.trim()).length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-sm text-amber-800 leading-relaxed">
              У вас нет действующих сертификатов. Вы не участвуете в подборе заказов.
            </p>
          </div>
        )}

        {/* Per-cert warnings after save */}
        {certWarnMsgs.map((msg, i) => (
          <div key={i} className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-sm text-amber-800 leading-relaxed">{msg}</p>
          </div>
        ))}

        {/* Specializations */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className="w-4 h-4 text-slate-400" />
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Направления экспертиз</p>
          </div>
          {dirIds.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {dirIds.map((id) => (
                <span key={id} className="text-xs font-medium text-[#002B5C] bg-[#F4F4F4] border border-[#D0D0D0] rounded-lg px-2.5 py-1">
                  {allDirections.find(d => d.id === id)?.name ?? id}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Определяются по сертификатам</p>
          )}
        </div>

        {/* Regions */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-slate-400" />
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Регионы работы</p>
          </div>
          {regionNames.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {regionNames.map((name) => (
                <span key={name} className="text-xs font-medium text-slate-700 bg-slate-100 rounded-lg px-2.5 py-1">
                  {name}
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

// ─── Documents section ─────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  diploma:               "Диплом",
  certificate:           "Сертификат",
  sro:                   "Свидетельство СРО",
  registry_confirmation: "Справка из реестра",
  other:                 "Другое",
};

function DocumentsSection({
  userId,
  docsState,
  onReload,
}: {
  userId: string;
  docsState: DocsState;
  onReload: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType]     = useState("diploma");
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadErr(null);

    const path = `${userId}/${Date.now()}_${file.name}`;
    const { error: storErr } = await supabase.storage
      .from("palata-expert-documents")
      .upload(path, file, { cacheControl: "3600", upsert: false });

    if (storErr) { setUploadErr(storErr.message); setUploading(false); return; }

    const dbRes = await fetch("/api/palata/expert-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expert_id:   userId,
        doc_type:    docType,
        bucket_path: path,
        file_name:   file.name,
        mime_type:   file.type || null,
        size_bytes:  file.size,
      }),
    }).then(r => r.json()).catch(() => ({ success: false, message: "network error" }));

    if (!dbRes.success) { setUploadErr(dbRes.message ?? "Ошибка сохранения"); setUploading(false); return; }

    setUploading(false);
    e.target.value = "";
    onReload();
  }

  async function handleDelete(doc: ExpertDocument) {
    await supabase.storage.from("palata-expert-documents").remove([doc.bucket_path]);
    await fetch(`/api/palata/expert-documents/${encodeURIComponent(doc.id)}`, { method: "DELETE" })
      .then(r => r.json()).catch(() => null);
    onReload();
  }

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400" />
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Мои документы</p>
          {docsState.kind === "ok" && docsState.docs.length > 0 && (
            <span className="text-[10px] font-bold bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">
              {docsState.docs.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select value={docType} onChange={e => setDocType(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30 bg-white">
            {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <label className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border cursor-pointer transition-all ${
            uploading
              ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-[#F4F4F4] border-[#D0D0D0] text-[#002B5C] hover:bg-[#E9E9E9]"
          }`}>
            <Upload className="w-3.5 h-3.5" />
            {uploading ? "Загрузка…" : "Загрузить"}
            <input type="file" className="sr-only" disabled={uploading} onChange={handleUpload}
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" />
          </label>
        </div>
      </div>

      {uploadErr && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 mb-3">
          <p className="text-xs text-red-700">{uploadErr}</p>
        </div>
      )}

      {docsState.kind === "loading" && <p className="text-xs text-slate-400 py-4 text-center">Загрузка...</p>}
      {docsState.kind === "error"   && <p className="text-xs text-red-500 py-2">{docsState.message}</p>}
      {docsState.kind === "ok" && docsState.docs.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-xs text-slate-400">Документы ещё не загружены</p>
          <p className="text-[10px] text-slate-300 mt-1">Добавьте дипломы, сертификаты и справки из реестров</p>
        </div>
      )}
      {docsState.kind === "ok" && docsState.docs.length > 0 && (
        <div className="space-y-2">
          {docsState.docs.map(doc => (
            <div key={doc.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">{doc.file_name}</p>
                  <p className="text-[10px] text-slate-400">
                    {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                    {doc.size_bytes ? ` · ${(doc.size_bytes / 1024).toFixed(0)} KB` : ""}
                    {doc.verified ? " · ✓ Проверен" : ""}
                  </p>
                </div>
              </div>
              <button onClick={() => handleDelete(doc)}
                className="p-1 text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
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

function ExpertCard({ match: m, needsRating, directionsMap = {} }: { match: Match; needsRating?: boolean; directionsMap?: Record<string, string> }) {
  const req = m.palata_requests;
  const urgencyColor = req?.urgency === "very_urgent" ? "border-l-red-400"
    : req?.urgency === "urgent" ? "border-l-amber-400"
    : "border-l-[#D0D0D0]";

  return (
    <Link href={`/requests/${m.request_id}`}>
      <div className={`bg-white rounded-xl border border-slate-100 border-l-[3px] ${urgencyColor} p-3.5 hover:shadow-md hover:border-[#D0D0D0] transition-all cursor-pointer group shadow-sm`}>
        <p className="text-xs font-semibold text-slate-800 leading-snug mb-2 line-clamp-2 group-hover:text-[#002B5C] transition-colors">
          {req?.title ?? "—"}
        </p>

        <div className="space-y-1 mb-2.5">
          {req?.expertise_direction_id && (
            <p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
              <span className="inline-block h-1 w-1 rounded-full bg-[#0F4C9A]/50 flex-shrink-0" />
              {directionsMap[req.expertise_direction_id] ?? "—"}
            </p>
          )}
          {m.status === "closed_by_other_expert" && !m.decline_reason && (
            <span className="inline-block text-[10px] font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
              Взят другим
            </span>
          )}
          {m.decline_reason === "customer_cancelled" && (
            <span className="inline-block text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
              Не актуальный
            </span>
          )}
          {m.decline_reason && m.decline_reason !== "customer_cancelled" && (
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
      <div className="w-16 h-16 rounded-2xl bg-[#F4F4F4] flex items-center justify-center">
        <Inbox className="w-8 h-8 text-[#666666]" />
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
      <div className="w-16 h-16 rounded-2xl bg-[#F4F4F4] flex items-center justify-center">
        <User className="w-8 h-8 text-[#666666]" />
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

// ─── Expert Action Inbox ───────────────────────────────────────────────────────

const ACTION_LABEL_EX: Record<string, { label: string; color: string }> = {
  customer_selected_you:        { label: "Вас выбрали",              color: "text-[#002B5C] bg-[#F4F4F4]" },
  customer_approved_start_date: { label: "Дата согласована",         color: "text-emerald-700 bg-emerald-50" },
  you_are_approved_for_work:    { label: "Заказчик подтвердил дату", color: "text-[#002B5C] bg-[#D0D0D0]" },
  customer_declined_start_date: { label: "Заказчик отклонил дату",   color: "text-red-700 bg-red-50" },
  customer_cancelled_order:     { label: "Заказ отменён",            color: "text-slate-600 bg-slate-100" },
  other_expert_took_order:      { label: "Назначен другой эксперт",  color: "text-orange-700 bg-orange-50" },
  experts_matched:              { label: "Подобраны эксперты",       color: "text-[#002B5C] bg-[#F4F4F4]" },
  expert_declined:              { label: "Эксперт отказался",        color: "text-red-700 bg-red-50" },
  expert_can_start_from:        { label: "Предложена дата",          color: "text-amber-700 bg-amber-50" },
  expert_completed_order:       { label: "Заказ завершён",           color: "text-emerald-700 bg-emerald-50" },
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

function ExpertActionInbox({ items, userId, userEmail, onDone, onMatchDeclined }: {
  items: ActionItem[];
  userId: string;
  userEmail: string;
  onDone: () => void;
  onMatchDeclined: (requestId: string) => void;
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
            Здесь появятся задачи, когда заказчик выберет вас или нужно будет принять решение.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-2xl space-y-4">
      {items.map(item => (
        <ExpertActionCard key={item.id} item={item} userId={userId} userEmail={userEmail} onDone={onDone} onMatchDeclined={onMatchDeclined} />
      ))}
    </div>
  );
}

function ExpertActionCard({ item, userId, userEmail, onDone, onMatchDeclined }: {
  item: ActionItem;
  userId: string;
  userEmail: string;
  onDone: () => void;
  onMatchDeclined: (requestId: string) => void;
}) {
  if (item.action_type === "customer_selected_you") {
    return <CustomerSelectedCard item={item} onDone={onDone} />;
  }
  if (item.action_type === "you_are_approved_for_work") {
    return <YouAreApprovedCard item={item} userId={userId} userEmail={userEmail} onDone={onDone} onMatchDeclined={onMatchDeclined} />;
  }
  if (item.action_type === "customer_approved_start_date") {
    return <CustomerApprovedCard item={item} onDone={onDone} />;
  }
  if (item.action_type === "customer_declined_start_date") {
    return <CustomerDeclinedDateCard item={item} onDone={onDone} />;
  }
  if (item.action_type === "customer_cancelled_order") {
    return <CustomerCancelledCard item={item} onDone={onDone} />;
  }
  if (item.action_type === "other_expert_took_order") {
    return <OtherExpertTookCard item={item} onDone={onDone} />;
  }
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <ExpertActionItemHeader item={item} />
      <p className="text-sm text-slate-600 mt-2">{item.description}</p>
    </div>
  );
}

// ─── customer_selected_you ────────────────────────────────────────────────────

function CustomerSelectedCard({ item, onDone }: {
  item: ActionItem;
  onDone: () => void;
}) {
  const [, navigate] = useLocation();

  async function handleGoToOrder() {
    await resolveActionItem(item.id);
    onDone();
    navigate(`/requests/${item.request_id}`);
  }

  return (
    <div className="bg-white border border-[#0F4C9A]/30 rounded-xl p-5 shadow-sm">
      <ExpertActionItemHeader item={item} />
      <div className="mt-3 bg-[#EEF4FF] rounded-xl px-4 py-3">
        <p className="text-xs text-[#0F4C9A] leading-relaxed">
          Заказчик выбрал вас для работы над этим заказом. Перейдите в заказ, чтобы принять решение.
        </p>
      </div>
      <div className="mt-4">
        <button
          onClick={handleGoToOrder}
          className="btn-primary text-xs py-1.5 px-4"
        >
          Перейти в заказ →
        </button>
      </div>
    </div>
  );
}

// ─── Shared types for YouAreApprovedCard / CustomerDeclinedDateCard ───────────

type RequestDetails = {
  title: string;
  expertise_type: string | null;
  expertise_direction_id: string | null;
  description: string | null;
  customer_id: string | null;
  requires_travel: boolean;
  status: string;
  region_id: string | null;
};

type CustomerContact = {
  name: string | null;
  phone: string | null;
  email: string | null;
};

// ─── you_are_approved_for_work ────────────────────────────────────────────────

function YouAreApprovedCard({ item, userId, userEmail, onDone, onMatchDeclined }: {
  item: ActionItem;
  userId: string;
  userEmail: string;
  onDone: () => void;
  onMatchDeclined: (requestId: string) => void;
}) {
  const payload    = item.payload ?? {};
  const canStartFrom = ((payload.can_start_from ?? payload.start_date) as string | null) ?? null;
  const custIdFromPayload = (payload.customer_id as string | null) ?? item.customer_id ?? null;

  const [req, setReq]           = useState<RequestDetails | null>(null);
  const [reqLoading, setReqLoading] = useState(true);
  const [custContact, setCustContact] = useState<CustomerContact | null>(null);
  const [action, setAction]     = useState<"idle" | "decline">("idle");
  const [busy, setBusy]         = useState(false);
  const [declineReason, setDeclineReason] = useState("busy");
  const [declineComment, setDeclineComment] = useState("");
  const [dirMap, setDirMap]     = useState<Record<string, string>>({});
  const [blockedByInWork, setBlockedByInWork] = useState(false);
  const [loadedMatchId, setLoadedMatchId]   = useState<string | null>(null);
  const [loadedMatchStatus, setLoadedMatchStatus] = useState<string | null>(null);
  const [declineError, setDeclineError]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/palata/expertise-directions")
      .then(r => r.json())
      .then(b => {
        const m: Record<string, string> = {};
        for (const d of (b.rows ?? []) as { id: string; name: string }[]) m[d.id] = d.name;
        setDirMap(m);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    async function load() {
      const [{ data: reqData }, { data: matchData }] = await Promise.all([
        supabase
          .from("palata_requests")
          .select("title, expertise_type, expertise_direction_id, description, customer_id, requires_travel, status, region_id")
          .eq("id", item.request_id)
          .maybeSingle(),
        // Load match exactly like RequestDetail does: only filter by request_id,
        // no expert_id filter — same query pattern that makes "Не могу взять" work.
        supabase
          .from("palata_request_matches")
          .select("id, status")
          .eq("request_id", item.request_id)
          .eq("expert_id", userId)
          .order("matching_round", { ascending: false })
          .order("proposed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const r = reqData as RequestDetails | null;
      const m = matchData as { id: string; status: string } | null;
      setReq(r);
      if (m) {
        setLoadedMatchId(m.id);
        setLoadedMatchStatus(m.status);
      }

      // Guard: if another expert already took the job, auto-resolve this item
      if (r?.status === "in_work") {
        setBlockedByInWork(true);
        await resolveActionItem(item.id);
        onDone();
        setReqLoading(false);
        return;
      }

      const custId = custIdFromPayload ?? r?.customer_id ?? null;
      if (custId) {
        const [{ data: uData }, { data: cData }] = await Promise.all([
          fetchUsers([custId]).then(rows => ({ data: rows[0] ?? null, error: null })),
          fetch(`/api/palata/request-contacts?request_id=${encodeURIComponent(item.request_id ?? "")}`, {
            headers: { Authorization: `Bearer ${getToken() ?? ""}` },
          }).then(r => r.json())
            .then((b: { success: boolean; contact?: { customer_phone: string | null; customer_email: string | null } | null }) => ({
              data: b.contact ?? null, error: null,
            }))
            .catch(() => ({ data: null, error: null })),
        ]);
        const u = uData as { full_name: string | null; phone: string | null } | null;
        const c = cData as { customer_phone: string | null; customer_email: string | null } | null;
        setCustContact({
          name:  u?.full_name ?? null,
          phone: c?.customer_phone ?? u?.phone ?? null,
          email: c?.customer_email ?? null,
        });
      }
      setReqLoading(false);
    }
    load();
  }, [item.request_id, userId, custIdFromPayload]);

  async function getCustomerEmail(customerId: string): Promise<string | null> {
    const rows = await fetchUsers([customerId]);
    return (rows[0] as { email: string } | undefined)?.email ?? null;
  }

  const shortId = `#${item.request_id?.slice(0, 8).toUpperCase() ?? ""}`;
  const startFmt = canStartFrom
    ? new Date(canStartFrom).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })
    : null;

  // ── «ОК, беру в работу» ─────────────────────────────────────────────────────

  async function handleTakeWork() {
    setBusy(true);

    console.log("[take-work] START", { requestId: item.request_id, currentExpertId: userId });

    const twRes = await fetch(`/api/palata/requests/${item.request_id}/take-work`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken() ?? ""}`,
      },
      body: JSON.stringify({
        actionItemId: item.id,
        canStartFrom,
      }),
    }).then(r => r.json()).catch(() => ({ success: false, error: "FETCH_FAILED" }));

    if (!twRes.success) {
      console.error("[take-work] FAILED", { error: twRes.error });
      setBusy(false);
      return;
    }

    console.log("[take-work] TX OK — sending emails");

    // Emails after COMMIT: same recipients, same templates as before
    const custId = (twRes.custId as string | null) ?? custIdFromPayload ?? req?.customer_id ?? null;
    if (custId && twRes.custEmail) {
      await logEmailTestEvent(custId, twRes.custEmail as string, "expert_started_work",
        "Эксперт взял ваш заказ в работу",
        { request_id: item.request_id, expert_id: userId });
    }

    if (userEmail) {
      await logEmailTestEvent(userId, userEmail, "expert_accepted_work",
        "Вы взяли заказ в работу",
        { request_id: item.request_id });
    }

    console.log("[take-work] FINISH");
    setBusy(false);
    onDone();
  }

  // ── «Отказаться» — вызывает ту же функцию declineRequest, что и «Не могу взять»

  async function handleDecline() {
    setBusy(true);
    setDeclineError(null);
    const custId = custIdFromPayload ?? req?.customer_id ?? null;
    const { error } = await declineRequest({
      requestId:    item.request_id!,
      expertId:     userId,
      reason:       declineReason,
      note:         declineComment,
      matchId:      loadedMatchId,   // передаём ID, загруженный при монтировании
      customerId:   custId,
      requestTitle: req?.title ?? null,
      actionItemId: item.id,         // resolveActionItem вызывается внутри
      runRematch:   true,
    });
    if (error) {
      setDeclineError(error);
      setBusy(false);
      return;
    }
    if (item.request_id) onMatchDeclined(item.request_id);
    onDone();
  }

  if (blockedByInWork) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <ExpertActionItemHeader item={item} />
        <p className="text-sm text-slate-400 mt-2">На заказ уже назначен эксперт.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#0F4C9A]/40 rounded-xl shadow-sm overflow-hidden">
      <div className="p-5">
        <ExpertActionItemHeader item={item} />
        {!reqLoading && req?.title && (
          <p className="text-sm text-slate-600 mt-1">«{req.title}»</p>
        )}

        {/* Approved start date */}
        {startFmt && (
          <div className="mt-3 bg-[#0F4C9A]/5 border border-[#0F4C9A]/20 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#0F4C9A] shrink-0" />
              <span className="text-[#666666]">Согласованная дата начала:</span>
              <span className="font-semibold text-[#111111]">{startFmt}</span>
            </p>
          </div>
        )}

        {/* Customer contacts */}
        {custContact && (custContact.name || custContact.phone || custContact.email) && (
          <div className="mt-3 px-4 py-3 bg-white border border-[#D0D0D0] rounded-xl">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#666666] mb-2">Заказчик</p>
            {custContact.name && (
              <p className="text-sm font-semibold text-[#111111]">{custContact.name}</p>
            )}
            {custContact.phone && (
              <p className="text-xs text-[#666666] mt-1">Телефон: <span className="font-medium text-[#111111]">{custContact.phone}</span></p>
            )}
            {custContact.email && (
              <p className="text-xs text-[#666666]">Email: <span className="font-medium text-[#111111]">{custContact.email}</span></p>
            )}
          </div>
        )}

        {/* Action buttons */}
        {action === "idle" && (
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              disabled={busy}
              onClick={handleTakeWork}
              className="btn-primary text-xs py-1.5 px-4"
            >
              {busy ? "Сохранение…" : "ОК, беру в работу"}
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

        {/* Decline form */}
        {action === "decline" && (
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-[#002B5C]">Причина отказа:</p>
            <select
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300"
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
            >
              {DECLINE_REASONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <textarea
              rows={2}
              placeholder="Комментарий (необязательно)"
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
              value={declineComment}
              onChange={e => setDeclineComment(e.target.value)}
            />
            {declineError && (
              <p className="text-xs text-red-600">{declineError}</p>
            )}
            <div className="flex gap-2">
              <button
                disabled={busy || !loadedMatchId}
                onClick={handleDecline}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {busy ? "…" : "Подтвердить отказ"}
              </button>
              <button
                onClick={() => { setAction("idle"); setDeclineError(null); }}
                className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── customer_declined_start_date ─────────────────────────────────────────────

function CustomerDeclinedDateCard({ item, onDone }: { item: ActionItem; onDone: () => void }) {
  const [done, setDone] = useState(false);
  const [reqTitle, setReqTitle] = useState<string | null>(null);

  useEffect(() => {
    if (item.request_id) fetchRequests([item.request_id])
      .then(rows => { if (rows[0]) setReqTitle(rows[0].title ?? null); });
  }, [item.request_id]);

  async function handleAck() {
    await resolveActionItem(item.id);
    setDone(true);
    onDone();
  }

  if (done) return null;

  return (
    <div className="bg-white border border-red-200 rounded-xl p-5 shadow-sm">
      <ExpertActionItemHeader item={item} />
      {reqTitle && (
        <p className="text-sm text-slate-600 mt-1">по заказу «{reqTitle}»</p>
      )}
      <div className="mt-3 bg-red-50 rounded-xl px-4 py-3">
        <p className="text-xs text-red-700 font-medium">
          Заказчик не согласился с предложенной вами датой начала. Заявка отклонена.
        </p>
      </div>
      <div className="mt-4">
        <button
          onClick={handleAck}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-600 hover:border-slate-400 hover:text-slate-800 transition-colors"
        >
          Понятно
        </button>
      </div>
    </div>
  );
}

// ─── other_expert_took_order ──────────────────────────────────────────────────

function OtherExpertTookCard({ item, onDone }: { item: ActionItem; onDone: () => void }) {
  const [done, setDone] = useState(false);
  const [reqTitle, setReqTitle] = useState<string | null>(null);

  useEffect(() => {
    if (item.request_id) fetchRequests([item.request_id])
      .then(rows => { if (rows[0]) setReqTitle(rows[0].title ?? null); });
  }, [item.request_id]);

  async function handleAck() {
    await resolveActionItem(item.id);
    setDone(true);
    onDone();
  }

  if (done) return null;

  return (
    <div className="bg-white border border-orange-200 rounded-xl p-5 shadow-sm">
      <ExpertActionItemHeader item={item} />
      <div className="mt-3 bg-orange-50 rounded-xl px-4 py-3">
        <p className="text-xs text-orange-800">
          На заказ{reqTitle ? ` «${reqTitle}»` : ""} назначен другой эксперт.
        </p>
      </div>
      <div className="mt-4">
        <button
          onClick={handleAck}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-600 hover:border-slate-400 hover:text-slate-800 transition-colors"
        >
          Ознакомлен
        </button>
      </div>
    </div>
  );
}

// ─── customer_cancelled_order ─────────────────────────────────────────────────

function CustomerCancelledCard({ item, onDone }: { item: ActionItem; onDone: () => void }) {
  const [done, setDone] = useState(false);

  async function handleAck() {
    await resolveActionItem(item.id);
    setDone(true);
    onDone();
  }

  if (done) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <ExpertActionItemHeader item={item} />
      <div className="mt-3 bg-slate-50 rounded-xl px-4 py-3">
        <p className="text-xs text-slate-600">{item.description}</p>
      </div>
      <div className="mt-4">
        <button
          onClick={handleAck}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-600 hover:border-slate-400 hover:text-slate-800 transition-colors"
        >
          Ознакомлен
        </button>
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
