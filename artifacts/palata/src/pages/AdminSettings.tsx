import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";

type SettingsState =
  | { kind: "loading" }
  | { kind: "ok"; intervalMinutes: number }
  | { kind: "error"; message: string };

type SaveState = "idle" | "saving" | "saved" | "error";

export default function AdminSettings() {
  const [state, setState] = useState<SettingsState>({ kind: "loading" });
  const [inputValue, setInputValue] = useState<string>("");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    fetch("/api/settings/matching-interval")
      .then(r => r.json())
      .then((data: { intervalMinutes: number }) => {
        setState({ kind: "ok", intervalMinutes: data.intervalMinutes });
        setInputValue(String(data.intervalMinutes));
      })
      .catch(() => setState({ kind: "error", message: "Не удалось загрузить настройки" }));
  }, []);

  async function handleSave() {
    const minutes = parseInt(inputValue, 10);
    if (isNaN(minutes) || minutes < 1 || minutes > 120) return;
    setSaveState("saving");
    try {
      const res = await fetch("/api/settings/matching-interval", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalMinutes: minutes }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Ошибка сохранения");
      }
      const data = await res.json() as { intervalMinutes: number };
      setState({ kind: "ok", intervalMinutes: data.intervalMinutes });
      setInputValue(String(data.intervalMinutes));
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (e: unknown) {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
      console.error(e);
    }
  }

  const currentMinutes = state.kind === "ok" ? state.intervalMinutes : null;
  const inputNum = parseInt(inputValue, 10);
  const isValid = !isNaN(inputNum) && inputNum >= 1 && inputNum <= 120;
  const isDirty = state.kind === "ok" && inputNum !== state.intervalMinutes;

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Настройки</h1>
          <p className="text-sm text-slate-500 mt-1">Конфигурация платформы и системных параметров</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-2xl">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-9 h-9 rounded-xl bg-[#EEF3FB] flex items-center justify-center flex-shrink-0">
              <Timer className="w-5 h-5 text-[#0F4C9A]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Интервал автоподбора экспертов</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Планировщик автоматически запускает подбор для всех заказов в статусе «Идёт подбор».
                {currentMinutes !== null && (
                  <> Текущий интервал: <span className="font-medium text-slate-700">{currentMinutes} мин.</span></>
                )}
              </p>
            </div>
          </div>

          {state.kind === "loading" && (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
              <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-200 border-t-slate-500 animate-spin" />
              Загрузка…
            </div>
          )}

          {state.kind === "error" && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{state.message}</p>
          )}

          {state.kind === "ok" && (
            <div className="flex items-end gap-3">
              <div className="flex-1 max-w-[180px]">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Интервал (минуты, 1–120)
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={inputValue}
                  onChange={e => { setInputValue(e.target.value); setSaveState("idle"); }}
                  className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors
                    ${!isValid && inputValue !== ""
                      ? "border-red-400 bg-red-50 focus:ring-1 focus:ring-red-400"
                      : "border-slate-300 bg-white focus:border-[#0F4C9A] focus:ring-1 focus:ring-[#0F4C9A]/30"
                    }`}
                />
                {!isValid && inputValue !== "" && (
                  <p className="text-[11px] text-red-500 mt-1">От 1 до 120 минут</p>
                )}
              </div>

              <button
                onClick={handleSave}
                disabled={!isValid || !isDirty || saveState === "saving"}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${saveState === "saved"
                    ? "bg-emerald-500 text-white"
                    : saveState === "error"
                    ? "bg-red-500 text-white"
                    : (!isValid || !isDirty || saveState === "saving")
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "bg-[#0F4C9A] text-white hover:bg-[#002B5C]"
                  }`}
              >
                {saveState === "saving" ? "Сохраняю…"
                  : saveState === "saved" ? "✓ Сохранено"
                  : saveState === "error" ? "Ошибка"
                  : "Сохранить"}
              </button>
            </div>
          )}

          <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
            После сохранения планировщик перезапускается с новым интервалом немедленно.
            Значение сохраняется в базе данных и восстанавливается при перезапуске сервера.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
