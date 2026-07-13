import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdminLayout from "@/components/AdminLayout";
import { useRequireRole } from "@/lib/useRequireRole";
import { RefreshCw } from "lucide-react";

type Row = {
  id: string;
  recipient_id: string | null;
  email_address: string;
  template_name: string;
  subject: string | null;
  context: Record<string, unknown> | null;
  sent_at: string;
  delivered_at: string | null;
  opened_at: string | null;
  error: string | null;
};

type Enriched = Row & {
  recipient_name: string | null;
  request_id: string | null;
  request_title: string | null;
};

function fmt(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminEmailEvents() {
  const guard = useRequireRole("admin");

  const [rows, setRows]       = useState<Enriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [total, setTotal]     = useState<number | null>(null);

  const [fTemplate,   setFTemplate]   = useState("");
  const [fMode,       setFMode]       = useState("");
  const [fRecipient,  setFRecipient]  = useState("");
  const [fRequest,    setFRequest]    = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";

    const params = new URLSearchParams();
    if (fTemplate)  params.set("template", fTemplate);
    if (fMode)      params.set("mode", fMode);
    if (fRecipient) params.set("recipient", fRecipient);

    let fetchRes: { success: boolean; rows?: Row[]; total?: number; error?: string };
    try {
      fetchRes = await fetch(`/api/palata/email-events?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json());
    } catch {
      setError("Ошибка загрузки"); setLoading(false); return;
    }
    if (!fetchRes.success) { setError(fetchRes.error ?? "Ошибка запроса"); setLoading(false); return; }

    const items = (fetchRes.rows ?? []) as Row[];
    setTotal(fetchRes.total ?? items.length);

    const recipientIds = [...new Set(items.map(r => r.recipient_id).filter(Boolean))] as string[];

    const allRequestIds = new Set<string>();
    items.forEach(r => {
      const ctx = r.context;
      if (ctx?.request_id && typeof ctx.request_id === "string") allRequestIds.add(ctx.request_id);
    });
    const requestIds = [...allRequestIds];

    const [uRes, rRes] = await Promise.all([
      recipientIds.length
        ? supabase.from("palata_users").select("id, full_name, email").in("id", recipientIds)
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

    let filteredItems = items;
    if (fRequest) {
      filteredItems = items.filter(r => {
        const rid = r.context?.request_id as string | undefined;
        return rid?.startsWith(fRequest) || rMap[rid ?? ""]?.toLowerCase().includes(fRequest.toLowerCase());
      });
    }

    setRows(filteredItems.map(r => {
      const reqId = r.context?.request_id as string | undefined;
      return {
        ...r,
        recipient_name: r.recipient_id ? (uMap[r.recipient_id] ?? null) : null,
        request_id:     reqId ?? null,
        request_title:  reqId ? (rMap[reqId] ?? null) : null,
      };
    }));
    setLoading(false);
  }, [fTemplate, fMode, fRecipient, fRequest]);

  useEffect(() => {
    if (guard.status === "ok") load();
  }, [guard.status, load]);

  if (guard.status === "loading" || guard.status === "redirecting") {
    return <AdminLayout><Spinner /></AdminLayout>;
  }

  const TEMPLATES = [
    "you_are_approved_for_work", "expert_started_work", "expert_completed_order",
    "customer_rated_expert", "customer_selected_you", "expert_declined",
    "expert_can_start_from", "order_completed_rate_expert", "order_completed_rate_customer",
    "request_completed", "request_cancelled",
  ];

  return (
    <AdminLayout>
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-screen-2xl mx-auto">

        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Email Events</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {total != null ? `${total} записей` : "Загрузка…"} · palata_email_events
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
            value={fTemplate}
            onChange={e => setFTemplate(e.target.value)}
          >
            <option value="">Все шаблоны (email_type)</option>
            {TEMPLATES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30"
            value={fMode}
            onChange={e => setFMode(e.target.value)}
          >
            <option value="">Test + Real</option>
            <option value="test">Только TEST</option>
            <option value="real">Только Real</option>
          </select>
          <input
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30 w-44"
            placeholder="Email получателя…"
            value={fRecipient}
            onChange={e => setFRecipient(e.target.value)}
          />
          <input
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30 w-44"
            placeholder="Поиск по заказу…"
            value={fRequest}
            onChange={e => setFRequest(e.target.value)}
          />
          <button
            onClick={load}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#0F4C9A] text-white hover:bg-[#003a7a] transition-colors"
          >
            Применить
          </button>
          {(fTemplate || fMode || fRecipient || fRequest) && (
            <button
              onClick={() => { setFTemplate(""); setFMode(""); setFRecipient(""); setFRequest(""); }}
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
                  {["Дата", "Заказ", "Получатель", "Email", "Email type (template)", "Режим", "Тема"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Нет данных</td></tr>
                )}
                {rows.map(r => {
                  const isTest = r.error === "TEST_MODE";
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{fmt(r.sent_at)}</td>
                      <td className="px-3 py-2 max-w-[180px]">
                        {r.request_id ? (
                          <a href={`/requests/${r.request_id}`} className="text-[#0F4C9A] hover:text-[#002B5C] truncate block">
                            {r.request_title ?? r.request_id.slice(0, 8) + "…"}
                          </a>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-700 max-w-[140px] truncate">
                        {r.recipient_name ?? <span className="font-mono text-slate-400">{r.recipient_id?.slice(0, 8) ?? "—"}</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-500 max-w-[180px] truncate">{r.email_address}</td>
                      <td className="px-3 py-2">
                        <span className="inline-block bg-slate-100 text-slate-700 rounded px-1.5 py-0.5 font-mono text-[10px]">
                          {r.template_name}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {isTest ? (
                          <span className="inline-block bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 text-[10px] font-semibold">TEST</span>
                        ) : (
                          <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5 text-[10px] font-semibold">REAL</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-500 max-w-[220px] truncate">{r.subject ?? "—"}</td>
                    </tr>
                  );
                })}
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
