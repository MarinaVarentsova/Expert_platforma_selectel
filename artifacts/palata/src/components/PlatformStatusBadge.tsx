// ─── Platform status constants ─────────────────────────────────────────────
export const APP_STATUS  = "рабочий";
export const APP_VERSION = "V1.1.0";
export const APP_MODE    = "тестовый";

// ─── Inline block shown under the user name button ─────────────────────────

export function PlatformStatusBadge() {
  return (
    <div className="mt-3 inline-flex flex-col gap-0.5 text-[11px] text-slate-400 leading-snug">
      <span><span className="text-slate-500 font-medium">Статус:</span> {APP_STATUS}</span>
      <span><span className="text-slate-500 font-medium">Версия:</span> {APP_VERSION}</span>
      <span><span className="text-slate-500 font-medium">Режим:</span> {APP_MODE}</span>
    </div>
  );
}
