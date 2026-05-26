import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Request = {
  id: string;
  title: string;
  status: string;
  expertise_type: string;
  region: string;
  matching_round: number;
  created_at: string;
};

type ConnectionState =
  | { status: 'loading' }
  | { status: 'ok'; rows: Request[]; count: number }
  | { status: 'error'; message: string; details?: string };

export default function ConnectionCheck() {
  const [state, setState] = useState<ConnectionState>({ status: 'loading' });
  const [supabaseUrl] = useState(() => import.meta.env.VITE_SUPABASE_URL as string);

  useEffect(() => {
    async function check() {
      console.log('[Supabase] URL:', supabaseUrl);
      console.log('[Supabase] Key set:', !!import.meta.env.VITE_SUPABASE_ANON_KEY);

      const { data, error, count } = await supabase
        .from('palata_requests')
        .select('id, title, status, expertise_type, region, matching_round, created_at', { count: 'exact' })
        .limit(10);

      if (error) {
        console.error('[Supabase] Error:', JSON.stringify(error, null, 2));
        setState({ status: 'error', message: error.message, details: `code: ${error.code}` });
        return;
      }

      console.log('[Supabase] OK. Rows:', data?.length, 'Total:', count);
      setState({ status: 'ok', rows: (data as Request[]) ?? [], count: count ?? 0 });
    }

    check();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">
          Палата судебных экспертов
        </h1>
        <p className="text-xs text-slate-400 mb-8 font-mono">{supabaseUrl || '(VITE_SUPABASE_URL not set)'}</p>

        {state.status === 'loading' && (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-slate-500 text-sm">
            Подключаемся к Supabase…
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
                <p className="text-sm font-semibold text-green-800">Supabase подключён</p>
                <p className="text-xs text-green-700">
                  Таблица <code className="font-mono">palata_requests</code> доступна · всего записей: <strong>{state.count}</strong>
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  palata_requests — первые {state.rows.length} записей
                </p>
              </div>
              {state.rows.length === 0 ? (
                <p className="p-4 text-sm text-slate-400">Нет данных. Запустите seed-миграцию.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-4 py-2 font-medium">Заголовок</th>
                      <th className="text-left px-4 py-2 font-medium">Статус</th>
                      <th className="text-left px-4 py-2 font-medium">Вид</th>
                      <th className="text-left px-4 py-2 font-medium">Регион</th>
                      <th className="text-right px-4 py-2 font-medium">Раунд</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.rows.map((r) => (
                      <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2 text-slate-800 max-w-[240px] truncate">{r.title}</td>
                        <td className="px-4 py-2">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-4 py-2 text-slate-600 max-w-[160px] truncate">{r.expertise_type}</td>
                        <td className="px-4 py-2 text-slate-600">{r.region}</td>
                        <td className="px-4 py-2 text-right text-slate-500">{r.matching_round}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Структура проекта</p>
              <pre className="text-xs text-slate-600 leading-relaxed">{`src/
├── lib/
│   └── supabaseClient.ts   ← Supabase client
├── pages/
│   └── ConnectionCheck.tsx ← эта страница
├── components/             ← общие UI-компоненты
├── features/
│   ├── customer/           ← логика заказчика
│   ├── expert/             ← логика эксперта
│   └── admin/              ← логика администратора
└── App.tsx`}</pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft:       'bg-slate-100 text-slate-600',
    pending:     'bg-yellow-100 text-yellow-700',
    matching:    'bg-blue-100 text-blue-700',
    in_progress: 'bg-indigo-100 text-indigo-700',
    completed:   'bg-green-100 text-green-700',
    cancelled:   'bg-red-100 text-red-600',
    failed:      'bg-red-100 text-red-600',
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {status}
    </span>
  );
}
