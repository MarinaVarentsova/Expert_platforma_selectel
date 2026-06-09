import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/authContext";
import AdminLayout from "@/components/AdminLayout";
import { useRequireRole } from "@/lib/useRequireRole";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle,
  Loader2, RefreshCw, AlertTriangle, X, Database,
  Users, Clock,
} from "lucide-react";

// ─── Column aliases (case-insensitive) ────────────────────────────────────────

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

const COL_CERT   = ["номер документ", "номер документа", "№ документа", "номер сертификата", "№ сертификата"];
const COL_FIO    = ["фио эксперта", "фио", "ф.и.о.", "ф.и.о. эксперта", "эксперт"];
const COL_AREA   = ["область производства судебной экспертизы", "область экспертизы", "специализация", "направление"];
const COL_PERIOD = ["срок действия сертификата", "действует до", "срок действия", "valid_to", "дата окончания"];

function findCol(headers: string[], aliases: string[]): number {
  return headers.findIndex(h => aliases.includes(normalizeHeader(h)));
}

// ─── Date parsing ──────────────────────────────────────────────────────────────

function parseSingleDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;

  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }

  const s = String(raw).trim();
  if (!s) return null;

  // DD.MM.YYYY or DD/MM/YYYY
  const dot = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dot) return `${dot[3]}-${dot[2].padStart(2, "0")}-${dot[1].padStart(2, "0")}`;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // native Date
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);

  return null;
}

/**
 * Parse "Срок действия сертификата" — may be:
 *  - A single date               → { validFrom: null, validTo: date }
 *  - A range "01.01.2022 – 31.12.2024" → { validFrom, validTo }
 *  - An Excel serial number      → { validFrom: null, validTo: date }
 */
function parsePeriod(raw: unknown): { validFrom: string | null; validTo: string | null; periodText: string } {
  if (raw === null || raw === undefined || raw === "") {
    return { validFrom: null, validTo: null, periodText: "" };
  }

  const periodText = String(raw).trim();

  // Range: two dates separated by –, -, or /
  const rangeMatch = periodText.match(
    /^(\d{1,2}[./]\d{1,2}[./]\d{4})\s*[–\-\/]\s*(\d{1,2}[./]\d{1,2}[./]\d{4})$/,
  );
  if (rangeMatch) {
    return {
      validFrom: parseSingleDate(rangeMatch[1]),
      validTo:   parseSingleDate(rangeMatch[2]),
      periodText,
    };
  }

  // Single date or Excel serial
  return {
    validFrom:  null,
    validTo:    parseSingleDate(raw),
    periodText: typeof raw === "number" ? "" : periodText,
  };
}

/** Extract codes like "16.1", "7.3", "24.4" from specialty text */
function extractCodes(text: string | null): string {
  if (!text) return "";
  const matches = [...text.matchAll(/(\d+\.\d+)/g)];
  const unique = [...new Set(matches.map(m => m[1]))];
  return unique.sort().join(",");
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type ParsedRow = {
  certificate_number: string | null;
  expert_full_name:   string | null;
  specialty_text:     string | null;
  certificate_period: string;
  codes:              string;
  valid_from:         string | null;
  valid_to:           string | null;
  certificate_status: "Активный" | "Истёкший";
  load_status:        "Загружен";
  _dateParseError:    boolean;
};

type PreviewSummary = {
  total:           number;
  active:          number;
  expired:         number;
  dateErrors:      number;
  emptyCertNumber: number;
  emptyFio:        number;
};

type RegistryStats = {
  total:          number;
  active:         number;
  expired:        number;
  linked:         number;
  unlinked:       number;
  last_loaded_at: string | null;
};

type EtlResult = {
  total:                 number;
  active:                number;
  expired:               number;
  parse_errors:          number;
  certs_upserted:        number;
  expert_certs_upserted: number;
  expert_dirs_upserted:  number;
  linked_experts:        number;
  unlinked_experts:      number;
  no_direction:          number;
};

type ImportPhase = "truncating" | "inserting" | "processing";

type PageState =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "preview"; rows: ParsedRow[]; summary: PreviewSummary; fileName: string }
  | { kind: "confirming"; rows: ParsedRow[]; summary: PreviewSummary; fileName: string }
  | { kind: "importing"; phase: ImportPhase; progress?: number }
  | { kind: "done"; etl: EtlResult; fileName: string }
  | { kind: "error"; message: string };

// ─── Component ─────────────────────────────────────────────────────────────────

export default function AdminCertImport() {
  useRequireRole("admin");
  const { state: authState } = useAuth();
  const currentUser = authState.kind === "authenticated" ? authState.user : null;

  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState]       = useState<PageState>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const [stats, setStats]       = useState<RegistryStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // ── Load current registry stats ────────────────────────────────────────────
  async function loadStats() {
    setStatsLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_cert_import_stats");
      if (error) throw error;
      setStats(data as RegistryStats);
    } catch {
      setStats({ total: 0, active: 0, expired: 0, linked: 0, unlinked: 0, last_loaded_at: null });
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => { void loadStats(); }, []);

  // ── File processing ────────────────────────────────────────────────────────
  function processFile(file: File) {
    if (!file.name.match(/\.xlsx?$/i)) {
      setState({ kind: "error", message: "Поддерживаются только файлы Excel (.xlsx, .xls)" });
      return;
    }
    setState({ kind: "parsing" });

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb    = XLSX.read(e.target?.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });

        if (!rawRows.length) {
          setState({ kind: "error", message: "Файл пустой или не содержит данных" });
          return;
        }

        const headers  = (rawRows[0] as unknown[]).map(h => String(h ?? ""));
        const colCert   = findCol(headers, COL_CERT);
        const colFio    = findCol(headers, COL_FIO);
        const colArea   = findCol(headers, COL_AREA);
        const colPeriod = findCol(headers, COL_PERIOD);

        const missing: string[] = [];
        if (colCert   === -1) missing.push("«Номер документ»");
        if (colFio    === -1) missing.push("«ФИО эксперта»");
        if (colPeriod === -1) missing.push("«Срок действия сертификата»");

        if (missing.length) {
          setState({
            kind: "error",
            message: `Не найдены обязательные колонки: ${missing.join(", ")}.\nНайдено: ${headers.filter(Boolean).join(", ")}`,
          });
          return;
        }

        const today = new Date().toISOString().slice(0, 10);
        const rows: ParsedRow[] = [];

        for (let i = 1; i < rawRows.length; i++) {
          const row = rawRows[i] as unknown[];
          if (row.every(c => c === "" || c === null || c === undefined)) continue;

          const certNum     = colCert  !== -1 ? String(row[colCert]  ?? "").trim() : null;
          const fio         = colFio   !== -1 ? String(row[colFio]   ?? "").trim() : null;
          const areaRaw     = colArea  !== -1 ? String(row[colArea]  ?? "").trim() : null;
          const periodRaw   = colPeriod !== -1 ? row[colPeriod]                    : null;

          const { validFrom, validTo, periodText } = parsePeriod(periodRaw);
          const dateParseError = periodRaw !== "" && periodRaw !== null && periodRaw !== undefined && validTo === null;
          const codes = extractCodes(areaRaw);

          const certStatus: "Активный" | "Истёкший" =
            validTo && validTo >= today ? "Активный" : "Истёкший";

          rows.push({
            certificate_number: certNum      || null,
            expert_full_name:   fio          || null,
            specialty_text:     areaRaw      || null,
            certificate_period: periodText,
            codes,
            valid_from:         validFrom,
            valid_to:           validTo,
            certificate_status: certStatus,
            load_status:        "Загружен",
            _dateParseError:    dateParseError,
          });
        }

        if (!rows.length) {
          setState({ kind: "error", message: "В файле нет строк с данными (только заголовок)" });
          return;
        }

        setState({ kind: "preview", rows, summary: calcSummary(rows), fileName: file.name });
      } catch (err: unknown) {
        setState({ kind: "error", message: `Ошибка разбора файла: ${(err as Error).message}` });
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  // ── Import execution ───────────────────────────────────────────────────────
  async function runImport(rows: ParsedRow[], fileName: string) {
    setState({ kind: "importing", phase: "truncating" });

    try {
      // Phase 1: truncate
      const { error: truncErr } = await supabase.rpc("truncate_certificates_import");
      if (truncErr) throw new Error(`Очистка staging: ${truncErr.message}`);

      // Phase 2: insert batches of 500
      setState({ kind: "importing", phase: "inserting", progress: 0 });

      const payload = rows.map(r => ({
        certificate_number: r.certificate_number,
        expert_full_name:   r.expert_full_name,
        specialty_text:     r.specialty_text,
        certificate_period: r.certificate_period || null,
        codes:              r.codes              || null,
        valid_from:         r.valid_from,
        valid_to:           r.valid_to,
        certificate_status: r.certificate_status,
        load_status:        "Загружен",
      }));

      const BATCH = 500;
      for (let i = 0; i < payload.length; i += BATCH) {
        const batch = payload.slice(i, i + BATCH);
        const { error: insErr } = await supabase
          .from("palata_certificates_import")
          .insert(batch);
        if (insErr) throw new Error(`Вставка строк ${i + 1}–${i + batch.length}: ${insErr.message}`);
        setState({
          kind: "importing", phase: "inserting",
          progress: Math.round(((i + batch.length) / payload.length) * 100),
        });
      }

      // Phase 3: ETL
      setState({ kind: "importing", phase: "processing" });
      const { data: etlData, error: etlErr } = await supabase.rpc("etl_process_certificate_import", {
        p_file_name:  fileName,
        p_created_by: currentUser?.id ?? null,
      });

      if (etlErr) {
        throw new Error(
          `Данные загружены в staging, но ETL-обработка завершилась ошибкой:\n${etlErr.message}\n\n` +
          `Убедитесь, что supabase/cert_import_migration_v2.sql выполнена в Supabase.`,
        );
      }

      setState({ kind: "done", etl: etlData as EtlResult, fileName });
      void loadStats();
    } catch (err: unknown) {
      setState({ kind: "error", message: (err as Error).message });
    }
  }

  function backToIdle() {
    setState({ kind: "idle" });
    void loadStats();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const showUpload = state.kind === "idle" || state.kind === "error";

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Импорт реестра</p>
          <h1 className="text-2xl font-bold text-slate-900">Импорт сертификатов</h1>
          <p className="text-sm text-slate-500 mt-1">
            Каждый новый импорт полностью заменяет staging-таблицу и обновляет рабочие таблицы через ETL.
          </p>
        </div>

        {/* ── Текущий реестр ── */}
        <RegistryStatsBlock stats={stats} loading={statsLoading} />

        {/* ── Ошибка ── */}
        {state.kind === "error" && (
          <div className="p-4 rounded-xl border border-red-200 bg-red-50 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700">Ошибка</p>
              <p className="text-sm text-red-600 whitespace-pre-line mt-0.5">{state.message}</p>
              <button className="text-xs text-red-500 underline mt-2" onClick={backToIdle}>
                Попробовать снова
              </button>
            </div>
          </div>
        )}

        {/* ── Загрузка файла ── */}
        {showUpload && (
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={[
              "border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors",
              dragOver
                ? "border-[#0F4C9A] bg-[#0F4C9A]/5"
                : "border-slate-200 hover:border-[#0F4C9A]/50 hover:bg-slate-50",
            ].join(" ")}
          >
            <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700">
              Перетащите файл Excel сюда или нажмите для выбора
            </p>
            <p className="text-xs text-slate-400 mt-1">Форматы: .xlsx, .xls</p>
            <p className="text-xs text-slate-400 mt-3 leading-relaxed">
              Ожидаемые колонки: «Номер документ», «ФИО эксперта»,<br />
              «Область производства судебной экспертизы», «Срок действия сертификата»
            </p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileChange} />
          </div>
        )}

        {state.kind === "parsing"   && <SpinnerBlock label="Разбираем файл…" />}
        {state.kind === "importing" && <ImportingBlock phase={state.phase} progress={state.progress} />}

        {state.kind === "preview" && (
          <PreviewBlock
            rows={state.rows}
            summary={state.summary}
            fileName={state.fileName}
            onConfirm={() => setState({ kind: "confirming", rows: state.rows, summary: state.summary, fileName: state.fileName })}
            onCancel={backToIdle}
          />
        )}

        {state.kind === "confirming" && (
          <ConfirmDialog
            summary={state.summary}
            fileName={state.fileName}
            onConfirm={() => void runImport(state.rows, state.fileName)}
            onCancel={() => setState({ kind: "preview", rows: state.rows, summary: state.summary, fileName: state.fileName })}
          />
        )}

        {state.kind === "done" && (
          <DoneBlock etl={state.etl} fileName={state.fileName} onReset={backToIdle} />
        )}

      </div>
    </AdminLayout>
  );
}

// ─── Registry stats ────────────────────────────────────────────────────────────

function RegistryStatsBlock({ stats, loading }: { stats: RegistryStats | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Текущий реестр</p>
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Загружаем статистику…</span>
        </div>
      </div>
    );
  }

  const s = stats ?? { total: 0, active: 0, expired: 0, linked: 0, unlinked: 0, last_loaded_at: null };

  const items = [
    { icon: Database,       label: "Всего сертификатов",    value: s.total,    color: "text-slate-800" },
    { icon: CheckCircle2,   label: "Активных",              value: s.active,   color: "text-emerald-700" },
    { icon: Clock,          label: "Истёкших",              value: s.expired,  color: "text-slate-500" },
    { icon: Users,          label: "Привязано к экспертам", value: s.linked,   color: "text-[#0F4C9A]" },
    { icon: AlertTriangle,  label: "Ожидают регистрации",   value: s.unlinked, color: s.unlinked > 0 ? "text-amber-600" : "text-slate-400" },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Текущий реестр</p>
        {s.last_loaded_at && (
          <p className="text-xs text-slate-400">
            Последняя загрузка:{" "}
            {new Date(s.last_loaded_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
      {s.total === 0
        ? <p className="text-sm text-slate-400 italic">Реестр пуст — загрузите первый файл</p>
        : (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {items.map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="flex items-start gap-2.5">
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${color}`} />
                <div>
                  <p className={`text-xl font-bold leading-none ${color}`}>{value}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{label}</p>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// ─── Preview ───────────────────────────────────────────────────────────────────

function PreviewBlock({
  rows, summary, fileName, onConfirm, onCancel,
}: {
  rows: ParsedRow[]; summary: PreviewSummary; fileName: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">
          Предварительный итог — {fileName}
        </p>
        <SummaryGrid summary={summary} />
      </div>

      {(summary.dateErrors > 0 || summary.emptyCertNumber > 0 || summary.emptyFio > 0) && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 space-y-1.5">
          <p className="text-xs font-semibold text-amber-800 mb-1">Предупреждения</p>
          {summary.dateErrors      > 0 && <p className="text-xs text-amber-700">• {summary.dateErrors} строк с ошибкой даты → valid_to = null, статус «Истёкший»</p>}
          {summary.emptyCertNumber > 0 && <p className="text-xs text-amber-700">• {summary.emptyCertNumber} строк без номера сертификата</p>}
          {summary.emptyFio        > 0 && <p className="text-xs text-amber-700">• {summary.emptyFio} строк без ФИО → не будут привязаны к экспертам</p>}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={onConfirm}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F4C9A] text-white text-sm font-semibold hover:bg-[#002B5C] transition-colors"
        >
          <Upload className="w-4 h-4" />
          Подтвердить импорт ({summary.total} строк)
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Отмена
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 px-5 py-3 border-b border-slate-100">
          Предпросмотр (первые 20 строк)
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-left">
                {["#", "Номер", "ФИО эксперта", "Область экспертизы", "Коды", "Срок действия", "Статус"].map(h => (
                  <th key={h} className="px-3 py-2.5 font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 20).map((row, i) => (
                <tr key={i} className={`border-b border-slate-50 ${row._dateParseError ? "bg-amber-50" : ""}`}>
                  <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                    {row.certificate_number ?? <span className="text-slate-300 italic">пусто</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-700 max-w-[150px] truncate">
                    {row.expert_full_name ?? <span className="text-slate-300 italic">пусто</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate">
                    {row.specialty_text ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">
                    {row.codes || <span className="text-slate-300">—</span>}
                  </td>
                  <td className={`px-3 py-2 font-mono whitespace-nowrap ${row._dateParseError ? "text-amber-600" : "text-slate-700"}`}>
                    {row.valid_to
                      ? new Date(row.valid_to + "T00:00:00").toLocaleDateString("ru-RU")
                      : <span className="text-amber-500 italic">ошибка даты</span>}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={row.certificate_status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 20 && (
            <p className="text-xs text-slate-400 text-center py-3">… и ещё {rows.length - 20} строк</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Confirm dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({
  summary, fileName, onConfirm, onCancel,
}: { summary: PreviewSummary; fileName: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-900">Подтвердите импорт</p>
              <p className="text-xs text-slate-500 mt-0.5">{fileName}</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <p className="text-sm text-amber-900 font-medium">
            Загрузка нового файла полностью заменит текущий реестр в staging-таблице.
          </p>
          <p className="text-xs text-amber-700 mt-2 leading-relaxed">
            Рабочие таблицы будут обновлены через ETL (upsert, без удаления).
            Matching, ЛК эксперта и заказчика не затрагиваются.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Строк в файле", value: summary.total },
            { label: "Активных",      value: summary.active,   color: "text-emerald-700" },
            { label: "Истёкших",      value: summary.expired,  color: "text-slate-500" },
          ].map(item => (
            <div key={item.label} className="bg-slate-50 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${item.color ?? "text-slate-800"}`}>{item.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F4C9A] text-white text-sm font-semibold hover:bg-[#002B5C] transition-colors"
          >
            <Upload className="w-4 h-4" />
            Продолжить импорт
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Importing progress ────────────────────────────────────────────────────────

const PHASE_LABELS: Record<ImportPhase, string> = {
  truncating: "Очищаем предыдущий реестр…",
  inserting:  "Загружаем строки в staging…",
  processing: "Запускаем ETL-обработку…",
};

function ImportingBlock({ phase, progress }: { phase: ImportPhase; progress?: number }) {
  const steps: ImportPhase[] = ["truncating", "inserting", "processing"];
  const currentIdx = steps.indexOf(phase);
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <Loader2 className="w-5 h-5 animate-spin text-[#0F4C9A]" />
        <p className="text-sm font-semibold text-slate-700">{PHASE_LABELS[phase]}</p>
      </div>
      <div className="space-y-3">
        {steps.map((step, idx) => {
          const done   = idx < currentIdx;
          const active = idx === currentIdx;
          return (
            <div key={step} className="flex items-center gap-3">
              <div className={[
                "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold",
                done   ? "bg-emerald-100 text-emerald-700"
                       : active ? "bg-[#0F4C9A] text-white ring-2 ring-[#0F4C9A]/30"
                                : "bg-slate-100 text-slate-400",
              ].join(" ")}>
                {done ? "✓" : idx + 1}
              </div>
              <span className={[
                "text-sm",
                done ? "text-emerald-700" : active ? "text-slate-900 font-medium" : "text-slate-400",
              ].join(" ")}>
                {PHASE_LABELS[step]}
              </span>
              {active && step === "inserting" && progress !== undefined && (
                <span className="ml-auto text-xs text-slate-400 font-mono">{progress}%</span>
              )}
            </div>
          );
        })}
      </div>
      {phase === "inserting" && progress !== undefined && (
        <div className="mt-5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-[#0F4C9A] rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

// ─── Done ─────────────────────────────────────────────────────────────────────

function DoneBlock({ etl, fileName, onReset }: { etl: EtlResult; fileName: string; onReset: () => void }) {
  const sections = [
    {
      title: "Загрузка в staging",
      items: [
        { label: "Всего строк",     value: etl.total },
        { label: "Активных",        value: etl.active,       color: "text-emerald-700" },
        { label: "Истёкших",        value: etl.expired,      color: "text-slate-500" },
        { label: "Ошибок парсинга", value: etl.parse_errors, color: etl.parse_errors > 0 ? "text-amber-600" : "text-slate-400" },
      ],
    },
    {
      title: "Рабочие таблицы",
      items: [
        { label: "palata_certificates",        value: etl.certs_upserted },
        { label: "palata_expert_certificates", value: etl.expert_certs_upserted, color: "text-[#0F4C9A]" },
        { label: "palata_expert_directions",   value: etl.expert_dirs_upserted,  color: "text-[#0F4C9A]" },
      ],
    },
    {
      title: "Сопоставление с экспертами",
      items: [
        { label: "Привязано",              value: etl.linked_experts,   color: "text-emerald-700" },
        { label: "Не найдено",             value: etl.unlinked_experts, color: etl.unlinked_experts > 0 ? "text-amber-600" : "text-slate-400" },
        { label: "Без направления",        value: etl.no_direction,     color: etl.no_direction > 0 ? "text-amber-600" : "text-slate-400" },
      ],
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-800">Импорт успешно завершён</p>
          <p className="text-xs text-emerald-700 mt-0.5">{fileName}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {sections.map(s => (
          <div key={s.title} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">{s.title}</p>
            <div className="space-y-3">
              {s.items.map(item => (
                <div key={item.label} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 leading-tight">{item.label}</span>
                  <span className={`text-base font-bold flex-shrink-0 ${item.color ?? "text-slate-800"}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {etl.unlinked_experts > 0 && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50">
          <p className="text-xs font-semibold text-amber-800 mb-1">
            {etl.unlinked_experts} сертификат(ов) не привязаны к зарегистрированным экспертам
          </p>
          <p className="text-xs text-amber-700">
            Они сохранены в реестре со статусом «Ожидает регистрации эксперта».
            После регистрации эксперта с совпадающим ФИО достаточно запустить повторный импорт — связь установится автоматически.
          </p>
        </div>
      )}

      <button
        onClick={onReset}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Загрузить новый файл
      </button>
    </div>
  );
}

// ─── Shared ────────────────────────────────────────────────────────────────────

function SpinnerBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-12 justify-center text-slate-500">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: "Активный" | "Истёкший" }) {
  return (
    <span className={[
      "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold",
      status === "Активный" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
    ].join(" ")}>
      {status}
    </span>
  );
}

function SummaryGrid({ summary }: { summary: PreviewSummary }) {
  const items = [
    { label: "Всего строк",  value: summary.total,           color: "text-slate-800" },
    { label: "Активных",     value: summary.active,          color: "text-emerald-700" },
    { label: "Истёкших",     value: summary.expired,         color: "text-slate-500" },
    { label: "Ошибок даты",  value: summary.dateErrors,      color: summary.dateErrors      > 0 ? "text-amber-600" : "text-slate-400" },
    { label: "Без номера",   value: summary.emptyCertNumber, color: summary.emptyCertNumber > 0 ? "text-amber-600" : "text-slate-400" },
    { label: "Без ФИО",      value: summary.emptyFio,        color: summary.emptyFio        > 0 ? "text-amber-600" : "text-slate-400" },
  ];
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
      {items.map(item => (
        <div key={item.label} className="text-center">
          <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
          <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function calcSummary(rows: ParsedRow[]): PreviewSummary {
  return {
    total:           rows.length,
    active:          rows.filter(r => r.certificate_status === "Активный").length,
    expired:         rows.filter(r => r.certificate_status === "Истёкший").length,
    dateErrors:      rows.filter(r => r._dateParseError).length,
    emptyCertNumber: rows.filter(r => !r.certificate_number).length,
    emptyFio:        rows.filter(r => !r.expert_full_name).length,
  };
}
