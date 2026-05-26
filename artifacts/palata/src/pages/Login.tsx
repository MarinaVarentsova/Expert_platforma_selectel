import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Scale, Eye, EyeOff, LogIn } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import type { PalataRole } from "@/lib/authContext";

const ROLE_DESTINATIONS: Record<PalataRole, string> = {
  customer: "/customer",
  expert: "/expert",
  admin: "/admin",
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { state, signIn } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (state.kind === "authenticated") {
      navigate(ROLE_DESTINATIONS[state.user.role] ?? "/");
    }
  }, [state, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setError(null);
    setSubmitting(true);

    const { error: authError } = await signIn(email.trim(), password);

    if (authError) {
      setSubmitting(false);
      setError(translateError(authError));
    }
  }

  if (state.kind === "loading") {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <div className="h-5 w-5 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm">

        {/* Brand mark */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200 mb-4">
            <Scale className="w-6 h-6 text-white" strokeWidth={2} />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Вход в систему</h1>
          <p className="text-sm text-slate-500 mt-1 text-center">
            Палата судебных экспертов
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Пароль
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 pr-10 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
                >
                  {showPassword
                    ? <EyeOff className="w-4 h-4" />
                    : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3">
                <p className="text-xs text-red-600 font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !email || !password}
              className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-all shadow-sm"
            >
              {submitting ? (
                <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {submitting ? "Вход…" : "Войти"}
            </button>
          </form>
        </div>

        {/* Role hint */}
        <div className="mt-4 bg-slate-50 rounded-xl border border-slate-100 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
            После входа вы будете перенаправлены
          </p>
          <div className="space-y-1 text-xs text-slate-500">
            <p><span className="text-indigo-600 font-medium">Заказчик</span> → Личный кабинет заказчика</p>
            <p><span className="text-emerald-600 font-medium">Эксперт</span> → Личный кабинет эксперта</p>
            <p><span className="text-violet-600 font-medium">Администратор</span> → Панель управления</p>
          </div>
        </div>

      </div>
    </div>
  );
}

function translateError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "Неверный email или пароль";
  if (msg.includes("Email not confirmed")) return "Email не подтверждён";
  if (msg.includes("Too many requests")) return "Слишком много попыток, подождите немного";
  return msg;
}
