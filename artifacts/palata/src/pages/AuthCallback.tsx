import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";

function redirectByRole(role: string, navigate: (path: string) => void) {
  if (role === "customer") navigate("/customer");
  else if (role === "expert") navigate("/expert");
  else if (role === "admin") navigate("/admin");
  else navigate("/");
}

export default function AuthCallback() {
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      // PKCE flow: exchange code for session
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeErr) {
          console.error("[auth/callback] exchangeCodeForSession:", exchangeErr.message);
          setError("Ссылка недействительна или уже использована. Попробуйте войти вручную.");
          return;
        }
      }

      // Get session (after exchange or from implicit hash)
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setError("Не удалось получить сессию. Попробуйте войти вручную.");
        return;
      }

      // Fetch user role from palata_users
      const { data: palataUser, error: userErr } = await supabase
        .from("palata_users")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (userErr || !palataUser) {
        console.error("[auth/callback] palata_users lookup:", userErr?.message);
        // DB trigger may not have fired yet — retry once after a short delay
        await new Promise(r => setTimeout(r, 1500));
        const { data: retryUser } = await supabase
          .from("palata_users")
          .select("role")
          .eq("id", session.user.id)
          .single();
        if (!retryUser) {
          setError("Не удалось определить роль пользователя. Попробуйте войти вручную.");
          return;
        }
        redirectByRole(retryUser.role, navigate);
        return;
      }

      redirectByRole(palataUser.role, navigate);
    }

    handleCallback();
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#F4F4F4] flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-2xl border border-[#D0D0D0] p-8 text-center shadow-sm w-full max-w-md">
          <p className="text-sm text-red-600 mb-5 leading-relaxed">{error}</p>
          <a href="/login" className="text-[#002B5C] text-sm font-semibold hover:underline">
            Перейти на страницу входа
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#F4F4F4] flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-2xl border border-[#D0D0D0] p-8 text-center shadow-sm w-full max-w-md">
        <p className="text-sm text-[#666666]">Подтверждаем email, перенаправляем…</p>
      </div>
    </div>
  );
}
