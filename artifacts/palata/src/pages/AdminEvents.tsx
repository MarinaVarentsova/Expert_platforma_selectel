import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { fetchUsers } from "@/lib/users";
import AdminLayout from "@/components/AdminLayout";
import { useRequireRole } from "@/lib/useRequireRole";
import { RefreshCw } from "lucide-react";

type Row = {
  id: string;
  entity_type: string;
  entity_id: string;
  old_status: string | null;
  new_status: string;
  actor_id: string | null;
  note: string | null;
  created_at: string;
};

type Enriched = Row & {
  actor_name: string | null;
  request_title: string | null;
};

function fmt(dt: string) {
  return new Date(dt).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminEvents() {
  const guard = useRequireRole("admin");

  const [rows, setRows]       = useState<Enriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [total, setTotal]     = useState<number | null>(null);

  const [fStatus,  setFStatus]  = useState("");
  const [fRequest, setFRequest] = useState("");
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo,   setFDateTo]   = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);

    let q = supabase
      .from("palata_status_events")
      .select("id, entity_type, entity_id, old_status, new_status, actor_id, note, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(300);

    if (fStatus)   q = q.eq("new_status", fStatus);
    if (fRequest)  q = q.ilike("entity_id", `${fRequest}%`);
    if (fDateFrom) q = q.gte("created_at", new Date(fDateFrom).toISOString());
    if (fDateTo)   q = q.lte("created_at", new Date(fDateTo + "T23:59:59").toISOString());

    const { data, error: err, count } = await q;
    if (err) { setError(err.message); setLoading(false); return; }

    const items = (data ?? []) as Row[];
    setTotal(count ?? items.length);

    const actorIds   = [...new Set(items.map(r => r.actor_id).filter(Boolean))] as string[];
    const requestIds = [...new Set(items.filter(r => r.entity_type === "request").map(r => r.entity_id))];

    const [uRes, rRes] = await Promise.all([
      actorIds.length
        ? fetchUsers(actorIds).then(rows => ({ data: rows, error: null }))
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
      actor_name:    r.actor_id ? (uMap[r.actor_id] ?? null) : null,
      request_title: r.entity_type === "request" ? (rMap[r.entity_id] ?? null) : null,
    })));
    setLoading(false);
  }, [fStatus, fRequest, fDateFrom, fDateTo]);

  useEffect(() => {
    if (guard.status === "ok") load();
  }, [guard.status, load]);

  if (guard.status === "loading" || guard.status === "redirecting") {
    return <AdminLayout><Spinner /></AdminLayout>;
  }

  const statuses = ["new", "matching", "expert_selection", "in_work", "completed", "cancelled", "failed"];

  return (
    <AdminLayout>
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-screen-2xl mx-auto">

        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">События</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {total != null ? `${total} записей` : "Загрузка…"} · palata_status_events
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
          <select
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30"
            value={fStatus}
            onChange={e => setFStatus(e.target.value)}
          >
            <option value="">Все статусы (new_status)</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30 w-48"
            placeholder="Начало request_id…"
            value={fRequest}
            onChange={e => setFRequest(e.target.value)}
          />
          <input
            type="date"
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30"
            value={fDateFrom}
            onChange={e => setFDateFrom(e.target.value)}
          />
          <span className="text-xs text-slate-400 self-center">—</span>
          <input
            type="date"
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30"
            value={fDateTo}
            onChange={e => setFDateTo(e.target.value)}
          />
          <button
            onClick={load}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#0F4C9A] text-white hover:bg-[#003a7a] transition-colors"
          >
            Применить
          </button>
          {(fStatus || fRequest || fDateFrom || fDateTo) && (
            <button
              onClick={() => { setFStatus(""); setFRequest(""); setFDateFrom(""); setFDateTo(""); }}
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
                  {["Дата", "Заказ", "Событие", "Кто", "Комментарий"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">Нет данных</td></tr>
                )}
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{fmt(r.created_at)}</td>
                    <td className="px-3 py-2 max-w-[200px]">
                      {r.entity_type === "request" ? (
                        <Link href={`/requests/${r.entity_id}`}>
                          <span className="text-[#0F4C9A] hover:text-[#002B5C] cursor-pointer truncate block">
                            {r.request_title ?? r.entity_id.slice(0, 8) + "…"}
                          </span>
                        </Link>
                      ) : (
                        <span className="font-mono text-slate-400">{r.entity_id.slice(0, 8)}…</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.old_status ? (
                        <span className="flex items-center gap-1">
                          <span className="bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{r.old_status}</span>
                          <span className="text-slate-300">→</span>
                          <span className="bg-emerald-50 text-emerald-700 rounded px-1.5 py-0.5">{r.new_status}</span>
                        </span>
                      ) : (
                        <span className="bg-emerald-50 text-emerald-700 rounded px-1.5 py-0.5">{r.new_status}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600 max-w-[140px] truncate">
                      {r.actor_name ?? <span className="text-slate-300 italic">система</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-500 max-w-[300px] truncate">
                      {r.note ?? "—"}
                    </td>
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
