import { useEffect, useState } from 'react';

type Request = {
  id: string;
  title: string;
  status: string;
  sort_order?: number;
  is_active?: boolean;
};

type ConnectionState =
  | { status: 'loading' }
  | { status: 'ok'; rows: Request[]; count: number }
  | { status: 'error'; message: string; details?: string };

export default function ConnectionCheck() {
  const [state, setState] = useState<ConnectionState>({ status: 'loading' });

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/palata/expertise-directions');
        if (!res.ok) {
          setState({ status: 'error', message: `HTTP ${res.status}`, details: `Backend returned ${res.status}` });
          return;
        }
        const body = await res.json();
        const rows = (body.rows ?? []) as Request[];
        setState({ status: 'ok', rows, count: rows.length });
      } catch (err) {
        setState({ status: 'error', message: String(err) });
      }
    }
    check();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">
          Палата судебных экспертов
        </h1>
        <p className="text-xs text-slate-400 mb-8 font-mono">Backend API connectivity check</p>

        {state.status === 'loading' && (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-slate-500 text-sm">
            Подключаемся к backend API…
          </div>
        )}

        {state.status === 'error' && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6">
            <p className="text-sm font-semibold text-red-700 mb-1">Ошибка подключения</p>
            <p className="text-xs text-red-600 mb-2">{state.message}</p>
            {state.details && (
              <pre className="text-xs text-red-500 whitespace-pre-wrap">{state.details}</pre>
            )}
          </div>
        )}

        {state.status === 'ok' && (
          <>
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 mb-6 flex items-center gap-3">
              <span className="text-green-600 text-lg">✓</span>
              <div>
                <p className="text-sm font-semibold text-green-800">Backend API подключён</p>
                <p className="text-xs text-green-700">
                  Таблица <code className="font-mono">palata_expertise_directions</code> доступна · записей: <strong>{state.count}</strong>
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  palata_expertise_directions — {state.rows.length} записей
                </p>
              </div>
              {state.rows.length === 0 ? (
                <p className="p-4 text-sm text-slate-400">Нет данных.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-4 py-2 font-medium">Направление</th>
                      <th className="text-left px-4 py-2 font-medium">ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.rows.map((r) => (
                      <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2 text-slate-800">{r.title ?? (r as unknown as { name?: string }).name}</td>
                        <td className="px-4 py-2 text-slate-400 font-mono text-xs">{r.id.slice(0, 8)}…</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
