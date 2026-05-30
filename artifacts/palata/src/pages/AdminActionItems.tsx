import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import AdminLayout from "@/components/AdminLayout";
import { useRequireRole } from "@/lib/useRequireRole";
import { RefreshCw } from "lucide-react";

type Row = {
  id: string;
  request_id: string;
  assigned_to_user_id: string;
  assigned_role: string;
  action_type: string;
  title: string;
  status: string;
  is_read: boolean;
  is_resolved: boolean;
  created_at: string;
  resolved_at: string | null;
};

type Enriched = Row & {
  user_name: string | null;
  request_title: string | null;
};

const STATUS_OPTS = ["", "open", "read", "resolved", "cancelled"];
const ROLE_OPTS   = ["", "customer", "expert", "admin"];
const TYPE_OPTS   = [
  "", "experts_matched", "expert_declined", "expert_can_start_from",
  "expert_completed_order", "expert_started_work", "customer_selected_you",
  "customer_approved_start_date", "choose_another_expert",
  "you_are_approved_for_work", "manual_matching_required",
];

const STATUS_CLS: Record<string, string> = {
  open:      "bg-amber-50 text-amber-700 border-amber-200",
  read:      "bg-[#F4F4F4] text-[#002B5C] border-[#D0D0D0]",
  resolved:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
};

const ROLE_CLS: Record<string, string> = {
  customer: "bg-[#F4F4F4] text-[#002B5C]",
  expert:   "bg-[#D0D0D0] text-[#002B5C]",
  admin:    "bg-rose-50 text-rose-700",
};

function fmt(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminActionItems() {
  const guard = useRequireRole("admin");

  const [rows, setRows]       = useState<Enriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [total, setTotal]     = useState<number | null>(null);

  const [fStatus,  setFStatus]  = useState("");
  const [fRole,    setFRole]    = useState("");
  const [fType,    setFType]    = useState("");
  const [fRequest, setFRequest] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);

    let q = supabase
      .from("palata_action_items")
      .select("id, request_id, assigned_to_user_id, assigned_role, action_type, title, status, is_read, is_resolved, created_at, resolved_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(200);

    if (fStatus)  q = q.eq("status", fStatus);
    if (fRole)    q = q.eq("assigned_role", fRole);
    if (fType)    q = q.eq("action_type", fType);
    if (fRequest) q = q.ilike("request_id", `${fRequest}%`);

    const { data, error: err, count } = await q;
    if (err) { setError(err.message); setLoading(false); return; }

    const items = (data ?? []) as Row[];
    setTotal(count ?? items.length);

    const userIds    = [...new Set(items.map(r => r.assigned_to_user_id).filter(Boolean))];
    const requestIds = [...new Set(items.map(r => r.request_id).filter(Boolean))];

    const [uRes, rRes] = await Promise.all([
      userIds.length
        ? supabase.from("palata_users").select("id, full_name, email").in("id", userIds)
        : Promise.resolve({ data: [] }),
      requestIds.length
        ? supabase.from("palata_requests").select("id, title").in("id", requestIds)
        : Promise.resolve({ data: [] }),
    ]);

    const uMap = Object.fromEntries(
      ((uRes.data ?? []) as { id: string; full_name: string | null; email: string }[])
        .map(u => [u.id, u.full_name ?? u.email ?? u.id])
    );
    const rMap = Object.fromEntries(
      ((rRes.data ?? []) as { id: string; title: string }[])
        .map(r => [r.id, r.title])
    );

    setRows(items.map(r => ({
      ...r,
      user_name:     uMap[r.assigned_to_user_id] ?? null,
      request_title: rMap[r.request_id] ?? null,
    })));
    setLoading(false);
  }, [fStatus, fRole, fType, fRequest]);

  useEffect(() => {
    if (guard.status === "ok") load();
  }, [guard.status, load]);

  if (guard.status === "loading" || guard.status === "redirecting") {
    return <AdminLayout><Spinner /></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-screen-2xl mx-auto">

        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Action Items</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {total != null ? `${total} записей` : "Загрузка…"}
            </p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Обновить
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-5">
          <Select value={fStatus} onChange={setFStatus} opts={STATUS_OPTS} placeholder="Все статусы" />
          <Select value={fRole}   onChange={setFRole}   opts={ROLE_OPTS}   placeholder="Все роли" />
          <Select value={fType}   onChange={setFType}   opts={TYPE_OPTS}   placeholder="Все типы" />
          <input
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30 w-48"
            placeholder="Начало request_id…"
            value={fRequest}
            onChange={e => setFRequest(e.target.value)}
          />
          <button
            onClick={load}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#0F4C9A] text-white hover:bg-[#003a7a] transition-colors"
          >
            Применить
          </button>
          {(fStatus || fRole || fType || fRequest) && (
            <button
              onClick={() => { setFStatus(""); setFRole(""); setFType(""); setFRequest(""); }}
              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              Сбросить
            </button>
          )}
        </div>

        {error && <ErrorBox msg={error} />}
        {loading && <Spinner />}

        {!loading && !error && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["ID", "Тип действия", "Заказ", "Назначен", "Роль", "Статус", "Прочитано", "Решено", "Создан", "Решён"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 && (
                  <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">Нет данных</td></tr>
                )}
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-400">{r.id.slice(0, 8)}…</td>
                    <td className="px-3 py-2">
                      <span className="inline-block bg-slate-100 text-slate-700 rounded px-1.5 py-0.5 font-mono text-[10px]">
                        {r.action_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 max-w-[180px]">
                      <Link href={`/requests/${r.request_id}`}>
                        <span className="text-[#0F4C9A] hover:text-[#002B5C] cursor-pointer truncate block">
                          {r.request_title ?? r.request_id.slice(0, 8) + "…"}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 max-w-[140px] truncate text-slate-700">
                      {r.user_name ?? r.assigned_to_user_id.slice(0, 8) + "…"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_CLS[r.assigned_role] ?? "bg-slate-100 text-slate-500"}`}>
                        {r.assigned_role}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLS[r.status] ?? "bg-slate-100 text-slate-500"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">{r.is_read ? "✓" : "—"}</td>
                    <td className="px-3 py-2 text-center">{r.is_resolved ? "✓" : "—"}</td>
                    <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{fmt(r.created_at)}</td>
                    <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{fmt(r.resolved_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function Select({ value, onChange, opts, placeholder }: {
  value: string; onChange: (v: string) => void; opts: string[]; placeholder: string;
}) {
  return (
    <select
      className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {opts.filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Spinner() {
  return (
    <div className="flex items-center gap-3 py-12 text-sm text-slate-400">
      <div className="h-4 w-4 rounded-full border-2 border-[#D0D0D0] border-t-[#002B5C] animate-spin" />
      Загрузка…
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 mb-4 max-w-xl">
      <p className="text-sm font-semibold text-red-700 mb-1">Ошибка</p>
      <p className="text-xs text-red-600 font-mono">{msg}</p>
    </div>
  );
}
