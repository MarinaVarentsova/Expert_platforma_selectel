import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type View = "loading" | "form" | "success" | "error";

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const [view, setView]               = useState<View>("loading");
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPwd, setConfirmPwd]   = useState("");
  const [showPwd, setShowPwd]         = useState(false);
  const [fieldError, setFieldError]   = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    async function init() {
      const params = new URLSearchParams(window.location.search);

      // Handle error params
      const errorParam = params.get("error");
      const errorCode  = params.get("error_code");
      if (errorParam) {
        console.error("[reset-password] URL error:", errorParam, errorCode);
        setErrorMsg(
          errorCode === "otp_expired" || errorParam === "access_denied"
            ? "Ссылка для восстановления пароля недействительна или истекла. Запросите новое письмо."
            : "Произошла ошибка. Запросите новое письмо для восстановления пароля."
        );
        setView("error");
        return;
      }

      // PKCE: exchange code for session
      const code = params.get("code");
      if (code) {
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeErr) {
          console.error("[reset-password] exchangeCodeForSession:", exchangeErr.message);
          setErrorMsg("Ссылка для восстановления пароля недействительна или истекла. Запросите новое письмо.");
          setView("error");
          return;
        }
      }

      // Verify we have a session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setErrorMsg("Ссылка для восстановления пароля недействительна или истекла. Запросите новое письмо.");
        setView("error");
        return;
      }

      setView("form");
    }

    init();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);

    if (newPassword.length < 8) {
      setFieldError("Пароль должен быть не менее 8 символов.");
      return;
    }
    if (newPassword !== confirmPwd) {
      setFieldError("Пароли не совпадают.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);

    if (error) {
      console.error("[reset-password] updateUser:", error.message);
      setFieldError("Не удалось сохранить пароль. Попробуйте ещё раз или запросите новое письмо.");
      return;
    }

    await supabase.auth.signOut();
    setView("success");
  }

  const inputClass =
    "w-full px-3 py-2.5 rounded-xl border border-[#D0D0D0] bg-white text-sm text-[#111111] placeholder:text-[#D0D0D0] focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30 focus:border-[#0F4C9A] transition-all";

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

        {/* Loading */}
        {view === "loading" && (
          <div className="flex justify-center py-8">
            <div className="h-5 w-5 rounded-full border-2 border-[#D0D0D0] border-t-[#002B5C] animate-spin" />
          </div>
        )}

        {/* Error */}
        {view === "error" && (
          <div className="bg-white rounded-2xl border border-[#D0D0D0] shadow-sm p-6 text-center space-y-4">
            <p className="text-sm text-red-600 leading-relaxed">{errorMsg}</p>
            <button
              onClick={() => navigate("/login")}
              className="text-xs text-[#002B5C] font-semibold hover:underline"
            >
              Перейти на страницу входа
            </button>
          </div>
        )}

        {/* Success */}
        {view === "success" && (
          <div className="bg-white rounded-2xl border border-[#D0D0D0] shadow-sm p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 text-emerald-500" />
            </div>
            <p className="text-sm text-[#666666] leading-relaxed">
              Пароль успешно изменён. Теперь вы можете войти в систему.
            </p>
            <button
              onClick={() => navigate("/login")}
              className="w-full inline-flex items-center justify-center gap-2 bg-[#002B5C] hover:bg-[#003a7a] text-white font-semibold text-sm px-4 py-2.5 rounded-full transition-all shadow-sm"
            >
              Войти
            </button>
          </div>
        )}

        {/* Form */}
        {view === "form" && (
          <div className="bg-white rounded-2xl border border-[#D0D0D0] shadow-sm p-6">
            <p className="text-xs text-[#666666] mb-4 leading-relaxed">
              Придумайте новый пароль. Минимальная длина — 8 символов.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">

              <div>
                <label className="block text-xs font-semibold text-[#666666] mb-1.5">Новый пароль</label>
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Не менее 8 символов"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className={`${inputClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#D0D0D0] hover:text-[#666666] transition-colors"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#666666] mb-1.5">Повторите новый пароль</label>
                <input
                  type={showPwd ? "text" : "password"}
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  placeholder="Повторите пароль"
                  required
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>

              {fieldError && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-xs text-red-700 font-medium">{fieldError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={saving || !newPassword || !confirmPwd}
                className="w-full inline-flex items-center justify-center gap-2 bg-[#002B5C] hover:bg-[#003a7a] active:bg-[#001f45] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-4 py-2.5 rounded-full transition-all shadow-sm"
              >
                {saving && <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
                {saving ? "Сохраняем…" : "Сохранить новый пароль"}
              </button>

            </form>
          </div>
        )}

      </div>
    </div>
  );
}
