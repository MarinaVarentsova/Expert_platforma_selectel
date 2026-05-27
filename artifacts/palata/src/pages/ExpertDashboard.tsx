import { useEffect, useState } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";
import { KanbanBoard } from "@/components/KanbanBoard";
import {
  Inbox, Star, User, CheckCircle2, XCircle, MapPin,
  Briefcase, FileText, GraduationCap, ClipboardList,
} from "lucide-react";

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

type MatchState =
  | { kind: "loading" }
  | { kind: "ok"; rows: Match[] }
  | { kind: "error"; message: string };

type ProfileState =
  | { kind: "loading" }
  | { kind: "ok"; profile: ExpertProfile | null }
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
  { id: "proposed",  label: "Новые предложения", accent: "", dotColor: "bg-blue-400",    bgColor: "bg-blue-50/60 border-blue-200",     statuses: ["proposed"] },
  { id: "contacts",  label: "Контакты открыты",  accent: "", dotColor: "bg-cyan-400",    bgColor: "bg-cyan-50/60 border-cyan-200",     statuses: ["contacts_opened"] },
  { id: "cantake",   label: "Могу взять",        accent: "", dotColor: "bg-teal-400",    bgColor: "bg-teal-50/60 border-teal-200",     statuses: ["can_start_from"] },
  { id: "accepted",  label: "В работе",          accent: "", dotColor: "bg-indigo-500",  bgColor: "bg-indigo-50/60 border-indigo-200", statuses: ["accepted", "accepted_work"] },
  { id: "completed", label: "Завершено",         accent: "", dotColor: "bg-emerald-400", bgColor: "bg-emerald-50/60 border-emerald-200", statuses: ["completed"] },
  { id: "declined",  label: "Отказ / не взял",   accent: "", dotColor: "bg-slate-300",   bgColor: "bg-slate-50 border-slate-200",      statuses: ["declined", "withdrawn", "closed_by_other_expert"] },
];

// ─── Main component ──────────────────────────────────────────────────────────

export default function ExpertDashboard() {
  const guard = useRequireRole("expert");
  const [tab, setTab] = useState<"requests" | "profile">("requests");
  const [matchState, setMatchState] = useState<MatchState>({ kind: "loading" });
  const [profileState, setProfileState] = useState<ProfileState>({ kind: "loading" });

  useEffect(() => {
    if (guard.status !== "ok") return;
    const userId = guard.user.id;

    // Fetch matches
    supabase
      .from("palata_request_matches")
      .select(`
        id, request_id, status, matching_round, decline_reason, responded_at,
        palata_requests ( title, expertise_type, region, urgency )
      `)
      .eq("expert_id", userId)
      .order("matching_round", { ascending: true })
      .then(({ data, error }) => {
        if (error) { setMatchState({ kind: "error", message: error.message }); return; }
        setMatchState({ kind: "ok", rows: (data as unknown as Match[]) ?? [] });
      });

    // Fetch expert profile
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
  }, [guard.status]);

  if (guard.status === "loading" || guard.status === "redirecting") {
    return <LoadingScreen />;
  }

  const { user } = guard;

  const activeCount = matchState.kind === "ok"
    ? matchState.rows.filter(r =>
        ["proposed", "contacts_opened", "can_start_from", "accepted", "accepted_work"].includes(r.status)
      ).length
    : null;

  const columns = COLUMNS.map((col) => ({
    ...col,
    items: matchState.kind === "ok"
      ? matchState.rows.filter((r) => col.statuses.includes(r.status))
      : [],
  }));

  return (
    <div className="px-6 py-8 max-w-[1400px]">

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Личный кабинет эксперта</p>
          <h1 className="text-xl font-bold text-slate-900">{user.full_name ?? user.email}</h1>
          <p className="text-xs text-slate-400 mt-0.5">{user.email}</p>
        </div>

        {activeCount != null && activeCount > 0 && (
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2">
            <Star className="w-4 h-4 text-indigo-400" />
            <div>
              <p className="text-[10px] text-indigo-400 uppercase tracking-wide font-semibold">Активных</p>
              <p className="text-xl font-bold text-indigo-700 tabular-nums leading-none">{activeCount}</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <TabButton active={tab === "requests"} onClick={() => setTab("requests")}>
          <ClipboardList className="w-3.5 h-3.5" />
          Мои обращения
        </TabButton>
        <TabButton active={tab === "profile"} onClick={() => setTab("profile")}>
          <User className="w-3.5 h-3.5" />
          Профиль эксперта
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
              renderCard={(m: Match) => <ExpertCard match={m} />}
              emptyText="Нет обращений"
            />
          )}
        </>
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
            <FlagRow
              active={p.accepts_requests}
              label="Принимает заказы"
              activeColor="text-emerald-700 bg-emerald-50"
              inactiveColor="text-slate-500 bg-slate-50"
            />
            <FlagRow
              active={p.business_trip_ready}
              label="Готов к командировкам"
              activeColor="text-teal-700 bg-teal-50"
              inactiveColor="text-slate-500 bg-slate-50"
            />
          </div>
        </div>

        {/* Registry */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Регистрация</p>
          <div className="space-y-3">
            <RegistryRow
              verified={p.palata_registry_verified}
              label="Палата судебных экспертов РФ"
              number={p.palata_registry_number}
            />
            <RegistryRow
              verified={p.centrsudexpert_verified}
              label="Центр судебных экспертиз"
              number={p.centrsudexpert_registry_number}
            />
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
  active: boolean;
  label: string;
  activeColor: string;
  inactiveColor: string;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${active ? activeColor : inactiveColor}`}>
      {active
        ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
        : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

function RegistryRow({ verified, label, number }: {
  verified: boolean;
  label: string;
  number: string | null;
}) {
  return (
    <div className="flex items-start gap-2.5">
      {verified
        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
        : <XCircle className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" />}
      <div>
        <p className={`text-xs font-medium ${verified ? "text-slate-800" : "text-slate-400"}`}>{label}</p>
        {verified && number && (
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">{number}</p>
        )}
        {!verified && (
          <p className="text-[11px] text-slate-400 mt-0.5">Не подтверждено</p>
        )}
      </div>
    </div>
  );
}

// ─── Expert request card ──────────────────────────────────────────────────────

function ExpertCard({ match: m }: { match: Match }) {
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
          Система уведомит вас, когда появится заявка, подходящая под вашу специализацию и регион
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
