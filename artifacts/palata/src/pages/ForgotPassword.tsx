import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, CheckCircle } from "lucide-react";
import { forgotPassword } from "@/lib/authClient";

export default function ForgotPassword() {
  const [email, setEmail]       = useState("");
  const [submitting, setSubmit] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [sent, setSent]         = useState(false);

  const [, navigate] = useLocation();

  const inputClass =
    "w-full px-3 py-2.5 rounded-xl border border-[#D0D0D0] bg-white text-sm text-[#111111] placeholder:text-[#D0D0D0] focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30 focus:border-[#0F4C9A] transition-all";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setSubmit(true);

    const result = await forgotPassword(email.trim());

    setSubmit(false);
    if (!result.success) {
      setError(result.message ?? "Не удалось отправить письмо. Попробуйте позже.");
      return;
    }
    setSent(true);
  }

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4 sm:px-6 py-8 bg-[#F4F4F4]">
      <div className="w-full max-w-sm">

        {/* Brand mark */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-full bg-[#002B5C] flex items-center justify-center mb-4">
            <span className="text-sm font-bold text-white">СЭ</span>
          </div>
          <h1 className="text-xl font-bold text-[#111111]">Восстановление пароля</h1>
          <p className="text-sm text-[#666666] mt-1 text-center">Палата судебных экспертов</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#D0D0D0] shadow-sm p-6">
          {sent ? (
            <div className="flex flex-col items-center gap-4 py-2">
              <CheckCircle className="w-10 h-10 text-green-500" />
              <p className="text-sm text-[#111111] text-center leading-relaxed">
                Если пользователь с таким email существует, письмо со ссылкой для восстановления отправлено.
              </p>
              <button
                onClick={() => navigate("/login")}
                className="mt-2 text-xs text-[#0F4C9A] hover:underline"
              >
                Вернуться ко входу
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-[#666666] leading-relaxed">
                Введите email, указанный при регистрации. Мы отправим ссылку для создания нового пароля.
              </p>

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

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-xs text-red-700 font-medium">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !email.trim()}
                className="w-full inline-flex items-center justify-center gap-2 bg-[#002B5C] hover:bg-[#003a7a] active:bg-[#001f45] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-4 py-2.5 rounded-full transition-all shadow-sm"
              >
                {submitting ? (
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
                {submitting ? "Отправка…" : "Отправить ссылку"}
              </button>

              <button
                type="button"
                onClick={() => navigate("/login")}
                className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-[#666666] hover:text-[#111111] transition-colors pt-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Вернуться ко входу
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}
