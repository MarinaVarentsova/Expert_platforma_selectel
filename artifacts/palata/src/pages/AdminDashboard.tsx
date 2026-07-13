import { useEffect, useState } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { getToken } from "@/lib/authClient";
import { KanbanBoard } from "@/components/KanbanBoard";
import AdminLayout from "@/components/AdminLayout";
import { FileText, Clock, Zap, CheckCircle2, AlertTriangle, TrendingUp, Settings, LayoutDashboard, Timer, ShieldAlert } from "lucide-react";
import { useRequireRole } from "@/lib/useRequireRole";

type Request = {
  id: string;
  title: string;
  status: string;
  expertise_type: string;
  expertise_direction_id: string | null;
  matching_round: number;
  budget_min: number | null;
  budget_max: number | null;
  created_at: string;
};

type State =
  | { kind: "loading" }
  | { kind: "ok"; rows: Request[] }
  | { kind: "error"; message: string };

const COLUMNS = [
  {
    id: "new",
    label: "Новые",
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
    dotColor: "bg-[#0F4C9A]",
    bgColor: "bg-[#F4F4F4] border-[#D0D0D0]",
    accent: "",
    statuses: ["expert_selection"],
  },
  {
    id: "working",
    label: "В работе",
    dotColor: "bg-[#002B5C]",
    bgColor: "bg-[#E9E9E9]/60 border-[#D0D0D0]",
    accent: "",
    statuses: ["in_progress", "in_work"],
  },
  {
    id: "problem",
    label: "Проблемные",
    dotColor: "bg-red-400",
    bgColor: "bg-red-50/60 border-red-200",
    accent: "",
    statuses: ["failed"],
  },
  {
    id: "done",
    label: "Выполненные",
    dotColor: "bg-emerald-400",
    bgColor: "bg-emerald-50/60 border-emerald-200",
    accent: "",
    statuses: ["completed"],
  },
  {
    id: "closed",
    label: "Неактуальные",
    dotColor: "bg-slate-300",
    bgColor: "bg-slate-50 border-slate-200",
    accent: "",
    statuses: ["cancelled"],
  },
];

type Tab = "orders" | "settings" | "certs";

export default function AdminDashboard() {
  const guard = useRequireRole("admin");
  const [activeTab, setActiveTab] = useState<Tab>("orders");
  const [state, setState] = useState<State>({ kind: "loading" });
  const [directionMap, setDirectionMap] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/palata/expertise-directions")
      .then(r => r.json())
      .then(b => {
        const m: Record<string, string> = {};
        for (const d of (b.rows ?? []) as { id: string; name: string }[]) m[d.id] = d.name;
        setDirectionMap(m);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/palata/admin/requests", {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    })
      .then(r => r.json())
      .then((b: { success: boolean; rows?: Request[]; error?: string }) => {
        if (!b.success) { setState({ kind: "error", message: b.error ?? "Ошибка загрузки" }); return; }
        setState({ kind: "ok", rows: b.rows ?? [] });
      })
      .catch(e => setState({ kind: "error", message: String(e) }));
  }, []);

  if (guard.status === "loading" || guard.status === "redirecting") {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="h-5 w-5 rounded-full border-2 border-[#D0D0D0] border-t-[#002B5C] animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  const rows = state.kind === "ok" ? state.rows : [];
  const total = state.kind === "ok" ? rows.length : null;
  const count = (...statuses: string[]) => rows.filter(r => statuses.includes(r.status)).length;
  const columns = COLUMNS.map((col) => ({
    ...col,
    items: state.kind === "ok" ? rows.filter((r) => col.statuses.includes(r.status)) : [],
  }));

  return (
    <AdminLayout>
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-screen-2xl mx-auto">

        {/* ── Tabs ─────────────────────────────────────────────── */}
        <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab("orders")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "orders"
                ? "bg-white text-[#002B5C] shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Заказы
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "settings"
                ? "bg-white text-[#002B5C] shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Settings className="w-4 h-4" />
            Настройки
          </button>
          <button
            onClick={() => setActiveTab("certs")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "certs"
                ? "bg-white text-[#002B5C] shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            Продлить сертификат
          </button>
        </div>

        {/* ── Orders tab ───────────────────────────────────────── */}
        {activeTab === "orders" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
              <KpiCard label="Всего заявок"  value={total ?? "—"}                                     Icon={FileText}      colorClass="kpi-indigo"  loading={state.kind === "loading"} />
              <KpiCard label="Новые"         value={state.kind === "ok" ? count("draft", "new") : "—"} Icon={Clock}         colorClass="kpi-slate"   loading={state.kind === "loading"} />
              <KpiCard label="Идёт подбор"   value={state.kind === "ok" ? count("pending", "matching") : "—"} Icon={Zap}   colorClass="kpi-yellow"  loading={state.kind === "loading"} />
              <KpiCard label="В работе"      value={state.kind === "ok" ? count("in_progress", "in_work") : "—"} Icon={TrendingUp} colorClass="kpi-cyan" loading={state.kind === "loading"} />
              <KpiCard label="Выполнено"     value={state.kind === "ok" ? count("completed") : "—"}   Icon={CheckCircle2}  colorClass="kpi-emerald" loading={state.kind === "loading"} />
              <KpiCard label="Проблемные"    value={state.kind === "ok" ? count("failed") : "—"}      Icon={AlertTriangle} colorClass="kpi-red"     loading={state.kind === "loading"} />
            </div>

            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Канбан-доска заказов</h1>
                <p className="text-xs text-slate-400 mt-0.5">Отслеживайте статус каждого заказа в реальном времени</p>
              </div>
            </div>

            {state.kind === "loading" && (
              <div className="flex items-center gap-3 py-12 text-sm text-slate-400">
                <div className="h-4 w-4 rounded-full border-2 border-[#D0D0D0] border-t-[#002B5C] animate-spin" />
                Загрузка данных…
              </div>
            )}
            {state.kind === "error" && <ErrorCard message={state.message} />}
            {state.kind === "ok" && (
              <KanbanBoard
                columns={columns}
                renderCard={(r: Request) => <AdminCard request={r} directionMap={directionMap} />}
                emptyText="Нет заявок"
              />
            )}
          </>
        )}

        {/* ── Settings tab ─────────────────────────────────────── */}
        {activeTab === "settings" && <SettingsTab />}

        {/* ── Certs tab ────────────────────────────────────────── */}
        {activeTab === "certs" && <CertsTab />}
      </div>
    </AdminLayout>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

type SettingsState =
  | { kind: "loading" }
  | { kind: "ok"; intervalMinutes: number }
  | { kind: "error"; message: string };

type SaveState = "idle" | "saving" | "saved" | "error";

function SettingsTab() {
  const [state, setState] = useState<SettingsState>({ kind: "loading" });
  const [inputValue, setInputValue] = useState<string>("");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    fetch("/api/settings/matching-interval")
      .then(r => r.json())
      .then((data: { intervalMinutes: number }) => {
        setState({ kind: "ok", intervalMinutes: data.intervalMinutes });
        setInputValue(String(data.intervalMinutes));
      })
      .catch(() => setState({ kind: "error", message: "Не удалось загрузить настройки" }));
  }, []);

  async function handleSave() {
    const minutes = parseInt(inputValue, 10);
    if (isNaN(minutes) || minutes < 1 || minutes > 120) return;
    setSaveState("saving");
    try {
      const res = await fetch("/api/settings/matching-interval", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalMinutes: minutes }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Ошибка сохранения");
      }
      const data = await res.json() as { intervalMinutes: number };
      setState({ kind: "ok", intervalMinutes: data.intervalMinutes });
      setInputValue(String(data.intervalMinutes));
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (e: unknown) {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
      console.error(e);
    }
  }

  const currentMinutes = state.kind === "ok" ? state.intervalMinutes : null;
  const inputNum = parseInt(inputValue, 10);
  const isValid = !isNaN(inputNum) && inputNum >= 1 && inputNum <= 120;
  const isDirty = state.kind === "ok" && inputNum !== state.intervalMinutes;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Настройки платформы</h1>
        <p className="text-xs text-slate-400 mt-0.5">Параметры автоматической обработки заказов</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-9 h-9 rounded-xl bg-[#EEF3FB] flex items-center justify-center flex-shrink-0">
            <Timer className="w-5 h-5 text-[#0F4C9A]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Интервал автоподбора экспертов</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Планировщик автоматически запускает подбор для всех заказов в статусе «Идёт подбор».
              {currentMinutes !== null && (
                <> Текущий интервал: <span className="font-medium text-slate-700">{currentMinutes} мин.</span></>
              )}
            </p>
          </div>
        </div>

        {state.kind === "loading" && (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
            <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-200 border-t-slate-500 animate-spin" />
            Загрузка…
          </div>
        )}

        {state.kind === "error" && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{state.message}</p>
        )}

        {state.kind === "ok" && (
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-[180px]">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Интервал (минуты, 1–120)
              </label>
              <input
                type="number"
                min={1}
                max={120}
                value={inputValue}
                onChange={e => { setInputValue(e.target.value); setSaveState("idle"); }}
                className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors
                  ${!isValid && inputValue !== ""
                    ? "border-red-400 bg-red-50 focus:ring-1 focus:ring-red-400"
                    : "border-slate-300 bg-white focus:border-[#0F4C9A] focus:ring-1 focus:ring-[#0F4C9A]/30"
                  }`}
              />
              {!isValid && inputValue !== "" && (
                <p className="text-[11px] text-red-500 mt-1">От 1 до 120 минут</p>
              )}
            </div>

            <button
              onClick={handleSave}
              disabled={!isValid || !isDirty || saveState === "saving"}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${saveState === "saved"
                  ? "bg-emerald-500 text-white"
                  : saveState === "error"
                  ? "bg-red-500 text-white"
                  : (!isValid || !isDirty || saveState === "saving")
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-[#0F4C9A] text-white hover:bg-[#002B5C]"
                }`}
            >
              {saveState === "saving" ? "Сохраняю…"
                : saveState === "saved" ? "✓ Сохранено"
                : saveState === "error" ? "Ошибка"
                : "Сохранить"}
            </button>
          </div>
        )}

        <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
          После сохранения планировщик перезапускается с новым интервалом немедленно.
          Значение сохраняется в базе данных и восстанавливается при перезапуске сервера (если таблица <code className="font-mono bg-slate-100 px-1 rounded">palata_settings</code> создана).
        </p>
      </div>
    </div>
  );
}

// ─── Certs Tab ────────────────────────────────────────────────────────────────

type ExpiringCert = {
  id: string;
  expert_id: string;
  certificate_number: string | null;
  cert_valid_to: string;
  cert_direction_ids: string[];
  expert_name: string | null;
  expert_email: string;
  expert_phone: string | null;
  direction_names: string;
  days_left: number;
};

type CertsState =
  | { kind: "loading" }
  | { kind: "ok"; rows: ExpiringCert[] }
  | { kind: "error"; message: string };

const CERT_SITE_URL = "https://xn--80aaaio3ae2acfmjkg3n.xn--p1ai/";
const LOOK_AHEAD_DAYS = 30;

function CertsTab() {
  const [state, setState] = useState<CertsState>({ kind: "loading" });
  const [dirMap, setDirMap] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const ahead = new Date(today);
      ahead.setDate(ahead.getDate() + LOOK_AHEAD_DAYS);
      const aheadStr = ahead.toISOString().slice(0, 10);

      const [certsRes, dirsRes] = await Promise.all([
        (() => {
          const _cp = new URLSearchParams({ status: "verified", valid_from: todayStr, valid_to: aheadStr });
          return fetch(`/api/palata/expert-certificate?${_cp}`)
            .then(r => r.json())
            .then(b => ({ data: b.rows ?? null, error: null as { message: string } | null }))
            .catch(err => ({ data: null as null, error: { message: String(err) } }));
        })(),
        fetch("/api/palata/expertise-directions")
          .then(r => r.json())
          .then(b => ({ data: (b.rows ?? []) as { id: string; name: string }[], error: null as { message: string } | null }))
          .catch(err => ({ data: [] as { id: string; name: string }[], error: { message: String(err) } })),
      ]);

      if (certsRes.error) { setState({ kind: "error", message: certsRes.error.message }); return; }

      const dm: Record<string, string> = {};
      for (const d of (dirsRes.data ?? []) as { id: string; name: string }[]) dm[d.id] = d.name;
      setDirMap(dm);

      const certs = (certsRes.data ?? []) as {
        id: string;
        expert_id: string;
        certificate_number: string | null;
        cert_valid_to: string;
        cert_direction_ids: string[];
      }[];

      if (certs.length === 0) { setState({ kind: "ok", rows: [] }); return; }

      const expertIds = [...new Set(certs.map(c => c.expert_id))];
      const { data: users } = await supabase
        .from("palata_users")
        .select("id, full_name, email, phone")
        .in("id", expertIds);

      const usersMap: Record<string, { full_name: string | null; email: string; phone: string | null }> =
        Object.fromEntries(
          ((users ?? []) as { id: string; full_name: string | null; email: string; phone: string | null }[])
            .map(u => [u.id, u]),
        );

      const rows: ExpiringCert[] = certs.map(c => {
        const u = usersMap[c.expert_id];
        const daysLeft = Math.ceil(
          (new Date(c.cert_valid_to).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        return {
          ...c,
          expert_name: u?.full_name ?? null,
          expert_email: u?.email ?? "—",
          expert_phone: u?.phone ?? null,
          direction_names: (c.cert_direction_ids ?? []).map((id: string) => dm[id] ?? id).join(", "),
          days_left: daysLeft,
        };
      });

      setState({ kind: "ok", rows });
    }
    load().catch(e => setState({ kind: "error", message: (e as Error).message }));
  }, []);

  const urgent = state.kind === "ok" ? state.rows.filter(r => r.days_left <= 7) : [];
  const soon   = state.kind === "ok" ? state.rows.filter(r => r.days_left > 7) : [];

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Продление сертификатов</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Сертификаты, истекающие в ближайшие {LOOK_AHEAD_DAYS} дней. Система уведомляет экспертов автоматически в 9:00 МСК при сроке ≤ 7 дней.
        </p>
      </div>

      {state.kind === "loading" && (
        <div className="flex items-center gap-3 py-12 text-sm text-slate-400">
          <div className="h-4 w-4 rounded-full border-2 border-[#D0D0D0] border-t-[#002B5C] animate-spin" />
          Загрузка…
        </div>
      )}

      {state.kind === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{state.message}</p>
        </div>
      )}

      {state.kind === "ok" && state.rows.length === 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-10 text-center">
          <ShieldAlert className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-emerald-800">Нет сертификатов с истекающим сроком</p>
          <p className="text-xs text-emerald-600 mt-1">В ближайшие {LOOK_AHEAD_DAYS} дней все сертификаты действительны</p>
        </div>
      )}

      {state.kind === "ok" && state.rows.length > 0 && (
        <div className="space-y-6">
          {urgent.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                <h2 className="text-sm font-semibold text-red-700">Истекают в течение 7 дней ({urgent.length})</h2>
              </div>
              <CertsTable rows={urgent} />
            </section>
          )}
          {soon.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                <h2 className="text-sm font-semibold text-amber-700">Истекают от 8 до {LOOK_AHEAD_DAYS} дней ({soon.length})</h2>
              </div>
              <CertsTable rows={soon} />
            </section>
          )}

          <p className="text-xs text-slate-400">
            Продление сертификатов:{" "}
            <a href={CERT_SITE_URL} target="_blank" rel="noreferrer" className="text-[#0F4C9A] underline underline-offset-2">
              {CERT_SITE_URL}
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

function CertsTable({ rows }: { rows: ExpiringCert[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Эксперт</th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Контакты</th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">№ сертификата</th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Направление</th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Истекает</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map(r => (
            <tr key={r.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                {r.expert_name ?? <span className="text-slate-400 italic">Без имени</span>}
              </td>
              <td className="px-4 py-3 text-slate-600">
                <div>{r.expert_email}</div>
                {r.expert_phone && <div className="text-slate-400">{r.expert_phone}</div>}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                {r.certificate_number ?? <span className="text-slate-400">—</span>}
              </td>
              <td className="px-4 py-3 text-slate-600 max-w-[260px]">
                <span className="line-clamp-2 text-xs">{r.direction_names || "—"}</span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold ${
                  r.days_left <= 3
                    ? "bg-red-100 text-red-700"
                    : r.days_left <= 7
                    ? "bg-orange-100 text-orange-700"
                    : "bg-amber-50 text-amber-700"
                }`}>
                  {new Date(r.cert_valid_to).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" })}
                  <span className="opacity-70">· {r.days_left} дн.</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function KpiCard({
  label, value, Icon, colorClass, loading,
}: {
  label: string;
  value: number | string;
  Icon: React.ElementType;
  colorClass: string;
  loading: boolean;
}) {
  return (
    <div className={`kpi-card ${colorClass}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] font-medium text-slate-500 leading-tight">{label}</p>
        <Icon className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
      </div>
      {loading ? (
        <div className="h-7 w-12 bg-slate-100 rounded animate-pulse mt-1" />
      ) : (
        <p className="text-2xl font-bold text-slate-900 tabular-nums">
          {typeof value === "number" ? value.toLocaleString("ru-RU") : value}
        </p>
      )}
    </div>
  );
}

function AdminCard({ request: r, directionMap }: { request: Request; directionMap: Record<string, string> }) {
  const urgency =
    r.status === "failed" || r.status === "matching"
      ? "border-l-red-400"
      : r.status === "pending"
      ? "border-l-amber-400"
      : r.status === "completed"
      ? "border-l-emerald-400"
      : r.status === "in_progress" || r.status === "in_work"
      ? "border-l-[#0F4C9A]"
      : "border-l-slate-200";

  const dirName =
    (r.expertise_direction_id && directionMap[r.expertise_direction_id])
      ? directionMap[r.expertise_direction_id]
      : r.expertise_type || null;

  return (
    <Link href={`/requests/${r.id}`}>
      <div className={`bg-white rounded-xl border border-slate-100 border-l-[3px] ${urgency} p-3.5 hover:shadow-md hover:border-[#D0D0D0] hover:border-l-[#0F4C9A] transition-all cursor-pointer group shadow-sm`}>
        <p className="text-xs font-semibold text-slate-800 leading-snug mb-2.5 line-clamp-2 group-hover:text-[#002B5C] transition-colors">
          {r.title}
        </p>
        <div className="space-y-1 mb-3">
          {dirName && (
            <p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
              <span className="inline-block h-1 w-1 rounded-full bg-[#666666] flex-shrink-0" />
              {dirName}
            </p>
          )}
          {(r.budget_min != null || r.budget_max != null) && (
            <p className="text-[11px] text-slate-400">
              {r.budget_min?.toLocaleString("ru-RU") ?? "—"} – {r.budget_max?.toLocaleString("ru-RU") ?? "—"} ₽
            </p>
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

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 max-w-xl">
      <p className="text-sm font-semibold text-red-700 mb-1">Ошибка Supabase</p>
      <p className="text-xs text-red-600 font-mono">{message}</p>
    </div>
  );
}
