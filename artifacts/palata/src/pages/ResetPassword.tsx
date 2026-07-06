import { useLocation } from "wouter";
import { KeyRound } from "lucide-react";

export default function ResetPassword() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#F4F4F4] flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-2xl border border-[#D0D0D0] p-8 text-center shadow-sm w-full max-w-md space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-[#002B5C]/8 flex items-center justify-center mx-auto">
          <KeyRound className="w-7 h-7 text-[#002B5C]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#111111] mb-2">Восстановление пароля</h2>
          <p className="text-sm text-[#666666] leading-relaxed">
            Функция восстановления пароля будет доступна в следующей версии платформы.
          </p>
        </div>
        <button
          onClick={() => navigate("/login")}
          className="w-full py-2.5 rounded-xl bg-[#0F4C9A] text-white text-sm font-semibold hover:bg-[#002B5C] transition-colors"
        >
          Вернуться ко входу
        </button>
      </div>
    </div>
  );
}
