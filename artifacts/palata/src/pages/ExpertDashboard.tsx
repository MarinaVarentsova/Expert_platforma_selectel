import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { runMatching } from "@/lib/matching";
import { useRequireRole } from "@/lib/useRequireRole";
import { RegionMultiSelect } from "@/components/RegionMultiSelect";
import { KanbanBoard } from "@/components/KanbanBoard";
import { CertificateInputList } from "@/components/CertificateInputList";
import {
  verifyCertificate, mergeDirectionIds, normalizeCertNumber,
  type CertResult,
} from "@/lib/certificates";
import {
  Inbox, Star, User, CheckCircle2, XCircle, MapPin,
  Briefcase, FileText, GraduationCap, ClipboardList, Zap, Calendar,
  Pencil, X, Upload, Phone,
} from "lucide-react";
import {
  loadOpenActionItems, createActionItem, resolveActionItem, cancelRequestActionItems,
  logStatusEvent, logEmailTestEvent, type ActionItem,
} from "@/lib/actionItems";

// ─── Action inbox filter ──────────────────────────────────────────────────────
// "customer_selected_you" is informational — the expert's kanban shows the selection.
// It should NOT appear as a task in "Требуют действия".

const EXPERT_INBOX_EXCLUDED: string[] = ["customer_selected_you"];

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


const DECLINE_LABEL: Record<string, string> = {
  busy:              "Занят",
  not_my_profile:    "Не мой профиль",
  not_competent:     "Вне компетенции",
  location:          "Регион не подходит",
  conflict:          "Конфликт интересов",
  conditions:        "Условия не подходят",
  timeline:          "Не подходит срок",
  no_travel:         "Нет возможности выезда",
  insufficient_docs: "Недостаточно документов",
  no_contact:        "Заказчик не выходит на связь",
  other:             "Другое",
  customer_cancelled:       "Не актуальный",
  customer_declined_date:   "Не устроил срок заказчика",
};

// ─── Kanban config ─────────────────────────────────────────────────────────────

const COLUMNS = [
  { id: "proposed",  label: "Новые предложения", accent: "", dotColor: "bg-amber-400",    bgColor: "bg-amber-50/60 border-amber-200",    statuses: ["proposed", "contacts_opened"] },
  { id: "cantake",   label: "Могу взять",        accent: "", dotColor: "bg-[#0F4C9A]",   bgColor: "bg-[#F4F4F4] border-[#D0D0D0]",     statuses: ["can_start_from"] },
  { id: "accepted",  label: "В работе",          accent: "", dotColor: "bg-[#002B5C]",   bgColor: "bg-[#E9E9E9]/60 border-[#D0D0D0]",  statuses: ["accepted", "accepted_work"] },
  { id: "completed", label: "Завершено",         accent: "", dotColor: "bg-emerald-400", bgColor: "bg-emerald-50/60 border-emerald-200", statuses: ["completed"] },
  { id: "declined",  label: "Отказ / не взял",    accent: "", dotColor: "bg-slate-300",   bgColor: "bg-slate-50 border-slate-200",      statuses: ["declined", "withdrawn", "customer_declined_start_date"] },
  { id: "missed",    label: "Не актуальный",      accent: "", dotColor: "bg-orange-300",  bgColor: "bg-orange-50/50 border-orange-200",  statuses: ["closed_by_other_expert"] },
];

// ─── Main component ──────────────────────────────────────────────────────────

export default function ExpertDashboard() {
  const guard = useRequireRole("expert");
  const search = useSearch();
  const initialTab = (() => {
    const p = new URLSearchParams(search).get("tab");
    if (p === "actions" || p === "profile") return p;
    return "requests";
  })();
  const [tab, setTab] = useState<"requests" | "actions" | "profile">(initialTab);
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
    supabase.from("palata_expertise_directions")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setAllDirections(data ?? []));
  }, []);

  const directionsMap = Object.fromEntries(allDirections.map(d => [d.id, d.name]));

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
        palata_requests ( title, expertise_direction_id, urgency, customer_id )
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
        id, status, experience_years,
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

    supabase.from("palata_users").select("phone").eq("id", userId).single()
      .then(({ data }) => setUserPhone((data as { phone: string | null } | null)?.phone ?? null));

    supabase.from("palata_expert_documents")
      .select("id, doc_type, file_name, bucket_path, mime_type, size_bytes, verified, created_at")
      .eq("expert_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) { setDocsState({ kind: "error", message: error.message }); return; }
        setDocsState({ kind: "ok", docs: (data ?? []) as ExpertDocument[] });
      });

    loadPendingRatings(userId);

    setAiLoading(true);
    loadOpenActionItems(userId).then(items => {
      setActionItems(filterExpertActionItems(items));
      setAiLoading(false);
    });
  }, [guard.status]);

  function reloadActionItems() {
    if (guard.status !== "ok") return;
    loadOpenActionItems(guard.user.id).then(items => setActionItems(filterExpertActionItems(items)));
  }

  function reloadProfile() {
    if (guard.status !== "ok") return;
    const uid = guard.user.id;
    supabase.from("palata_users").select("phone").eq("id", uid).single()
      .then(({ data }) => setUserPhone((data as { phone: string | null } | null)?.phone ?? null));
    supabase.from("palata_expert_profiles")
      .select(`
        id, status, experience_years,
        education, certifications, accepts_requests, business_trip_ready,
        palata_registry_verified, centrsudexpert_verified,
        palata_registry_number, centrsudexpert_registry_number,
        avg_customer_rating, completed_orders_count, bio
      `)
      .eq("user_id", uid).maybeSingle()
      .then(({ data, error }) => {
        if (!error) setProfileState({ kind: "ok", profile: data as ExpertProfile | null });
      });
  }

  function reloadDocs() {
    if (guard.status !== "ok") return;
    const uid = guard.user.id;
    supabase.from("palata_expert_documents")
      .select("id, doc_type, file_name, bucket_path, mime_type, size_bytes, verified, created_at")
      .eq("expert_id", uid)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) { setDocsState({ kind: "error", message: error.message }); return; }
        setDocsState({ kind: "ok", docs: (data ?? []) as ExpertDocument[] });
      });
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
            />
          )}
        </div>
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
              <DocumentsSection
                userId={user.id}
                docsState={docsState}
                onReload={reloadDocs}
              />
            </div>
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

  const PALATA_URL = "https://xn--80aaaio3ae2acfmjkg3n.xn--p1ai/";

  useEffect(() => {
    supabase.from("palata_expert_directions")
      .select("expertise_direction_id")
      .eq("expert_id", userId)
      .then(({ data }) =>
        setDirIds((data ?? []).map((r: { expertise_direction_id: string }) => r.expertise_direction_id))
      );
    supabase.from("palata_expert_regions")
      .select("region_id")
      .eq("expert_id", userId)
      .then(async ({ data }) => {
        const ids = (data ?? []).map((r: { region_id: string }) => r.region_id);
        setRegs(ids);
        if (ids.length > 0) {
          const { data: rd } = await supabase.from("palata_regions").select("id, name").in("id", ids);
          const nm = Object.fromEntries((rd ?? []).map((r: { id: string; name: string }) => [r.id, r.name]));
          setRegionNames(ids.map(id => nm[id] ?? id));
        }
      });
    supabase.from("palata_expert_certificates")
      .select("certificate_number, status, cert_valid_to, cert_direction_ids")
      .eq("expert_id", userId)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setCertNumbers(data.map((c: { certificate_number: string }) => c.certificate_number));
          setCertResultsS(data.map(() => null));
          setCertVerifying(data.map(() => false));
        }
      });
  }, [userId]);
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
      supabase.from("palata_users")
        .update({ full_name: fullName.trim() || null, phone: phone.trim() || null })
        .eq("id", userId),
      supabase.from("palata_expert_profiles")
        .upsert({
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
        }, { onConflict: "user_id" }),
    ]);
    if (r1.error || r2.error) {
      setSaving(false);
      setSaveErr((r1.error ?? r2.error)!.message);
      return;
    }

    // 6. Recalculate directions from verified certs only
    const newDirIds = mergeDirectionIds(verifiedResults);
    await supabase.from("palata_expert_directions").delete().eq("expert_id", userId);
    if (newDirIds.length > 0) {
      await supabase.from("palata_expert_directions").insert(
        newDirIds.map(id => ({ expert_id: userId, expertise_direction_id: id }))
      );
    }
    setDirIds(newDirIds);

    // 7. Save only verified certs (replace all)
    await supabase.from("palata_expert_certificates").delete().eq("expert_id", userId);
    if (verifiedResults.length > 0) {
      await supabase.from("palata_expert_certificates").insert(
        verifiedResults.map(r => ({
          expert_id:          userId,
          certificate_number: r.number,
          status:             "verified" as const,
          cert_valid_to:      r.validTo ?? null,
          cert_expert_name:   r.expertName ?? null,
          cert_direction_ids: r.directionIds,
        }))
      );
    }

    // 8. Update cert UI to show only verified certs
    const verifiedNums = verifiedResults.map(r => r.number);
    setCertNumbers(verifiedNums.length > 0 ? verifiedNums : [""]);
    setCertResultsS(verifiedNums.length > 0 ? verifiedResults : [null]);
    setCertVerifying(verifiedNums.length > 0 ? verifiedNums.map(() => false) : [false]);

    // 9. Save regions
    console.log("[expert-save] regs before save:", regs);
    const { error: delRegErr } = await supabase.from("palata_expert_regions").delete().eq("expert_id", userId);
    if (delRegErr) console.error("[expert-save] palata_expert_regions delete:", delRegErr.message);
    if (regs.length > 0) {
      const { error: insRegErr } = await supabase.from("palata_expert_regions").insert(
        regs.map(rid => ({ expert_id: userId, region_id: rid }))
      );
      console.log("[expert-save] palata_expert_regions insert error:", insRegErr);
      if (insRegErr) {
        setSaving(false);
        setSaveErr("Ошибка сохранения регионов: " + insRegErr.message);
        return;
      }
      const { data: rd } = await supabase.from("palata_regions").select("id, name").in("id", regs);
      const nm = Object.fromEntries((rd ?? []).map((r: { id: string; name: string }) => [r.id, r.name]));
      setRegionNames(regs.map(id => nm[id] ?? id));
    } else {
      console.log("[expert-save] regs is empty — skipping insert");
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
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Регионы работы</p>
          <RegionMultiSelect
            selectedIds={regs}
            onChange={setRegs}
            placeholder="Выберите регионы работы…"
          />
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

        {/* No active certs warning */}
        {certNumbers.filter(n => n.trim()).length === 0 && (
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

    const { error: dbErr } = await supabase.from("palata_expert_documents").insert({
      expert_id:   userId,
      doc_type:    docType,
      bucket_path: path,
      file_name:   file.name,
      mime_type:   file.type || null,
      size_bytes:  file.size,
    });

    if (dbErr) { setUploadErr(dbErr.message); setUploading(false); return; }

    setUploading(false);
    e.target.value = "";
    onReload();
  }

  async function handleDelete(doc: ExpertDocument) {
    await supabase.storage.from("palata-expert-documents").remove([doc.bucket_path]);
    await supabase.from("palata_expert_documents").delete().eq("id", doc.id);
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

function ExpertActionInbox({ items, userId, userEmail, onDone }: {
  items: ActionItem[];
  userId: string;
  userEmail: string;
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
  if (item.action_type === "you_are_approved_for_work") {
    return <YouAreApprovedCard item={item} userId={userId} userEmail={userEmail} onDone={onDone} />;
  }
  if (item.action_type === "customer_approved_start_date") {
    return <CustomerApprovedCard item={item} onDone={onDone} />;
  }
  if (item.action_type === "customer_declined_start_date") {
    return <CustomerDeclinedDateCard item={item} onDone={onDone} />;
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

function CustomerSelectedCard({ item, userId, userEmail, onDone }: {
  item: ActionItem;
  userId: string;
  userEmail: string;
  onDone: () => void;
}) {
  const [req, setReq] = useState<RequestDetails | null>(null);
  const [reqLoading, setReqLoading] = useState(true);
  const [custContact, setCustContact] = useState<CustomerContact | null>(null);
  const [action, setAction] = useState<"idle" | "date" | "decline">("idle");
  const [busy, setBusy] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [comment, setComment] = useState("");
  const [declineReason, setDeclineReason] = useState("not_my_profile");
  const [declineComment, setDeclineComment] = useState("");
  const [dirMap, setDirMap] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.from("palata_expertise_directions").select("id, name").eq("is_active", true)
      .then(({ data }) => {
        const m: Record<string, string> = {};
        for (const d of data ?? []) m[d.id] = d.name;
        setDirMap(m);
      });
  }, []);

  useEffect(() => {
    async function load() {
      const { data: reqData } = await supabase
        .from("palata_requests")
        .select("title, expertise_type, expertise_direction_id, description, customer_id, requires_travel, status, region_id")
        .eq("id", item.request_id)
        .maybeSingle();
      const r = reqData as RequestDetails | null;
      setReq(r);

      if (r?.customer_id) {
        const [{ data: uData }, { data: cData }] = await Promise.all([
          supabase.from("palata_users").select("full_name, phone").eq("id", r.customer_id).maybeSingle(),
          supabase.from("palata_request_contacts")
            .select("customer_phone, customer_email")
            .eq("request_id", item.request_id)
            .eq("expert_id", userId)
            .maybeSingle(),
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
  }, [item.request_id, userId]);

  async function getCustomerEmail(customerId: string): Promise<string | null> {
    const { data } = await supabase.from("palata_users").select("email").eq("id", customerId).maybeSingle();
    return (data as { email: string } | null)?.email ?? null;
  }

  async function getMatchId(): Promise<string | null> {
    const { data } = await supabase.from("palata_request_matches")
      .select("id").eq("request_id", item.request_id).eq("expert_id", userId).maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  }

  const shortId = `#${item.request_id.slice(0, 8).toUpperCase()}`;

  async function handleTakeWork() {
    setBusy(true);
    const now = new Date().toISOString();
    const matchId = await getMatchId();

    // 1. Update current expert's match → accepted_work
    if (matchId) {
      await supabase.from("palata_request_matches")
        .update({ status: "accepted_work", responded_at: now })
        .eq("id", matchId);
    }

    // 2. Close other experts' matches
    await supabase.from("palata_request_matches")
      .update({ status: "closed_by_other_expert" })
      .eq("request_id", item.request_id)
      .neq("expert_id", userId)
      .not("status", "in", '("declined","closed_by_other_expert","withdrawn")');

    // 3. Request → in_work
    await supabase.from("palata_requests")
      .update({ status: "in_work", updated_at: now })
      .eq("id", item.request_id);

    // 4. Update palata_request_contacts for this expert
    await supabase.from("palata_request_contacts")
      .update({ expert_status: "accepted_work", expert_status_updated_at: now })
      .eq("request_id", item.request_id)
      .eq("expert_id", userId);

    // 5. Resolve expert's action item; cancel others for this request
    await resolveActionItem(item.id);
    await cancelRequestActionItems(item.request_id, item.id);

    // 6. Action item for customer
    const custId = item.customer_id ?? req?.customer_id ?? null;
    if (custId) {
      const custEmail = await getCustomerEmail(custId);
      await createActionItem({
        request_id:         item.request_id,
        expert_id:          userId,
        customer_id:        custId,
        assigned_to_user_id: custId,
        assigned_role:      "customer",
        action_type:        "expert_started_work",
        title:              "Эксперт взял заказ в работу",
        description:        `Эксперт подтвердил готовность выполнить заказ ${shortId}`,
        payload:            { expert_id: userId, expert_email: userEmail },
      });
      if (custEmail) {
        await logEmailTestEvent(custId, custEmail, "expert_accepted_work",
          "Эксперт принял ваш заказ в работу", { request_id: item.request_id });
      }
    }

    // 7. Status + email events
    await logStatusEvent(item.request_id, "expert_selection", "in_work", "expert_accepted_work");

    setBusy(false);
    onDone();
  }

  async function handleCanStartFrom() {
    if (!startDate) return;
    setBusy(true);
    const now = new Date().toISOString();
    const matchId = await getMatchId();
    const startFmt = new Date(startDate).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

    // 1. Update match
    if (matchId) {
      await supabase.from("palata_request_matches")
        .update({ status: "can_start_from", can_start_from: startDate, responded_at: now })
        .eq("id", matchId);
    }

    // 2. Update palata_request_contacts
    await supabase.from("palata_request_contacts")
      .update({ expert_status: "can_start_from", expert_status_updated_at: now })
      .eq("request_id", item.request_id)
      .eq("expert_id", userId);

    // 3. Resolve expert's action item
    await resolveActionItem(item.id);

    // 4. Action item for customer
    const custId = item.customer_id ?? req?.customer_id ?? null;
    if (custId) {
      const custEmail = await getCustomerEmail(custId);
      await createActionItem({
        request_id:         item.request_id,
        expert_id:          userId,
        customer_id:        custId,
        assigned_to_user_id: custId,
        assigned_role:      "customer",
        action_type:        "expert_can_start_from",
        title:              "Эксперт предложил дату начала",
        description:        `Эксперт может начать работу с ${startFmt}`,
        payload:            { request_id: item.request_id, expert_id: userId, can_start_from: startDate, comment: comment || null },
      });
      if (custEmail) {
        await logEmailTestEvent(custId, custEmail, "expert_can_start_from",
          "Эксперт предложил дату начала работы", { request_id: item.request_id, can_start_from: startDate });
      }
    }

    // 5. Status event
    await logStatusEvent(item.request_id, "expert_selection", "expert_selection", "expert_can_start_from");

    setBusy(false);
    onDone();
  }

  async function handleDecline() {
    setBusy(true);
    const now = new Date().toISOString();
    const matchId = await getMatchId();

    // 1. Update match
    if (matchId) {
      await supabase.from("palata_request_matches")
        .update({ status: "declined", decline_reason: declineReason, decline_comment: declineComment || null, responded_at: now })
        .eq("id", matchId);
    }

    // 2. Update palata_request_contacts
    await supabase.from("palata_request_contacts")
      .update({
        expert_status:            "declined",
        expert_status_updated_at: now,
        failure_reason:           declineReason,
        expert_comment:           declineComment || null,
      })
      .eq("request_id", item.request_id)
      .eq("expert_id", userId);

    // 3. Resolve expert's action item
    await resolveActionItem(item.id);

    // 4. Action item for customer
    const custId = item.customer_id ?? req?.customer_id ?? null;
    if (custId) {
      const custEmail = await getCustomerEmail(custId);
      await createActionItem({
        request_id:         item.request_id,
        expert_id:          userId,
        customer_id:        custId,
        assigned_to_user_id: custId,
        assigned_role:      "customer",
        action_type:        "expert_declined",
        title:              "Эксперт отказался от заказа",
        description:        `Эксперт отказался от заказа ${shortId}. Вы можете выбрать другого эксперта.`,
        payload:            { request_id: item.request_id, expert_id: userId, decline_reason: declineReason, decline_comment: declineComment || null },
      });
      if (custEmail) {
        await logEmailTestEvent(custId, custEmail, "expert_declined",
          "Эксперт отказался от заказа", { request_id: item.request_id, reason: declineReason });
      }
    }

    // 5. Status event
    await logStatusEvent(item.request_id, "expert_selection", "matching", "expert_declined");

    // 6. If all matches are declined → trigger re-matching
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

      if (allDeclined) {
        const custId2 = item.customer_id ?? req?.customer_id ?? undefined;
        await runMatching({
          requestId:           item.request_id,
          expertiseDirectionId: req?.expertise_direction_id ?? null,
          regionIds:           req?.region_id ? [req.region_id] : [],
          requiresTravel:      req?.requires_travel ?? false,
          customerId:          custId2 ?? undefined,
        });
      }
    } catch { /* non-fatal */ }

    setBusy(false);
    onDone();
  }

  return (
    <div className="bg-white border border-[#0F4C9A]/30 rounded-xl shadow-sm overflow-hidden">
      <div className="p-5">
        <ExpertActionItemHeader item={item} />

        {/* Request details */}
        {reqLoading ? (
          <p className="text-xs text-[#666666] mt-3">Загрузка деталей заказа…</p>
        ) : req ? (
          <div className="mt-3 bg-[#F4F4F4] rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-[10px] font-mono text-[#666666]">{shortId}</p>
            <p className="text-sm font-semibold text-[#111111]">{req.title}</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {(req.expertise_direction_id || req.expertise_type) && (
                <span className="text-[11px] text-[#0F4C9A] bg-[#0F4C9A]/10 px-1.5 py-0.5 rounded">
                  {dirMap[req.expertise_direction_id ?? ""] ?? req.expertise_type ?? "—"}
                </span>
              )}
            </div>
            {req.description && (
              <p className="text-xs text-[#666666] leading-relaxed mt-1.5 line-clamp-4">{req.description}</p>
            )}
          </div>
        ) : null}

        {/* Customer info */}
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
          <div className="mt-4 space-y-3 border-t border-[#D0D0D0] pt-3">
            <p className="text-xs font-semibold text-[#002B5C]">Укажите дату готовности начать:</p>
            <input
              type="date"
              className="text-sm border border-[#D0D0D0] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/40 w-full"
              value={startDate}
              min={new Date().toISOString().split("T")[0]}
              onChange={e => setStartDate(e.target.value)}
            />
            <textarea
              rows={2}
              placeholder="Комментарий (необязательно)"
              className="w-full text-sm border border-[#D0D0D0] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/40 resize-none"
              value={comment}
              onChange={e => setComment(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                disabled={busy || !startDate}
                onClick={handleCanStartFrom}
                className="btn-primary text-xs py-1.5 px-4"
              >
                {busy ? "…" : "Подтвердить дату"}
              </button>
              <button
                onClick={() => setAction("idle")}
                className="px-3 py-1.5 text-xs text-[#666666] hover:text-[#111111] transition-colors"
              >
                Отмена
              </button>
            </div>
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
              <button
                disabled={busy}
                onClick={handleDecline}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {busy ? "…" : "Подтвердить отказ"}
              </button>
              <button
                onClick={() => setAction("idle")}
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

// ─── you_are_approved_for_work ────────────────────────────────────────────────

function YouAreApprovedCard({ item, userId, userEmail, onDone }: {
  item: ActionItem;
  userId: string;
  userEmail: string;
  onDone: () => void;
}) {
  const payload    = item.payload ?? {};
  const canStartFrom = ((payload.can_start_from ?? payload.start_date) as string | null) ?? null;
  const custIdFromPayload = (payload.customer_id as string | null) ?? item.customer_id ?? null;

  const [req, setReq]           = useState<RequestDetails | null>(null);
  const [reqLoading, setReqLoading] = useState(true);
  const [custContact, setCustContact] = useState<CustomerContact | null>(null);
  const [action, setAction]     = useState<"idle" | "decline">("idle");
  const [busy, setBusy]         = useState(false);
  const [declineReason, setDeclineReason] = useState("not_my_profile");
  const [declineComment, setDeclineComment] = useState("");
  const [dirMap, setDirMap]     = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.from("palata_expertise_directions").select("id, name").eq("is_active", true)
      .then(({ data }) => {
        const m: Record<string, string> = {};
        for (const d of data ?? []) m[d.id] = d.name;
        setDirMap(m);
      });
  }, []);

  useEffect(() => {
    async function load() {
      const { data: reqData } = await supabase
        .from("palata_requests")
        .select("title, expertise_type, expertise_direction_id, description, customer_id, requires_travel, status, region_id")
        .eq("id", item.request_id)
        .maybeSingle();
      const r = reqData as RequestDetails | null;
      setReq(r);

      const custId = custIdFromPayload ?? r?.customer_id ?? null;
      if (custId) {
        const [{ data: uData }, { data: cData }] = await Promise.all([
          supabase.from("palata_users").select("full_name, phone").eq("id", custId).maybeSingle(),
          supabase.from("palata_request_contacts")
            .select("customer_phone, customer_email")
            .eq("request_id", item.request_id)
            .eq("expert_id", userId)
            .maybeSingle(),
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
    const { data } = await supabase.from("palata_users").select("email").eq("id", customerId).maybeSingle();
    return (data as { email: string } | null)?.email ?? null;
  }

  async function getMatchId(): Promise<string | null> {
    const { data } = await supabase.from("palata_request_matches")
      .select("id").eq("request_id", item.request_id).eq("expert_id", userId).maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  }

  const shortId = `#${item.request_id.slice(0, 8).toUpperCase()}`;
  const startFmt = canStartFrom
    ? new Date(canStartFrom).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })
    : null;

  // ── «ОК, беру в работу» ─────────────────────────────────────────────────────

  async function handleTakeWork() {
    setBusy(true);
    const now = new Date().toISOString();
    const matchId = await getMatchId();

    // 1. Expert match → accepted_work
    if (matchId) {
      await supabase.from("palata_request_matches")
        .update({ status: "accepted_work", responded_at: now })
        .eq("id", matchId);
    }

    // 2. Other matches → closed_by_other_expert
    await supabase.from("palata_request_matches")
      .update({ status: "closed_by_other_expert" })
      .eq("request_id", item.request_id)
      .neq("expert_id", userId)
      .not("status", "in", '("declined","closed_by_other_expert","withdrawn","customer_declined_start_date")');

    // 3. Request → in_work
    await supabase.from("palata_requests")
      .update({ status: "in_work", updated_at: now })
      .eq("id", item.request_id);

    // 4. Contact record → accepted_work
    await supabase.from("palata_request_contacts")
      .update({ expert_status: "accepted_work", expert_status_updated_at: now })
      .eq("request_id", item.request_id)
      .eq("expert_id", userId);

    // 5. Resolve expert's action item; cancel others for this request
    await resolveActionItem(item.id);
    await cancelRequestActionItems(item.request_id, item.id);

    // 6. Action item for customer: expert_started_work
    const custId = custIdFromPayload ?? req?.customer_id ?? null;
    if (custId) {
      await createActionItem({
        request_id:          item.request_id,
        expert_id:           userId,
        customer_id:         custId,
        assigned_to_user_id: custId,
        assigned_role:       "customer",
        action_type:         "expert_started_work",
        title:               "Эксперт взял заказ в работу",
        description:         `Эксперт подтвердил готовность и приступил к заказу ${shortId}`,
        payload:             { expert_id: userId, can_start_from: canStartFrom },
      });

      const custEmail = await getCustomerEmail(custId);
      if (custEmail) {
        await logEmailTestEvent(custId, custEmail, "expert_started_work",
          "Эксперт взял ваш заказ в работу",
          { request_id: item.request_id, expert_id: userId });
      }
    }

    // 7. Events
    await logStatusEvent(item.request_id, "expert_selection", "in_work", "expert_took_work");
    if (userEmail) {
      await logEmailTestEvent(userId, userEmail, "expert_accepted_work",
        "Вы взяли заказ в работу",
        { request_id: item.request_id });
    }

    setBusy(false);
    onDone();
  }

  // ── «Отказаться» ─────────────────────────────────────────────────────────────

  async function handleDecline() {
    setBusy(true);
    const now = new Date().toISOString();
    const matchId = await getMatchId();

    // 1. Match → declined
    if (matchId) {
      await supabase.from("palata_request_matches")
        .update({
          status: "declined",
          decline_reason: declineReason,
          decline_comment: declineComment || null,
          responded_at: now,
        })
        .eq("id", matchId);
    }

    // 2. Contact record → declined
    await supabase.from("palata_request_contacts")
      .update({
        expert_status:            "declined",
        expert_status_updated_at: now,
        failure_reason:           declineReason,
        expert_comment:           declineComment || null,
      })
      .eq("request_id", item.request_id)
      .eq("expert_id", userId);

    // 3. Resolve expert's action item
    await resolveActionItem(item.id);

    // 4. Action item for customer: expert_declined
    const custId = custIdFromPayload ?? req?.customer_id ?? null;
    if (custId) {
      await createActionItem({
        request_id:          item.request_id,
        expert_id:           userId,
        customer_id:         custId,
        assigned_to_user_id: custId,
        assigned_role:       "customer",
        action_type:         "expert_declined",
        title:               "Эксперт отказался от заказа",
        description:         `Эксперт не может взять заказ ${shortId} в работу. Выберите другого эксперта.`,
        payload:             { expert_id: userId, decline_reason: declineReason },
      });

      const custEmail = await getCustomerEmail(custId);
      if (custEmail) {
        await logEmailTestEvent(custId, custEmail, "expert_declined",
          "Эксперт отказался от заказа",
          { request_id: item.request_id, decline_reason: declineReason });
      }
    }

    // 5. Events
    await logStatusEvent(item.request_id, "expert_selection", "matching", "expert_declined");

    // 6. Re-matching if all experts declined
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

      if (allDeclined) {
        const custId2 = custIdFromPayload ?? req?.customer_id ?? undefined;
        await runMatching({
          requestId:           item.request_id,
          expertiseDirectionId: req?.expertise_direction_id ?? null,
          regionIds:           req?.region_id ? [req.region_id] : [],
          requiresTravel:      req?.requires_travel ?? false,
          customerId:          custId2 ?? undefined,
        });
      }
    } catch { /* non-fatal */ }

    setBusy(false);
    onDone();
  }

  return (
    <div className="bg-white border border-[#0F4C9A]/40 rounded-xl shadow-sm overflow-hidden">
      <div className="p-5">
        <ExpertActionItemHeader item={item} />

        {/* Request details */}
        {reqLoading ? (
          <p className="text-xs text-[#666666] mt-3">Загрузка деталей заказа…</p>
        ) : req ? (
          <div className="mt-3 bg-[#F4F4F4] rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-[10px] font-mono text-[#666666]">{shortId}</p>
            <p className="text-sm font-semibold text-[#111111]">{req.title}</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {(req.expertise_direction_id || req.expertise_type) && (
                <span className="text-[11px] text-[#0F4C9A] bg-[#0F4C9A]/10 px-1.5 py-0.5 rounded">
                  {dirMap[req.expertise_direction_id ?? ""] ?? req.expertise_type ?? "—"}
                </span>
              )}
            </div>
          </div>
        ) : null}

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
              <button
                disabled={busy}
                onClick={handleDecline}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {busy ? "…" : "Подтвердить отказ"}
              </button>
              <button
                onClick={() => setAction("idle")}
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

  async function handleAck() {
    await resolveActionItem(item.id);
    setDone(true);
    onDone();
  }

  if (done) return null;

  return (
    <div className="bg-white border border-red-200 rounded-xl p-5 shadow-sm">
      <ExpertActionItemHeader item={item} />
      <div className="mt-3 bg-red-50 rounded-xl px-4 py-3 space-y-1">
        <p className="text-xs text-red-700 font-medium">
          Заказчик не согласился с предложенной вами датой начала. Заявка отклонена.
        </p>
        <p className="text-xs text-slate-500">{item.description}</p>
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
