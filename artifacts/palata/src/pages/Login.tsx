export default function Login() {
  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Вход в систему</p>
          <h1 className="text-2xl font-bold text-slate-900">Добро пожаловать</h1>
          <p className="text-sm text-slate-500 mt-1">
            Авторизация будет добавлена на следующем этапе разработки.
          </p>
        </div>
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <p className="text-sm text-slate-400">Форма входа (Supabase Auth)</p>
        </div>
      </div>
    </div>
  );
}
