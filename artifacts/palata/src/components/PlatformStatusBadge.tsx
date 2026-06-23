// ─── Platform status constants ─────────────────────────────────────────────
export const APP_STATUS  = "рабочий";
export const APP_VERSION = "V1.1.0";
export const APP_MODE    = "тестовый";

// ─── One-line badge shown under the ФИО button in the navbar ───────────────

export function PlatformStatusBadge() {
  return (
    <p className="text-[10px] text-[#999] text-right leading-none mt-1 whitespace-nowrap select-none">
      Статус: {APP_STATUS}&nbsp;·&nbsp;Режим: {APP_MODE}
    </p>
  );
}
