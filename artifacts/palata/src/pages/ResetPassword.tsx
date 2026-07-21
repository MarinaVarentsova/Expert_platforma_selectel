import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff, ArrowRight, XCircle, CheckCircle } from "lucide-react";
import { resetPassword } from "@/lib/authClient";

function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    token: params.get("token") ?? "",
    email: params.get("email") ?? "",
  };
}

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "Пароль должен содержать не менее 8 символов.";
  if (!/[a-zA-Zа-яА-ЯёЁ]/.test(pw)) return "Пароль должен содержать хотя бы одну букву.";
  if (!/[0-9]/.test(pw)) return "Пароль должен содержать хотя бы одну цифру.";
  return null;
}

function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (
    m.includes("недействительна") ||
    m.includes("истёк") ||
    m.includes("использована") ||
    m.includes("invalid") ||
    m.includes("expired") ||
    m.includes("token")
  ) {
    return "Ссылка восстановления недействительна или уже была использована. Откройте самое последнее письмо или запросите восстановление пароля повторно.";
  }
  if (m.includes("not found") || m.includes("пользователь не найден")) return "Пользователь не найден.";
  if (m.includes("network") || m.includes("fetch")) return "Не удалось подключиться к серверу.";
  if (m.startsWith("http ") || /^\d{3}$/.test(m.trim())) return "Произошла ошибка. Попробуйте ещё раз.";
  return msg || "Произошла ошибка. Попробуйте ещё раз.";
}

export default function ResetPassword() {
  const { token, email } = getQueryParams();

  const [password, setPassword]     = useState("");
  const [confirm, setConfirm]       = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [showCo, setShowCo]         = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState(false);
  const [redirectEmail, setRedirectEmail] = useState("");

  const [, navigate] = useLocation();

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => {
      const dest = `/login?passwordReset=1&email=${encodeURIComponent(redirectEmail)}`;
      navigate(dest);
    }, 2500);
    return () => clearTimeout(timer);
  }, [success, redirectEmail, navigate]);

  const inputClass =
    "w-full px-3 py-2.5 rounded-xl border border-[#D0D0D0] bg-white text-sm text-[#111111] placeholder:text-[#D0D0D0] focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30 focus:border-[#0F4C9A] transition-all";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Ссылка для сброса пароля недействительна. Запросите новую.");
      return;
    }

    const pwError = validatePassword(password);
    if (pwError) { setError(pwError); return; }

    if (password !== confirm) {
      setError("Пароли не совпадают.");
      return;
    }

    setSubmitting(true);
    const result = await resetPassword(token, password, confirm);
    setSubmitting(false);

    if (!result.success) {
      setError(translateError(result.message));
      return;
    }

    setRedirectEmail(result.email || email);
    setSuccess(true);
  }

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4 sm:px-6 py-8 bg-[#F4F4F4]">
      <div className="w-full max-w-sm">

        {/* Brand mark */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-full bg-[#002B5C] flex items-center justify-center mb-4">
            <span className="text-sm font-bold text-white">СЭ</span>
          </div>
          <h1 className="text-xl font-bold text-[#111111]">Новый пароль</h1>
          <p className="text-sm text-[#666666] mt-1 text-center">Палата судебных экспертов</p>
        </div>

        {/* Success state */}
        {success ? (
          <div className="bg-white rounded-2xl border border-[#D0D0D0] shadow-sm p-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle className="w-10 h-10 text-green-500" />
            <div>
              <p className="text-sm font-semibold text-[#111111]">Пароль успешно изменён.</p>
              <p className="text-xs text-[#666666] mt-1">Переходим на страницу входа…</p>
            </div>
            <div className="h-1 w-full rounded-full bg-[#E8E8E8] overflow-hidden">
              <div className="h-full bg-green-500 animate-[grow_2.5s_linear_forwards]" style={{ width: "100%", transformOrigin: "left", transform: "scaleX(0)", animation: "none" }} />
            </div>
          </div>
        ) : (
          <>
            {!token && (
              <div className="mb-4 flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700 font-medium">
                  Ссылка восстановления недействительна или уже была использована. Откройте самое последнее письмо или запросите восстановление пароля повторно.
                </p>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-[#D0D0D0] shadow-sm p-6">
              <form onSubmit={handleSubmit} className="space-y-4">

                {email && (
                  <div className="rounded-xl bg-[#F4F4F4] border border-[#D0D0D0] px-4 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#666666] mb-0.5">Аккаунт</p>
                    <p className="text-sm text-[#111111] font-medium truncate">{email}</p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[#666666] mb-1.5">Новый пароль</label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Минимум 8 символов"
                      required
                      autoComplete="new-password"
                      className={`${inputClass} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#D0D0D0] hover:text-[#666666] transition-colors"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] text-[#999999]">Не менее 8 символов, минимум одна буква и одна цифра.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#666666] mb-1.5">Повторите новый пароль</label>
                  <div className="relative">
                    <input
                      type={showCo ? "text" : "password"}
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="new-password"
                      className={`${inputClass} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCo(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#D0D0D0] hover:text-[#666666] transition-colors"
                    >
                      {showCo ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                  disabled={submitting || !token || !password || !confirm}
                  className="w-full inline-flex items-center justify-center gap-2 bg-[#002B5C] hover:bg-[#003a7a] active:bg-[#001f45] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-4 py-2.5 rounded-full transition-all shadow-sm"
                >
                  {submitting ? (
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  {submitting ? "Сохранение…" : "Сохранить новый пароль"}
                </button>
              </form>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
