import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import type { PalataRole } from "@/lib/authContext";

const ROLE_DESTINATIONS: Record<PalataRole, string> = {
  customer: "/customer",
  expert:   "/expert",
  admin:    "/admin",
};

export default function Login() {
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPassword, setShowPw]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
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
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center bg-[#f2ece2]">
        <div className="h-5 w-5 rounded-full border-2 border-[#c4bdb4] border-t-[#2e2a27] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-6 bg-[#f2ece2]">
      <div className="w-full max-w-sm">

        {/* Brand mark */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-full bg-[#2e2a27] flex items-center justify-center mb-4">
            <span className="text-sm font-bold text-[#e8891a]">СЭ</span>
          </div>
          <h1 className="text-xl font-bold text-[#1c1714]">Вход в систему</h1>
          <p className="text-sm text-[#a8a29e] mt-1 text-center">Палата судебных экспертов</p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl border border-[#e5dfd7] shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="block text-xs font-semibold text-[#78716c] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full px-3 py-2.5 rounded-xl border border-[#ddd6ce] bg-[#faf8f5] text-sm text-[#1c1714] placeholder:text-[#c4bdb4] focus:outline-none focus:ring-2 focus:ring-[#e8891a]/40 focus:border-[#e8891a] transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#78716c] mb-1.5">Пароль</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 pr-10 rounded-xl border border-[#ddd6ce] bg-[#faf8f5] text-sm text-[#1c1714] placeholder:text-[#c4bdb4] focus:outline-none focus:ring-2 focus:ring-[#e8891a]/40 focus:border-[#e8891a] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#c4bdb4] hover:text-[#78716c] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                <p className="text-xs text-red-700 font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !email || !password}
              className="w-full inline-flex items-center justify-center gap-2 bg-[#2e2a27] hover:bg-[#1c1714] active:bg-[#111009] disabled:opacity-40 disabled:cursor-not-allowed text-[#f2ece2] font-semibold text-sm px-4 py-2.5 rounded-full transition-all shadow-sm"
            >
              {submitting ? (
                <span className="h-4 w-4 rounded-full border-2 border-[#f2ece2]/30 border-t-[#f2ece2] animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
              {submitting ? "Вход…" : "Войти"}
            </button>
          </form>
        </div>

        {/* Role hint */}
        <div className="mt-4 bg-white/60 rounded-xl border border-[#e5dfd7] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a8a29e] mb-2">
            После входа вы будете перенаправлены
          </p>
          <div className="space-y-1 text-xs text-[#78716c]">
            <p><span className="text-[#e8891a] font-semibold">Заказчик</span> → Личный кабинет заказчика</p>
            <p><span className="text-emerald-700 font-semibold">Эксперт</span> → Личный кабинет эксперта</p>
            <p><span className="text-[#2e2a27] font-semibold">Администратор</span> → Панель управления</p>
          </div>
        </div>

      </div>
    </div>
  );
}

function translateError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "Неверный email или пароль";
  if (msg.includes("Email not confirmed"))       return "Email не подтверждён";
  if (msg.includes("Too many requests"))         return "Слишком много попыток, подождите немного";
  return msg;
}
