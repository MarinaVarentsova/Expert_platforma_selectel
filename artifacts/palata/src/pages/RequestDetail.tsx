import { useCallback, useEffect, useState } from "react";
import { useParams } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/lib/authContext";
import { runMatching } from "@/lib/matching";
import { notify, type NotifyItem } from "@/lib/notifyApi";
import {
  resolveActionItem,
  createActionItem,
  logStatusEvent,
  logEmailTestEvent,
  type ActionItem,
} from "@/lib/actionItems";

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

type ContactRecord = {
  id: string;
  request_id: string;
  expert_id: string;
  revealed_at: string | null;
  contact_opened_at: string | null;
  expert_status: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  expert_phone: string | null;
  expert_email: string | null;
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

type EmailEvent = {
  id: string;
  recipient_id: string | null;
  email_address: string;
  template_name: string;
  subject: string | null;
  context: Record<string, unknown> | null;
  sent_at: string;
  error: string | null;
};

type ExpertRating = {
  id: string;
  request_id: string;
  expert_id: string;
  customer_id: string;
  score: number;
  comment: string | null;
  created_at: string;
};

type CustomerRating = {
  id: string;
  request_id: string;
  customer_id: string;
  expert_id: string;
  score: number;
  comment: string | null;
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
  contacts: ContactRecord[];
  expertProfiles: ExpertProfile[];
  events: StatusEvent[];
  emailEvents: EmailEvent[];
  expertRatings: ExpertRating[];
  customerRatings: CustomerRating[];
  usersMap: Record<string, User>;
};

type PageState =
  | { kind: "loading" }
  | { kind: "ok"; data: LoadedData }
  | { kind: "error"; message: string }
  | { kind: "not_found" };

type MatchUIState =
  | { kind: "idle" }
  | { kind: "date_picker"; date: string }
  | { kind: "decline_form"; reason: string; note: string }
  | { kind: "submitting" }
  | { kind: "error"; message: string };

type CustUIState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string };

type RatingUIState =
  | { kind: "idle"; score: number; comment: string }
  | { kind: "submitting" }
  | { kind: "done" };

// ─── Constants ────────────────────────────────────────────────────────────────

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
  selected_by_customer:   { label: "Выбран заказчиком",   cls: "bg-[#16a34a]/10 text-[#1a3d2b]" },
  contacts_opened:        { label: "Контакты открыты",     cls: "bg-cyan-100 text-cyan-700" },
  accepted:               { label: "Принято",              cls: "bg-green-100 text-green-700" },
  accepted_work:          { label: "Взял в работу",        cls: "bg-indigo-100 text-indigo-700" },
  declined:                      { label: "Отказ",                    cls: "bg-red-100 text-red-600" },
  customer_declined_start_date:  { label: "Дата отклонена",            cls: "bg-orange-100 text-orange-600" },
  completed:                     { label: "Завершено",                  cls: "bg-emerald-100 text-emerald-700" },
  withdrawn:                     { label: "Отозвано",                   cls: "bg-slate-100 text-slate-500" },
  closed_by_other_expert:        { label: "Закрыт другим",              cls: "bg-slate-100 text-slate-400" },
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

const ALL_ORDER_STATUSES = [
  { value: "new",              label: "Новый" },
  { value: "pending",          label: "Ожидает" },
  { value: "matching",         label: "Идёт подбор" },
  { value: "expert_selection", label: "Выбор эксперта" },
  { value: "in_work",          label: "В работе" },
  { value: "completed",        label: "Выполнен" },
  { value: "cancelled",        label: "Неактуален" },
  { value: "failed",           label: "Ошибка подбора" },
];

const ACTIVE_MATCH_STATUSES = new Set(["proposed", "can_start_from", "selected_by_customer", "contacts_opened", "accepted", "accepted_work"]);
const EXPERT_CAN_ACT = new Set(["proposed", "can_start_from", "selected_by_customer", "contacts_opened", "accepted", "accepted_work"]);
const CONTACTS_REVEALED = new Set(["selected_by_customer", "contacts_opened", "can_start_from", "accepted", "accepted_work", "completed"]);
const CUSTOMER_CAN_SELECT = new Set(["proposed", "can_start_from"]);

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
function starRating(score: number) {
  return "★".repeat(score) + "☆".repeat(5 - score);
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

async function logEmailEvent(
  recipientId: string | null,
  emailAddress: string,
  templateName: string,
  subject: string,
  context: Record<string, unknown>,
) {
  await supabase.from("palata_email_events").insert({
    recipient_id: recipientId ?? null,
    email_address: emailAddress,
    template_name: templateName,
    subject,
    context,
    sent_at: new Date().toISOString(),
    error: "TEST_MODE",
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
      const [reqRes, filesRes, matchesRes, eventsRes, contactsRes, emailEventsRes] = await Promise.all([
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
        supabase.from("palata_request_contacts")
          .select("id, request_id, expert_id, revealed_at, customer_phone, customer_email, expert_phone, expert_email")
          .eq("request_id", id!),
        supabase.from("palata_email_events")
          .select("id, recipient_id, email_address, template_name, subject, context, sent_at, error")
          .contains("context", { request_id: id! })
          .order("sent_at", { ascending: false })
          .limit(50),
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
      const contacts = (contactsRes.data as ContactRecord[]) ?? [];
      const emailEvents = (emailEventsRes.data as EmailEvent[]) ?? [];

      const expertIds = [...new Set(matches.map(m => m.expert_id))];
      const actorIds = events.map(e => e.actor_id).filter(Boolean) as string[];
      const userIds = [...new Set(
        [request.customer_id, ...expertIds, ...actorIds].filter((id): id is string => id != null)
      )];

      const [profilesRes, usersRes, expRatRes, custRatRes] = await Promise.all([
        expertIds.length > 0
          ? supabase.from("palata_expert_profiles")
              .select("user_id, specializations, regions, experience_years, bio, business_trip_ready, palata_registry_verified, palata_registry_number, centrsudexpert_verified, centrsudexpert_registry_number, avg_customer_rating, completed_orders_count")
              .in("user_id", expertIds)
          : Promise.resolve({ data: [] as ExpertProfile[], error: null }),
        userIds.length > 0
          ? supabase.from("palata_users").select("id, full_name, email").in("id", userIds)
          : Promise.resolve({ data: [] as User[], error: null }),
        supabase.from("palata_expert_ratings").select("*").eq("request_id", id!),
        supabase.from("palata_customer_ratings").select("*").eq("request_id", id!),
      ]);

      const expertProfiles = (profilesRes.data as ExpertProfile[]) ?? [];
      const users = (usersRes.data as User[]) ?? [];
      const usersMap = Object.fromEntries(users.map(u => [u.id, u]));
      const expertRatings = (expRatRes.data as ExpertRating[]) ?? [];
      const customerRatings = (custRatRes.data as CustomerRating[]) ?? [];

      setState({ kind: "ok", data: {
        request, files, matches, contacts, expertProfiles,
        events, emailEvents, expertRatings, customerRatings, usersMap,
      }});
    }

    load();
  }, [id, loadKey]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
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
  const currentUser = useCurrentUser();
  const role = currentUser?.role ?? null;
  const userId = currentUser?.id ?? null;

  const { request: r, files, matches, contacts, expertProfiles,
          events, emailEvents, expertRatings, customerRatings, usersMap } = data;

  const contactsMap = Object.fromEntries(contacts.map(c => [c.expert_id, c]));
  const profileMap = Object.fromEntries(expertProfiles.map(p => [p.user_id, p]));
  const customer = r.customer_id ? usersMap[r.customer_id] : undefined;
  const orderStatus = ORDER_STATUS[r.status];
  const isOrderActive = !["completed", "cancelled", "failed"].includes(r.status);

  // Expert's own matches for this request
  const myMatches = userId ? matches.filter(m => m.expert_id === userId) : [];
  const myContact = userId ? contactsMap[userId] : undefined;
  const myActiveMatch = myMatches.find(m => EXPERT_CAN_ACT.has(m.status));
  const myCompletedMatch = myMatches.find(m => m.status === "completed");

  // Rating checks
  const hasRatedExpert = userId
    ? expertRatings.some(er => er.customer_id === userId)
    : false;
  const hasRatedCustomer = userId
    ? customerRatings.some(cr => cr.expert_id === userId)
    : false;
  const assignedExpertId = r.assigned_expert_id;

  // Notification helpers
  const customerEmail = r.customer_email || customer?.email || "";
  const requestShortId = shortId(r.id);

  function mkNotify(override: Partial<NotifyItem> & Pick<NotifyItem, "type" | "recipientEmail" | "recipientType">): NotifyItem {
    return {
      requestId:     r.id,
      requestShortId,
      requestTitle:  r.title,
      expertiseType: r.expertise_type,
      region:        r.region,
      currentStatus: r.status,
      ...override,
    };
  }

  // ── Open action items for this request (current user) ─────────────────────
  const [openRequestItems, setOpenRequestItems] = useState<ActionItem[]>([]);
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("palata_action_items")
      .select("*")
      .eq("assigned_to_user_id", userId)
      .eq("request_id", r.id)
      .eq("is_resolved", false)
      .then(({ data }) => setOpenRequestItems((data ?? []) as ActionItem[]));
  }, [userId, r.id]);

  const expertsMatchedItem = openRequestItems.find(i => i.action_type === "experts_matched");

  // ── Customer action state ──────────────────────────────────────────────────
  const [custUI, setCustUI] = useState<CustUIState>({ kind: "idle" });
  const [matchingRunning, setMatchingRunning] = useState(false);

  async function handleRematch() {
    setMatchingRunning(true);
    try {
      await runMatching({
        requestId: r.id, expertiseType: r.expertise_type,
        region: r.region, requiresTravel: r.requires_travel ?? false,
      });
    } catch (e) { console.error("Rematch error:", e); }
    finally { setMatchingRunning(false); onReload(); }
  }

  async function handleSelectExpert(match: Match) {
    if (!userId) return;
    setCustUI({ kind: "submitting" });
    try {
      const now = new Date().toISOString();
      const expertUser = usersMap[match.expert_id];

      // 1. Update match → selected_by_customer
      const { error: me } = await supabase
        .from("palata_request_matches")
        .update({ status: "selected_by_customer", responded_at: now })
        .eq("id", match.id);
      if (me) throw me;

      // 2. Create / update palata_request_contacts with populated fields
      const { data: existingContact } = await supabase
        .from("palata_request_contacts")
        .select("id")
        .eq("request_id", r.id)
        .eq("expert_id", match.expert_id)
        .maybeSingle();

      const contactPayload = {
        contact_opened_at: now,
        expert_status: "selected_by_customer",
        revealed_at: now,
        customer_phone: r.customer_phone ?? null,
        customer_email: r.customer_email ?? null,
        expert_email: expertUser?.email ?? null,
        expert_phone: null as string | null,
      };

      if (existingContact) {
        await supabase
          .from("palata_request_contacts")
          .update(contactPayload)
          .eq("id", existingContact.id);
      } else {
        const { error: ce } = await supabase
          .from("palata_request_contacts")
          .insert({ request_id: r.id, expert_id: match.expert_id, ...contactPayload });
        if (ce) throw ce;
      }

      // 3. Close experts_matched action item for customer
      if (expertsMatchedItem) {
        await resolveActionItem(expertsMatchedItem.id);
        setOpenRequestItems(prev => prev.filter(i => i.id !== expertsMatchedItem.id));
      }

      // 4. Create action item for expert: customer_selected_you
      await createActionItem({
        request_id: r.id,
        expert_id: match.expert_id,
        customer_id: r.customer_id,
        assigned_to_user_id: match.expert_id,
        assigned_role: "expert",
        action_type: "customer_selected_you",
        title: "Вас выбрали по заказу",
        description: `Заказчик выбрал вас для связи по заказу #${shortId(r.id)}`,
        payload: {
          request_id: r.id,
          expert_id: match.expert_id,
          customer_id: r.customer_id,
          contact_opened_at: now,
        },
      });

      // 5. Status event: expert_selected_by_customer
      await logStatusEvent(r.id, r.status, "expert_selected_by_customer",
        `Заказчик выбрал эксперта ${expertUser?.full_name ?? match.expert_id.slice(0, 8)}`);

      // 6. Email test event
      if (r.customer_id && customerEmail) {
        await logEmailTestEvent(
          r.customer_id,
          customerEmail,
          "customer_selected_expert",
          `Вы выбрали эксперта по заказу #${shortId(r.id)}`,
          { request_id: r.id, expert_id: match.expert_id },
        );
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
      const emailType = newStatus === "completed" ? "request_completed" : "request_cancelled";
      const payloads: NotifyItem[] = [];
      if (customerEmail) payloads.push(mkNotify({ type: emailType, recipientEmail: customerEmail, recipientType: "customer", currentStatus: newStatus }));
      if (assignedExpertId) {
        const ae = usersMap[assignedExpertId];
        if (ae?.email) payloads.push(mkNotify({ type: emailType, recipientEmail: ae.email, recipientType: "expert", expertId: assignedExpertId, expertName: ae.full_name ?? undefined, currentStatus: newStatus }));
      }
      if (payloads.length) notify(payloads);
      setCustUI({ kind: "idle" });
      onReload();
    } catch (e: unknown) {
      setCustUI({ kind: "error", message: (e as Error).message ?? "Ошибка" });
    }
  }

  // ── Per-match expert action state ──────────────────────────────────────────
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
      if (customerEmail) {
        const expertUser = usersMap[match.expert_id];
        notify(mkNotify({ type: "expert_can_take", recipientEmail: customerEmail, recipientType: "customer", expertId: match.expert_id, expertName: expertUser?.full_name ?? undefined, canStartFrom: fmtDate(date) }));
      }
      setMS(match.id, { kind: "idle" });
      onReload();
    } catch (e: unknown) {
      setMS(match.id, { kind: "error", message: (e as Error).message ?? "Ошибка" });
    }
  }

  async function handleDecline(match: Match, reason: string, note: string) {
    if (!reason) { setMS(match.id, { kind: "decline_form", reason: "", note }); return; }
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
      const { error: me } = await supabase.from("palata_request_matches")
        .update({ status: "accepted_work", responded_at: new Date().toISOString() })
        .eq("id", match.id);
      if (me) throw me;
      const otherIds = matches
        .filter(m => m.id !== match.id && ACTIVE_MATCH_STATUSES.has(m.status))
        .map(m => m.id);
      if (otherIds.length > 0) {
        await supabase.from("palata_request_matches")
          .update({ status: "closed_by_other_expert" }).in("id", otherIds);
      }
      const { error: re } = await supabase.from("palata_requests")
        .update({ status: "in_work", assigned_expert_id: match.expert_id }).eq("id", r.id);
      if (re) throw re;
      await logEvent("request", r.id, r.status, "in_work", "Эксперт взял в работу");
      const takenExpert = usersMap[match.expert_id];
      const payloads: NotifyItem[] = [];
      if (customerEmail) payloads.push(mkNotify({ type: "request_in_progress", recipientEmail: customerEmail, recipientType: "customer", expertId: match.expert_id, expertName: takenExpert?.full_name ?? undefined, currentStatus: "in_work" }));
      for (const m of matches) {
        if (m.id === match.id || !ACTIVE_MATCH_STATUSES.has(m.status)) continue;
        const oe = usersMap[m.expert_id];
        if (oe?.email) payloads.push(mkNotify({ type: "taken_by_other", recipientEmail: oe.email, recipientType: "expert", expertId: m.expert_id, expertName: oe.full_name ?? undefined }));
      }
      if (payloads.length) notify(payloads);
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
        .update({ status: "completed", responded_at: new Date().toISOString() }).eq("id", match.id);
      if (me) throw me;
      const { error: re } = await supabase.from("palata_requests")
        .update({ status: "completed" }).eq("id", r.id);
      if (re) throw re;
      await logEvent("request", r.id, r.status, "completed", "Работа завершена экспертом");
      const completedExpert = usersMap[match.expert_id];
      const payloads: NotifyItem[] = [];
      if (customerEmail) payloads.push(mkNotify({ type: "request_completed", recipientEmail: customerEmail, recipientType: "customer", expertId: match.expert_id, expertName: completedExpert?.full_name ?? undefined, currentStatus: "completed" }));
      if (completedExpert?.email) payloads.push(mkNotify({ type: "request_completed", recipientEmail: completedExpert.email, recipientType: "expert", expertId: match.expert_id, expertName: completedExpert.full_name ?? undefined, currentStatus: "completed" }));
      if (payloads.length) notify(payloads);
      // Email events (test mode)
      if (r.customer_id && customerEmail) {
        await logEmailEvent(r.customer_id, customerEmail, "order_completed_rate_expert",
          `Заказ выполнен — оцените эксперта`,
          { request_id: r.id, expert_id: match.expert_id });
      }
      if (completedExpert?.email) {
        await logEmailEvent(match.expert_id, completedExpert.email, "order_completed_rate_customer",
          `Заказ завершён — оцените заказчика`,
          { request_id: r.id });
      }
      setMS(match.id, { kind: "idle" });
      onReload();
    } catch (e: unknown) {
      setMS(match.id, { kind: "error", message: (e as Error).message ?? "Ошибка" });
    }
  }

  // ── Admin action state ─────────────────────────────────────────────────────
  const [adminStatus, setAdminStatus] = useState(r.status);
  const [adminComment, setAdminComment] = useState("");
  const [adminAssignMatchId, setAdminAssignMatchId] = useState(
    matches.find(m => m.expert_id === r.assigned_expert_id)?.id ?? ""
  );
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  async function handleAdminStatusChange() {
    if (adminStatus === r.status) return;
    setAdminSubmitting(true); setAdminError(null);
    const { error } = await supabase.from("palata_requests")
      .update({ status: adminStatus }).eq("id", r.id);
    if (error) { setAdminError(error.message); setAdminSubmitting(false); return; }
    await logEvent("request", r.id, r.status, adminStatus, "Статус изменён администратором");
    setAdminSubmitting(false);
    onReload();
  }

  async function handleAdminAssign() {
    const match = matches.find(m => m.id === adminAssignMatchId);
    if (!match) return;
    setAdminSubmitting(true); setAdminError(null);
    const { error } = await supabase.from("palata_requests")
      .update({ assigned_expert_id: match.expert_id }).eq("id", r.id);
    if (error) { setAdminError(error.message); setAdminSubmitting(false); return; }
    const expertName = userName(usersMap[match.expert_id]) ?? match.expert_id;
    await logEvent("request", r.id, r.status, r.status, `Назначен эксперт: ${expertName}`);
    setAdminSubmitting(false);
    onReload();
  }

  async function handleAdminReturnToMatching() {
    setAdminSubmitting(true); setAdminError(null);
    const newRound = r.matching_round + 1;
    const { error } = await supabase.from("palata_requests")
      .update({ status: "matching", matching_round: newRound }).eq("id", r.id);
    if (error) { setAdminError(error.message); setAdminSubmitting(false); return; }
    await logEvent("request", r.id, r.status, "matching", `Возвращён в подбор администратором (раунд ${newRound})`);
    setAdminSubmitting(false);
    onReload();
  }

  async function handleAdminComment() {
    if (!adminComment.trim()) return;
    setAdminSubmitting(true); setAdminError(null);
    await logEvent("request", r.id, r.status, r.status, `[Администратор] ${adminComment.trim()}`);
    setAdminComment("");
    setAdminSubmitting(false);
    onReload();
  }

  async function handleAdminClose() {
    setAdminSubmitting(true); setAdminError(null);
    const { error } = await supabase.from("palata_requests")
      .update({ status: "cancelled" }).eq("id", r.id);
    if (error) { setAdminError(error.message); setAdminSubmitting(false); return; }
    await logEvent("request", r.id, r.status, "cancelled", "Закрыт администратором");
    setAdminSubmitting(false);
    onReload();
  }

  // ── Rating state ───────────────────────────────────────────────────────────
  const [ratingUI, setRatingUI] = useState<RatingUIState>({ kind: "idle", score: 5, comment: "" });

  async function handleRateExpert(expertId: string) {
    if (ratingUI.kind !== "idle") return;
    const score = ratingUI.score;
    const comment = ratingUI.comment;
    setRatingUI({ kind: "submitting" });
    const { error } = await supabase.from("palata_expert_ratings").insert({
      request_id: r.id,
      expert_id: expertId,
      customer_id: userId,
      score,
      comment: comment || null,
    });
    if (error) { setRatingUI({ kind: "idle", score: 5, comment: "" }); return; }
    await logEvent("request", r.id, r.status, r.status, `Заказчик оценил эксперта: ${score}/5`);
    const expertUser = usersMap[expertId];
    if (expertUser?.email) {
      await logEmailEvent(expertId, expertUser.email, "expert_rated_by_customer",
        `Вас оценил заказчик — ${score} из 5`,
        { request_id: r.id, score });
    }
    setRatingUI({ kind: "done" });
    onReload();
  }

  async function handleRateCustomer() {
    if (ratingUI.kind !== "idle" || !r.customer_id) return;
    const score = ratingUI.score;
    const comment = ratingUI.comment;
    setRatingUI({ kind: "submitting" });
    const { error } = await supabase.from("palata_customer_ratings").insert({
      request_id: r.id,
      customer_id: r.customer_id,
      expert_id: userId,
      score,
      comment: comment || null,
    });
    if (error) { setRatingUI({ kind: "idle", score: 5, comment: "" }); return; }
    await logEvent("request", r.id, r.status, r.status, `Эксперт оценил заказчика: ${score}/5`);
    const custUser = usersMap[r.customer_id];
    if (custUser?.email) {
      await logEmailEvent(r.customer_id, custUser.email, "customer_rated_by_expert",
        `Эксперт оставил вам оценку — ${score} из 5`,
        { request_id: r.id, score });
    }
    setRatingUI({ kind: "done" });
    onReload();
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectableMatches = matches.filter(m => ACTIVE_MATCH_STATUSES.has(m.status));

  return (
    <div className="space-y-6">

      {/* ══ 1. ОСНОВНАЯ ИНФОРМАЦИЯ ══════════════════════════════════════════ */}
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
          {/* Customer contacts — visible to customer and admin, not expert */}
          {role !== "expert" && (
            <Field label="Заказчик">
              {customer
                ? (userName(customer) ?? <span className="font-mono text-xs">{customer.email}</span>)
                : r.customer_name
                  ? r.customer_name
                  : <span className="text-slate-400 italic">Нет данных</span>}
            </Field>
          )}
          {role !== "expert" && r.customer_phone && <Field label="Телефон заказчика">{r.customer_phone}</Field>}
          {role !== "expert" && r.customer_email && <Field label="Email заказчика">{r.customer_email}</Field>}

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
          {role === "admin" && r.assigned_expert_id && (
            <Field label="Назначен эксперт">
              {userName(usersMap[r.assigned_expert_id]) ?? r.assigned_expert_id.slice(0, 8)}
            </Field>
          )}
        </div>
      </Card>

      {/* ══ 2. ДЕЙСТВИЯ ЗАКАЗЧИКА ══════════════════════════════════════════ */}
      {role === "customer" && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
            <h2 className="text-sm font-semibold text-slate-700">Действия заказчика</h2>
          </div>

          {custUI.kind === "error" && (
            <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
              {custUI.message}
              <button className="ml-2 underline" onClick={() => setCustUI({ kind: "idle" })}>Закрыть</button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 items-start">
            {isOrderActive && (r.status === "new" || r.status === "pending" || r.status === "matching") && custUI.kind === "idle" && (
              <button className="btn-primary" onClick={handleRematch} disabled={matchingRunning}>
                {matchingRunning ? "Идёт подбор…" : "Запустить подбор экспертов"}
              </button>
            )}

            {custUI.kind === "submitting" && <Spinner inline />}

            {isOrderActive && custUI.kind === "idle" && (
              <button className="btn-danger" onClick={() => handleOrderStatus("cancelled")}>
                Сделать неактуальным
              </button>
            )}
            {!isOrderActive && (
              <p className="text-xs text-slate-400 italic">Заказ завершён — действия недоступны</p>
            )}

            {/* Prompt: select expert from matched list below */}
            {isOrderActive && expertsMatchedItem && custUI.kind === "idle" && (
              <div className="w-full mt-1 p-3 rounded-lg bg-[#f0f5f1] border border-[#d4e5d9] text-xs text-[#1a3d2b]">
                <span className="font-semibold">Подберите эксперта</span> — ниже показаны профили подобранных специалистов. Нажмите «Выбрать эксперта» под карточкой нужного.
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ══ 3. СТАТУС ЭКСПЕРТА ПО ЭТОМУ ЗАКАЗУ ══════════════════════════════ */}
      {role === "expert" && (
        <>
          {myMatches.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-400 italic">У вас нет матча по этому заказу</p>
            </Card>
          ) : (
            myMatches.map(m => {
              const ms = MATCH_STATUS[m.status];
              const ui = getMS(m.id);
              const canAct = EXPERT_CAN_ACT.has(m.status);
              const contactsOpen = CONTACTS_REVEALED.has(m.status) && myContact;

              return (
                <div key={m.id} className="space-y-4">

                  {/* Expert match status card */}
                  <Card>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-400" />
                        <h2 className="text-sm font-semibold text-slate-700">Мой статус по заказу</h2>
                        <span className="text-xs text-slate-400">Раунд {m.matching_round}</span>
                      </div>
                      <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${ms?.cls ?? "bg-slate-100 text-slate-500"}`}>
                        {ms?.label ?? m.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
                      <Field label="Направление">{r.expertise_type}</Field>
                      <Field label="Регион">{r.region}</Field>
                      <Field label="Срочность">{URGENCY_LABEL[r.urgency] ?? r.urgency ?? "Стандартная"}</Field>
                      <Field label="Предложено">{fmtDate(m.proposed_at)}</Field>
                      {m.can_start_from_date && <Field label="Могу взять с">{fmtDate(m.can_start_from_date)}</Field>}
                      {m.responded_at && <Field label="Ответ дан">{fmtDate(m.responded_at)}</Field>}
                    </div>

                    {/* Customer contacts — visible only when contacts are opened */}
                    {contactsOpen && myContact && (
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 mb-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-2">
                          Контакты заказчика
                        </p>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                          {myContact.customer_phone && (
                            <div>
                              <p className="text-[10px] text-blue-400 mb-0.5">Телефон</p>
                              <p className="text-sm font-semibold text-blue-800">{myContact.customer_phone}</p>
                            </div>
                          )}
                          {myContact.customer_email && (
                            <div>
                              <p className="text-[10px] text-blue-400 mb-0.5">Email</p>
                              <p className="text-sm font-semibold text-blue-800">{myContact.customer_email}</p>
                            </div>
                          )}
                        </div>
                        {myContact.revealed_at && (
                          <p className="text-[10px] text-blue-300 mt-1.5">Открыты: {fmtDate(myContact.revealed_at)}</p>
                        )}
                      </div>
                    )}

                    {/* Decline reason */}
                    {m.decline_reason && (
                      <div className="p-3 bg-red-50 rounded-lg border border-red-100 mb-4 flex items-start gap-2">
                        <span className="text-red-400 text-xs mt-0.5">✗</span>
                        <div>
                          <p className="text-xs font-medium text-red-700">
                            {DECLINE_REASONS.find(dr => dr.value === m.decline_reason)?.label ?? m.decline_reason}
                          </p>
                          {m.decline_note && <p className="text-xs text-red-600 mt-0.5">{m.decline_note}</p>}
                        </div>
                      </div>
                    )}

                    {/* Expert actions */}
                    {canAct && (
                      <div className="border-t border-slate-100 pt-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Действия</p>

                        {ui.kind === "error" && (
                          <div className="mb-2 p-2 rounded bg-red-100 text-xs text-red-600">
                            {ui.message}
                            <button className="ml-2 underline" onClick={() => setMS(m.id, { kind: "idle" })}>×</button>
                          </div>
                        )}
                        {ui.kind === "submitting" && <Spinner inline />}

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
                            <button className="btn-ghost-sm" onClick={() => setMS(m.id, { kind: "idle" })}>Отмена</button>
                          </div>
                        )}

                        {ui.kind === "decline_form" && (
                          <div className="space-y-2 mb-2">
                            <select
                              className="w-full text-sm border border-slate-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
                              value={ui.reason}
                              onChange={e => setMS(m.id, { kind: "decline_form", reason: e.target.value, note: ui.note })}
                            >
                              <option value="">— Причина отказа —</option>
                              {DECLINE_REASONS.map(dr => <option key={dr.value} value={dr.value}>{dr.label}</option>)}
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
                              <button className="btn-ghost-sm" onClick={() => setMS(m.id, { kind: "idle" })}>Отмена</button>
                            </div>
                          </div>
                        )}

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
                            {["proposed", "can_start_from", "contacts_opened", "accepted"].includes(m.status) && r.status !== "in_work" && (
                              <button className="btn-primary-sm" onClick={() => handleTakeWork(m)}>
                                Взять в работу
                              </button>
                            )}
                            {["accepted_work", "accepted"].includes(m.status) && (
                              <button className="btn-success-sm" onClick={() => handleCompleteWork(m)}>
                                Завершить заказ
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                </div>
              );
            })
          )}

          {/* Rate customer — after expert's match is completed */}
          {myCompletedMatch && !hasRatedCustomer && (
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <h2 className="text-sm font-semibold text-slate-700">Оценить заказчика</h2>
              </div>
              {ratingUI.kind === "done" ? (
                <p className="text-sm text-emerald-600 font-medium">Оценка сохранена. Спасибо!</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button
                        key={s}
                        onClick={() => ratingUI.kind === "idle" && setRatingUI({ ...ratingUI, score: s })}
                        className={`text-2xl transition-colors ${ratingUI.kind === "idle" && ratingUI.score >= s ? "text-amber-400" : "text-slate-200"}`}
                      >★</button>
                    ))}
                    <span className="ml-2 text-sm text-slate-500 self-center">
                      {ratingUI.kind === "idle" ? `${ratingUI.score} / 5` : ""}
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder="Комментарий (необязательно)"
                    className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={ratingUI.kind === "idle" ? ratingUI.comment : ""}
                    onChange={e => ratingUI.kind === "idle" && setRatingUI({ ...ratingUI, comment: e.target.value })}
                  />
                  <button
                    className="btn-primary"
                    onClick={handleRateCustomer}
                    disabled={ratingUI.kind === "submitting"}
                  >
                    {ratingUI.kind === "submitting" ? "Сохранение…" : "Отправить оценку"}
                  </button>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* ══ 4. АДМИНИСТРАТИВНЫЕ ДЕЙСТВИЯ ═════════════════════════════════════ */}
      {role === "admin" && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            <h2 className="text-sm font-semibold text-slate-700">Административные действия</h2>
          </div>

          {adminError && (
            <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
              {adminError}
              <button className="ml-2 underline" onClick={() => setAdminError(null)}>Закрыть</button>
            </div>
          )}

          <div className="space-y-4">
            {/* Status change */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-slate-500 shrink-0 w-28">Изменить статус:</label>
              <select
                className="text-sm border border-slate-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                value={adminStatus}
                onChange={e => setAdminStatus(e.target.value)}
              >
                {ALL_ORDER_STATUSES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <button
                className="btn-primary-sm"
                disabled={adminSubmitting || adminStatus === r.status}
                onClick={handleAdminStatusChange}
              >
                Применить
              </button>
            </div>

            {/* Assign expert from matches */}
            {matches.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-slate-500 shrink-0 w-28">Назначить эксперта:</label>
                <select
                  className="text-sm border border-slate-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                  value={adminAssignMatchId}
                  onChange={e => setAdminAssignMatchId(e.target.value)}
                >
                  <option value="">— Выберите из матчей —</option>
                  {matches.map(m => {
                    const u = usersMap[m.expert_id];
                    return (
                      <option key={m.id} value={m.id}>
                        {userName(u) ?? m.expert_id.slice(0, 8)} ({MATCH_STATUS[m.status]?.label ?? m.status})
                      </option>
                    );
                  })}
                </select>
                <button
                  className="btn-primary-sm"
                  disabled={adminSubmitting || !adminAssignMatchId}
                  onClick={handleAdminAssign}
                >
                  Назначить
                </button>
              </div>
            )}

            {/* Quick actions */}
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-ghost-sm"
                disabled={adminSubmitting}
                onClick={handleAdminReturnToMatching}
              >
                ↩ Вернуть в подбор
              </button>
              <button
                className="btn-ghost-sm border-red-200 text-red-600 hover:bg-red-50"
                disabled={adminSubmitting}
                onClick={handleAdminClose}
              >
                Закрыть заказ
              </button>
              {selectableMatches.length > 0 && (
                <button
                  className="btn-ghost-sm"
                  disabled={adminSubmitting}
                  onClick={() => handleSelectExpert(selectableMatches[0])}
                >
                  Открыть контакты (1й матч)
                </button>
              )}
            </div>

            {/* Admin comment */}
            <div className="flex gap-2 items-start border-t border-slate-100 pt-4">
              <input
                type="text"
                placeholder="Добавить комментарий администратора…"
                className="flex-1 text-sm border border-slate-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400"
                value={adminComment}
                onChange={e => setAdminComment(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdminComment()}
              />
              <button
                className="btn-primary-sm shrink-0"
                disabled={adminSubmitting || !adminComment.trim()}
                onClick={handleAdminComment}
              >
                Добавить
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* ══ 5. ДОКУМЕНТЫ ════════════════════════════════════════════════════ */}
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
                    target="_blank" rel="noopener noreferrer"
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

      {/* ══ 6. ПОДОБРАННЫЕ ЭКСПЕРТЫ (customer + admin) ══════════════════════ */}
      {(role === "customer" || role === "admin") && (
        <Card title="Подобранные эксперты" count={matches.length}>
          {matches.length === 0 ? <Empty text="Эксперты ещё не подбирались" /> : (
            <div className="space-y-4">
              {matches.map(m => {
                const profile = profileMap[m.expert_id];
                const user = usersMap[m.expert_id];
                const ms = MATCH_STATUS[m.status];
                const ui = getMS(m.id);
                const contact = contactsMap[m.expert_id];
                const hasContacts = CONTACTS_REVEALED.has(m.status) && contact;
                // For admin: also show expert actions; for customer: no expert actions
                const isAdminView = role === "admin";
                const canAct = isAdminView && EXPERT_CAN_ACT.has(m.status);

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

                    {/* Expert profile */}
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

                    {/* Customer: Выбрать эксперта — shown when experts_matched is open */}
                    {role === "customer" && isOrderActive && CUSTOMER_CAN_SELECT.has(m.status) && expertsMatchedItem && (
                      <div className="px-4 py-3 bg-[#f0f5f1] border-t border-[#d4e5d9]">
                        {custUI.kind === "submitting" ? (
                          <div className="flex items-center gap-2 text-sm text-[#5a7560]">
                            <Spinner inline />
                            Обрабатывается…
                          </div>
                        ) : (
                          <button
                            className="btn-primary"
                            onClick={() => handleSelectExpert(m)}
                          >
                            Выбрать эксперта
                          </button>
                        )}
                      </div>
                    )}

                    {/* Contacts — role-aware */}
                    {hasContacts && contact && (
                      <div className="px-4 py-3 bg-[#f0f5f1] border-t border-[#d4e5d9]">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#5a7560] mb-2">Контакты открыты</p>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                          {/* Customer sees expert contacts */}
                          {contact.expert_phone && (
                            <div>
                              <p className="text-[10px] text-[#8aaa90] mb-0.5">Телефон эксперта</p>
                              <p className="text-sm font-semibold text-[#141c17]">{contact.expert_phone}</p>
                            </div>
                          )}
                          {contact.expert_email && (
                            <div>
                              <p className="text-[10px] text-[#8aaa90] mb-0.5">Email эксперта</p>
                              <p className="text-sm font-semibold text-[#141c17]">{contact.expert_email}</p>
                            </div>
                          )}
                          {/* Admin also sees customer contacts */}
                          {isAdminView && contact.customer_phone && (
                            <div>
                              <p className="text-[10px] text-[#8aaa90] mb-0.5">Телефон заказчика</p>
                              <p className="text-sm font-semibold text-[#141c17]">{contact.customer_phone}</p>
                            </div>
                          )}
                          {isAdminView && contact.customer_email && (
                            <div>
                              <p className="text-[10px] text-[#8aaa90] mb-0.5">Email заказчика</p>
                              <p className="text-sm font-semibold text-[#141c17]">{contact.customer_email}</p>
                            </div>
                          )}
                        </div>
                        {contact.contact_opened_at && (
                          <p className="text-[10px] text-[#8aaa90] mt-2">Выбран: {fmtDate(contact.contact_opened_at)}</p>
                        )}
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
                            {DECLINE_REASONS.find(dr => dr.value === m.decline_reason)?.label ?? m.decline_reason}
                          </p>
                          {m.decline_note && <p className="text-xs text-red-600 mt-0.5">{m.decline_note}</p>}
                        </div>
                        {m.responded_at && (
                          <p className="ml-auto text-xs text-red-300 shrink-0">{fmtDate(m.responded_at)}</p>
                        )}
                      </div>
                    )}

                    {/* Admin: expert actions (simulate/override) */}
                    {canAct && isAdminView && (
                      <div className="px-4 py-3 bg-purple-50 border-t border-purple-100">
                        <p className="text-xs font-semibold text-purple-600 mb-2 uppercase tracking-wide">
                          Действия от имени эксперта
                        </p>
                        {ui.kind === "error" && (
                          <div className="mb-2 p-2 rounded bg-red-100 text-xs text-red-600">
                            {ui.message}
                            <button className="ml-2 underline" onClick={() => setMS(m.id, { kind: "idle" })}>×</button>
                          </div>
                        )}
                        {ui.kind === "submitting" && <Spinner inline />}
                        {ui.kind === "date_picker" && (
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <input
                              type="date"
                              className="text-sm border border-slate-300 rounded-md px-2 py-1 focus:outline-none"
                              value={ui.date}
                              onChange={e => setMS(m.id, { kind: "date_picker", date: e.target.value })}
                            />
                            <button className="btn-success-sm" disabled={!ui.date} onClick={() => ui.date && handleCanStart(m, ui.date)}>
                              Подтвердить
                            </button>
                            <button className="btn-ghost-sm" onClick={() => setMS(m.id, { kind: "idle" })}>Отмена</button>
                          </div>
                        )}
                        {ui.kind === "decline_form" && (
                          <div className="space-y-2 mb-2">
                            <select
                              className="w-full text-sm border border-slate-300 rounded-md px-3 py-1.5 bg-white focus:outline-none"
                              value={ui.reason}
                              onChange={e => setMS(m.id, { kind: "decline_form", reason: e.target.value, note: ui.note })}
                            >
                              <option value="">— Причина —</option>
                              {DECLINE_REASONS.map(dr => <option key={dr.value} value={dr.value}>{dr.label}</option>)}
                            </select>
                            <div className="flex gap-2">
                              <button className="btn-danger-sm" disabled={!ui.reason} onClick={() => ui.reason && handleDecline(m, ui.reason, ui.note)}>
                                Отказ
                              </button>
                              <button className="btn-ghost-sm" onClick={() => setMS(m.id, { kind: "idle" })}>Отмена</button>
                            </div>
                          </div>
                        )}
                        {(ui.kind === "idle" || ui.kind === "error") && (
                          <div className="flex flex-wrap gap-2">
                            {["proposed", "can_start_from", "contacts_opened", "accepted"].includes(m.status) && (
                              <button className="btn-teal-sm" onClick={() => setMS(m.id, { kind: "date_picker", date: "" })}>
                                Может взять с даты
                              </button>
                            )}
                            {["proposed", "can_start_from", "contacts_opened", "accepted"].includes(m.status) && (
                              <button className="btn-ghost-sm border-red-200 text-red-600 hover:bg-red-50" onClick={() => setMS(m.id, { kind: "decline_form", reason: "", note: "" })}>
                                Отказ
                              </button>
                            )}
                            {["can_start_from", "contacts_opened", "accepted"].includes(m.status) && (
                              <button className="btn-primary-sm" onClick={() => handleTakeWork(m)}>
                                Взял в работу
                              </button>
                            )}
                            {["accepted_work", "accepted"].includes(m.status) && (
                              <button className="btn-success-sm" onClick={() => handleCompleteWork(m)}>
                                Завершить заказ
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
      )}

      {/* ══ 7. ОЦЕНИТЬ ЭКСПЕРТА (customer) ══════════════════════════════════ */}
      {role === "customer" && r.status === "completed" && assignedExpertId && !hasRatedExpert && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <h2 className="text-sm font-semibold text-slate-700">Оценить эксперта</h2>
          </div>
          {ratingUI.kind === "done" ? (
            <p className="text-sm text-emerald-600 font-medium">Оценка сохранена. Спасибо!</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Оцените работу эксперта{assignedExpertId ? ` ${userName(usersMap[assignedExpertId]) ?? ""}` : ""}:
              </p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(s => (
                  <button
                    key={s}
                    onClick={() => ratingUI.kind === "idle" && setRatingUI({ ...ratingUI, score: s })}
                    className={`text-2xl transition-colors ${ratingUI.kind === "idle" && ratingUI.score >= s ? "text-amber-400" : "text-slate-200"}`}
                  >★</button>
                ))}
                <span className="ml-2 text-sm text-slate-500 self-center">
                  {ratingUI.kind === "idle" ? `${ratingUI.score} / 5` : ""}
                </span>
              </div>
              <input
                type="text"
                placeholder="Комментарий (необязательно)"
                className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={ratingUI.kind === "idle" ? ratingUI.comment : ""}
                onChange={e => ratingUI.kind === "idle" && setRatingUI({ ...ratingUI, comment: e.target.value })}
              />
              <button
                className="btn-primary"
                onClick={() => handleRateExpert(assignedExpertId)}
                disabled={ratingUI.kind === "submitting"}
              >
                {ratingUI.kind === "submitting" ? "Сохранение…" : "Отправить оценку"}
              </button>
            </div>
          )}
        </Card>
      )}

      {/* ══ 8. РЕЙТИНГИ (admin) ══════════════════════════════════════════════ */}
      {role === "admin" && (expertRatings.length > 0 || customerRatings.length > 0) && (
        <Card title="Оценки по заказу">
          <div className="space-y-3">
            {expertRatings.map(er => {
              const expert = usersMap[er.expert_id];
              const rater = usersMap[er.customer_id];
              return (
                <div key={er.id} className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <div className="flex-1">
                    <p className="text-xs text-slate-500 mb-0.5">
                      Оценка эксперту <span className="font-semibold text-slate-700">{userName(expert) ?? "—"}</span>
                      {rater && <span className="text-slate-400"> от {userName(rater)}</span>}
                    </p>
                    <p className="text-lg text-amber-500">{starRating(er.score)}</p>
                    {er.comment && <p className="text-xs text-slate-600 mt-1 italic">"{er.comment}"</p>}
                  </div>
                  <p className="text-xs text-slate-400 shrink-0">{fmtDate(er.created_at)}</p>
                </div>
              );
            })}
            {customerRatings.map(cr => {
              const expert = usersMap[cr.expert_id];
              const cust = usersMap[cr.customer_id];
              return (
                <div key={cr.id} className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-100">
                  <div className="flex-1">
                    <p className="text-xs text-slate-500 mb-0.5">
                      Оценка заказчику <span className="font-semibold text-slate-700">{userName(cust) ?? "—"}</span>
                      {expert && <span className="text-slate-400"> от {userName(expert)}</span>}
                    </p>
                    <p className="text-lg text-green-500">{starRating(cr.score)}</p>
                    {cr.comment && <p className="text-xs text-slate-600 mt-1 italic">"{cr.comment}"</p>}
                  </div>
                  <p className="text-xs text-slate-400 shrink-0">{fmtDate(cr.created_at)}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ══ 9. ИСТОРИЯ СОБЫТИЙ ═══════════════════════════════════════════════ */}
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

      {/* ══ 10. EMAIL-СОБЫТИЯ (admin) ════════════════════════════════════════ */}
      {role === "admin" && (
        <Card title="Email-события" count={emailEvents.length}>
          {emailEvents.length === 0 ? <Empty text="Email-событий не зафиксировано" /> : (
            <div className="divide-y divide-slate-50 -mx-6 -mb-6">
              {emailEvents.map(e => (
                <div key={e.id} className="px-6 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                        {e.template_name}
                      </span>
                      {e.error && (
                        <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                          Ошибка
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-slate-700 truncate">{e.subject ?? "—"}</p>
                    <p className="text-xs text-slate-400 truncate">{e.email_address}</p>
                    {e.error && <p className="text-xs text-red-500 mt-0.5 italic truncate">{e.error}</p>}
                  </div>
                  <p className="text-xs text-slate-400 shrink-0">{fmt(e.sent_at)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

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
