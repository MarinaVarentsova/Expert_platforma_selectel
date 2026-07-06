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
      const url = ROLE_DESTINATIONS[state.user.role] ?? "/";
      navigate(url);
    }
  }, [state, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError(null);
    setSubmitting(true);

    const authResult = await signIn(email.trim(), password);

    if (authResult.error) {
      setSubmitting(false);
      setError(translateError(authResult.error));
    }
  }

  const inputClass =
    "w-full px-3 py-2.5 rounded-xl border border-[#D0D0D0] bg-white text-sm text-[#111111] placeholder:text-[#D0D0D0] focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30 focus:border-[#0F4C9A] transition-all";

  if (state.kind === "loading") {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center bg-[#F4F4F4]">
        <div className="h-5 w-5 rounded-full border-2 border-[#D0D0D0] border-t-[#002B5C] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4 sm:px-6 py-8 bg-[#F4F4F4]">
      <div className="w-full max-w-sm">

        {/* Brand mark */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-full bg-[#002B5C] flex items-center justify-center mb-4">
            <span className="text-sm font-bold text-white">СЭ</span>
          </div>
          <h1 className="text-xl font-bold text-[#111111]">Вход в систему</h1>
          <p className="text-sm text-[#666666] mt-1 text-center">Палата судебных экспертов</p>
        </div>

        {/* Login form */}
        <div className="bg-white rounded-2xl border border-[#D0D0D0] shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="block text-xs font-semibold text-[#666666] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#666666] mb-1.5">Пароль</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#D0D0D0] hover:text-[#666666] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 space-y-1">
                <p className="text-xs text-red-700 font-medium">{error}</p>
                <p className="text-xs text-[#666666]">
                  Восстановление пароля временно недоступно. Обратитесь к администратору.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !email || !password}
              className="w-full inline-flex items-center justify-center gap-2 bg-[#002B5C] hover:bg-[#003a7a] active:bg-[#001f45] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-4 py-2.5 rounded-full transition-all shadow-sm"
            >
              {submitting ? (
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
              {submitting ? "Вход…" : "Войти"}
            </button>
          </form>
        </div>

        {/* Role hint */}
        <div className="mt-4 bg-white rounded-xl border border-[#D0D0D0] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#666666] mb-2">
            После входа вы будете перенаправлены
          </p>
          <div className="space-y-1 text-xs text-[#666666]">
            <p><span className="text-[#002B5C] font-semibold">Заказчик</span> → Личный кабинет заказчика</p>
            <p><span className="text-[#0F4C9A] font-semibold">Эксперт</span> → Личный кабинет эксперта</p>
            <p><span className="text-[#1557A8] font-semibold">Администратор</span> → Панель управления</p>
          </div>
        </div>

      </div>
    </div>
  );
}

function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid") || m.includes("credentials") || m.includes("password") || m.includes("not found"))
    return "Неверный email или пароль";
  if (m.includes("not confirmed") || m.includes("email") && m.includes("verif"))
    return "Email не подтверждён. Проверьте почту и перейдите по ссылке из письма.";
  if (m.includes("too many") || m.includes("rate limit"))
    return "Слишком много попыток. Подождите немного и попробуйте снова.";
  if (m.includes("network") || m.includes("fetch"))
    return "Не удалось подключиться к серверу. Проверьте интернет-соединение.";
  return msg;
}
