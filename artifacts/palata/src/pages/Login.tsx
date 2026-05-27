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
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center bg-[#f0f5f1]">
        <div className="h-5 w-5 rounded-full border-2 border-[#b8ccbe] border-t-[#1a3d2b] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-6 bg-[#f0f5f1]">
      <div className="w-full max-w-sm">

        {/* Brand mark */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-full bg-[#1a3d2b] flex items-center justify-center mb-4">
            <span className="text-sm font-bold text-[#16a34a]">СЭ</span>
          </div>
          <h1 className="text-xl font-bold text-[#141c17]">Вход в систему</h1>
          <p className="text-sm text-[#8aaa90] mt-1 text-center">Палата судебных экспертов</p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl border border-[#d4e5d9] shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="block text-xs font-semibold text-[#5a7560] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full px-3 py-2.5 rounded-xl border border-[#c8d8cc] bg-[#f7fbf8] text-sm text-[#141c17] placeholder:text-[#b8ccbe] focus:outline-none focus:ring-2 focus:ring-[#16a34a]/40 focus:border-[#16a34a] transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5a7560] mb-1.5">Пароль</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 pr-10 rounded-xl border border-[#c8d8cc] bg-[#f7fbf8] text-sm text-[#141c17] placeholder:text-[#b8ccbe] focus:outline-none focus:ring-2 focus:ring-[#16a34a]/40 focus:border-[#16a34a] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b8ccbe] hover:text-[#5a7560] transition-colors"
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
              className="w-full inline-flex items-center justify-center gap-2 bg-[#1a3d2b] hover:bg-[#141c17] active:bg-[#0a1a0f] disabled:opacity-40 disabled:cursor-not-allowed text-[#f0f5f1] font-semibold text-sm px-4 py-2.5 rounded-full transition-all shadow-sm"
            >
              {submitting ? (
                <span className="h-4 w-4 rounded-full border-2 border-[#f0f5f1]/30 border-t-[#f0f5f1] animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
              {submitting ? "Вход…" : "Войти"}
            </button>
          </form>
        </div>

        {/* Role hint */}
        <div className="mt-4 bg-white/60 rounded-xl border border-[#d4e5d9] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8aaa90] mb-2">
            После входа вы будете перенаправлены
          </p>
          <div className="space-y-1 text-xs text-[#5a7560]">
            <p><span className="text-[#16a34a] font-semibold">Заказчик</span> → Личный кабинет заказчика</p>
            <p><span className="text-emerald-700 font-semibold">Эксперт</span> → Личный кабинет эксперта</p>
            <p><span className="text-[#1a3d2b] font-semibold">Администратор</span> → Панель управления</p>
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
