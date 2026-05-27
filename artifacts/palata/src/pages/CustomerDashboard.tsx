import { useEffect, useState } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";
import { KanbanBoard } from "@/components/KanbanBoard";
import {
  PlusCircle, FileText, User, MapPin, Building2,
  Phone, Mail, ClipboardList, Hash, Star,
} from "lucide-react";

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
  const [tab, setTab] = useState<"requests" | "rate" | "profile">("requests");
  const [requestState, setRequestState] = useState<RequestState>({ kind: "loading" });
  const [profileState, setProfileState] = useState<ProfileState>({ kind: "loading" });
  const [pendingRatingsState, setPendingRatingsState] = useState<PendingRatingsState>({ kind: "loading" });
  const [ratedRequestIds, setRatedRequestIds] = useState<Set<string>>(new Set());
  const [ratingForms, setRatingForms] = useState<Record<string, RatingFormState>>({});

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
    <div className="px-6 py-8 max-w-[1400px]">

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
