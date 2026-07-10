import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Check } from "lucide-react";
import { verify, setToken, me } from "@/lib/authClient";

type View = "loading" | "success" | "success-with-redirect" | "error";

function redirectByRole(role: string, navigate: (path: string) => void) {
  if (role === "customer") navigate("/customer");
  else if (role === "expert")  navigate("/expert");
  else if (role === "admin")   navigate("/admin");
  else navigate("/login");
}

export default function AuthCallback() {
  const [, navigate] = useLocation();
  const [view, setView]   = useState<View>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      const params = new URLSearchParams(window.location.search);
      const token  = params.get("token");

      if (!token) {
        setError(
          "Ссылка подтверждения недействительна. " +
          "Зарегистрируйтесь повторно или обратитесь к администратору."
        );
        setView("error");
        return;
      }

      // ── Verify token via auth-service ──────────────────────────────────
      const result = await verify(token);

      if (!result.success) {
        const msg = result.message.toLowerCase();
        if (msg.includes("expired") || msg.includes("invalid") || msg.includes("not found")) {
          setError(
            "Ссылка подтверждения недействительна или истекла. " +
            "Зарегистрируйтесь повторно."
          );
        } else {
          setError("Не удалось подтвердить email. Попробуйте войти вручную.");
        }
        setView("error");
        return;
      }

      // ── Auto-login if access_token returned ────────────────────────────
      if (result.access_token) {
        setToken(result.access_token);

        const meResult = await me(result.access_token);
        if (meResult.success) {
          const roleRes = await fetch(`/api/palata/customer-register/role/${encodeURIComponent(meResult.user_id)}`);
          const roleBody = await roleRes.json().catch(() => null);

          if (roleRes.ok && roleBody?.success && roleBody.role) {
            setView("success-with-redirect");
            setTimeout(() => redirectByRole(roleBody.role, navigate), 2500);
            return;
          }
        }
        // me() or palata_users lookup failed — fall through to /login
      }

      // ── No access_token or lookup failed: show success + redirect login ─
      setView("success");
      setTimeout(() => navigate("/login"), 3000);
    }

    handleCallback();
  }, [navigate]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (view === "loading") {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#F4F4F4] flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-2xl border border-[#D0D0D0] p-8 text-center shadow-sm w-full max-w-md">
          <div className="h-6 w-6 rounded-full border-2 border-[#D0D0D0] border-t-[#002B5C] animate-spin mx-auto mb-4" />
          <p className="text-sm text-[#666666]">Подтверждаем email…</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (view === "error") {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#F4F4F4] flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-2xl border border-[#D0D0D0] p-8 text-center shadow-sm w-full max-w-md space-y-5">
          <p className="text-sm text-red-600 leading-relaxed">{error}</p>
          <a href="/login" className="text-[#002B5C] text-sm font-semibold hover:underline">
            Перейти на страницу входа
          </a>
        </div>
      </div>
    );
  }

  // ── Success with role redirect ────────────────────────────────────────────
  if (view === "success-with-redirect") {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#F4F4F4] flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-2xl border border-[#D0D0D0] p-8 text-center shadow-sm w-full max-w-md space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto">
            <Check className="w-7 h-7 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#111111] mb-2">Email подтверждён</h2>
            <p className="text-sm text-[#666666] leading-relaxed">
              Перенаправляем вас в личный кабинет…
            </p>
          </div>
          <div className="h-5 w-5 rounded-full border-2 border-[#D0D0D0] border-t-[#002B5C] animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  // ── Success → redirect to /login ─────────────────────────────────────────
  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#F4F4F4] flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-2xl border border-[#D0D0D0] p-8 text-center shadow-sm w-full max-w-md space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto">
          <Check className="w-7 h-7 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#111111] mb-2">Email подтверждён</h2>
          <p className="text-sm text-[#666666] leading-relaxed">
            Регистрация завершена. Сейчас вы будете перенаправлены на страницу входа…
          </p>
        </div>
        <a href="/login" className="text-[#002B5C] text-sm font-semibold hover:underline">
          Войти сейчас
        </a>
      </div>
    </div>
  );
}
