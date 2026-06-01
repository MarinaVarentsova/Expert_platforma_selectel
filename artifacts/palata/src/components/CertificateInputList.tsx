import { Plus, Trash2, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import type { CertResult, CertStatus } from "@/lib/certificates";

interface Props {
  numbers: string[];
  results: (CertResult | null)[];
  verifying: boolean[];
  onChange: (idx: number, val: string) => void;
  onVerify: (idx: number) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  inputClass?: string;
}

function StatusBadge({ result, verifying }: { result: CertResult | null; verifying: boolean }) {
  if (verifying) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Проверка…
      </div>
    );
  }
  if (!result || result.status === "idle") return null;

  const map: Record<CertStatus, { icon: React.ReactNode; text: string; cls: string }> = {
    verified: {
      icon: <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />,
      text: result.directionNames.length > 0
        ? `Подтверждён. Направления: ${result.directionNames.join(", ")}${result.validTo ? ` (до ${new Date(result.validTo).toLocaleDateString("ru-RU")})` : ""}`
        : `Подтверждён${result.validTo ? ` (до ${new Date(result.validTo).toLocaleDateString("ru-RU")})` : ""}`,
      cls: "text-emerald-700 bg-emerald-50 border-emerald-200",
    },
    not_found: {
      icon: <XCircle className="w-3.5 h-3.5 flex-shrink-0" />,
      text: `Сертификат ${result.raw.trim()} не найден или срок его действия истёк. Новый сертификат можно получить на сайте Палаты: https://xn--80aaaio3ae2acfmjkg3n.xn--p1ai/`,
      cls: "text-amber-700 bg-amber-50 border-amber-200",
    },
    expired: {
      icon: <Clock className="w-3.5 h-3.5 flex-shrink-0" />,
      text: `Сертификат ${result.raw.trim()} не найден или срок его действия истёк. Новый сертификат можно получить на сайте Палаты: https://xn--80aaaio3ae2acfmjkg3n.xn--p1ai/`,
      cls: "text-amber-700 bg-amber-50 border-amber-200",
    },
    idle: { icon: null, text: "", cls: "" },
    verifying: { icon: null, text: "", cls: "" },
  };

  const { icon, text, cls } = map[result.status];
  if (!text) return null;

  return (
    <div className={`flex items-start gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${cls}`}>
      {icon}
      <span>{text}</span>
    </div>
  );
}

const defaultInputClass =
  "flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30 focus:border-[#0F4C9A] bg-white font-mono";

export function CertificateInputList({
  numbers,
  results,
  verifying,
  onChange,
  onVerify,
  onAdd,
  onRemove,
  inputClass,
}: Props) {
  const ic = inputClass ?? defaultInputClass;

  return (
    <div className="space-y-3">
      {numbers.map((num, idx) => (
        <div key={idx} className="space-y-1.5">
          <div className="flex gap-2">
            <input
              type="text"
              value={num}
              onChange={(e) => onChange(idx, e.target.value)}
              onBlur={() => { if (num.trim()) onVerify(idx); }}
              placeholder="Например: PS 003231"
              className={ic}
            />
            <button
              type="button"
              onClick={() => onVerify(idx)}
              disabled={verifying[idx] || !num.trim()}
              className="shrink-0 text-xs font-medium px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-[#D0D0D0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {verifying[idx] ? "…" : "Проверить"}
            </button>
            {numbers.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className="shrink-0 p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <StatusBadge result={results[idx]} verifying={verifying[idx]} />
        </div>
      ))}

      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1.5 text-xs font-semibold text-[#002B5C] hover:text-[#0F4C9A] transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Добавить сертификат
      </button>
    </div>
  );
}
