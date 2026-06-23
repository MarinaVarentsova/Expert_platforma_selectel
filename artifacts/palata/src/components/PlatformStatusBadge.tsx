// ─── Platform status constants ─────────────────────────────────────────────
export const APP_STATUS  = "рабочее";
export const APP_VERSION = "v1.1.0";
export const APP_MODE    = "тестовый";

// ─── Component ─────────────────────────────────────────────────────────────

export function PlatformStatusBadge() {
  return (
    <div className="fixed bottom-4 right-4 z-40 pointer-events-none select-none">
      {/* Desktop: full badge */}
      <div className="hidden sm:flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-full pl-2.5 pr-3.5 py-1.5 shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
        <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
          {APP_VERSION}
          <span className="mx-1 text-slate-200">·</span>
          {APP_MODE}
          <span className="mx-1 text-slate-200">·</span>
          {APP_STATUS}
        </span>
      </div>

      {/* Mobile: compact dot + version only */}
      <div className="flex sm:hidden items-center gap-1.5 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-full pl-2 pr-2.5 py-1 shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
        <span className="text-[10px] text-slate-400 font-medium">{APP_VERSION}</span>
      </div>
    </div>
  );
}
