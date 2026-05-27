import { useEffect, useState } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";
import { KanbanBoard } from "@/components/KanbanBoard";
import {
  PlusCircle, FileText, User, MapPin, Building2,
  Phone, Mail, ClipboardList, Hash,
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

type RequestState =
  | { kind: "loading" }
  | { kind: "ok"; rows: Request[] }
  | { kind: "error"; message: string };

type ProfileState =
  | { kind: "loading" }
  | { kind: "ok"; profile: CustomerProfile | null }
  | { kind: "error"; message: string };

// ─── Kanban columns ───────────────────────────────────────────────────────────

const COLUMNS = [
  {
    id: "new",
    label: "Новый",
    dotColor: "bg-slate-400",
    bgColor: "bg-white border-slate-200",
    accent: "",
    statuses: ["draft", "new"],
  },
  {
    id: "pending",
    label: "Идёт подбор",
    dotColor: "bg-amber-400",
    bgColor: "bg-amber-50/60 border-amber-200",
    accent: "",
    statuses: ["pending", "matching"],
  },
  {
    id: "matching",
    label: "Выбор эксперта",
    dotColor: "bg-cyan-400",
    bgColor: "bg-cyan-50/60 border-cyan-200",
    accent: "",
    statuses: ["expert_selection"],
  },
  {
    id: "working",
    label: "В работе",
    dotColor: "bg-indigo-500",
    bgColor: "bg-indigo-50/60 border-indigo-200",
    accent: "",
    statuses: ["in_progress", "in_work"],
  },
  {
    id: "done",
    label: "Выполнен",
    dotColor: "bg-emerald-400",
    bgColor: "bg-emerald-50/60 border-emerald-200",
    accent: "",
    statuses: ["completed"],
  },
  {
    id: "closed",
    label: "Неактуален",
    dotColor: "bg-slate-300",
    bgColor: "bg-slate-50 border-slate-200",
    accent: "",
    statuses: ["cancelled", "failed", "declined"],
  },
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
  const [tab, setTab] = useState<"requests" | "profile">("requests");
  const [requestState, setRequestState] = useState<RequestState>({ kind: "loading" });
  const [profileState, setProfileState] = useState<ProfileState>({ kind: "loading" });

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
              renderCard={(r: Request) => <CustomerCard request={r} />}
              emptyText="Нет заказов"
            />
          )}
        </>
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
            {/* Company */}
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

            {/* Notes */}
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

function CustomerCard({ request: r }: { request: Request }) {
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
