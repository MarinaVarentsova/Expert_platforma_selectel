import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";
import AdminLayout from "@/components/AdminLayout";
import { useRequireRole } from "@/lib/useRequireRole";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, RefreshCw } from "lucide-react";

// ─── Column name aliases (case-insensitive, trimmed) ──────────────────────────

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

const COL_CERT_NUMBER = ["номер документ", "номер документа", "№ документа", "номер сертификата", "№ сертификата"];
const COL_FIO         = ["фио эксперта", "фио", "ф.и.о.", "ф.и.о. эксперта", "эксперт"];
const COL_AREA        = ["область производства судебной экспертизы", "область экспертизы", "специализация", "направление"];
const COL_VALID_TO    = ["срок действия сертификата", "действует до", "срок действия", "valid_to", "дата окончания"];

function findCol(headers: string[], aliases: string[]): number {
  return headers.findIndex(h => aliases.includes(normalizeHeader(h)));
}

// ─── Date parsing ─────────────────────────────────────────────────────────────

function parseDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;

  // Excel serial number
  if (typeof raw === "number") {
    const date = XLSX.SSF.parse_date_code(raw);
    if (!date) return null;
    const y = date.y;
    const m = String(date.m).padStart(2, "0");
    const d = String(date.d).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const s = String(raw).trim();
  if (!s) return null;

  // DD.MM.YYYY or DD/MM/YYYY
  const dotMatch = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dotMatch) {
    const [, d, m, y] = dotMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // YYYY-MM-DD already
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return s;

  // Try native Date
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    return dt.toISOString().slice(0, 10);
  }

  return null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedRow = {
  certificate_number: string | null;
  expert_full_name: string | null;
  expertise_area: string | null;
  valid_to: string | null;
  certificate_status: "Активный" | "Истёкший";
  load_status: "Загружен";
  _dateParseError: boolean;
};

type ImportSummary = {
  total: number;
  active: number;
  expired: number;
  dateErrors: number;
  emptyCertNumber: number;
  emptyFio: number;
};

type PageState =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "preview"; rows: ParsedRow[]; summary: ImportSummary; fileName: string }
  | { kind: "importing" }
  | { kind: "done"; summary: ImportSummary; fileName: string }
  | { kind: "error"; message: string };

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminCertImport() {
  useRequireRole("admin");

  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<PageState>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);

  function processFile(file: File) {
    if (!file.name.match(/\.xlsx?$/i)) {
      setState({ kind: "error", message: "Поддерживаются только файлы Excel (.xlsx, .xls)" });
      return;
    }

    setState({ kind: "parsing" });

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          defval: "",
          raw: true,
        });

        if (!rawRows.length) {
          setState({ kind: "error", message: "Файл пустой или не содержит данных" });
          return;
        }

        // First row = headers
        const headers = (rawRows[0] as unknown[]).map(h => String(h ?? ""));
        const colCert    = findCol(headers, COL_CERT_NUMBER);
        const colFio     = findCol(headers, COL_FIO);
        const colArea    = findCol(headers, COL_AREA);
        const colValidTo = findCol(headers, COL_VALID_TO);

        const missing: string[] = [];
        if (colCert    === -1) missing.push("«Номер документ»");
        if (colFio     === -1) missing.push("«ФИО эксперта»");
        if (colValidTo === -1) missing.push("«Срок действия сертификата»");

        if (missing.length > 0) {
          setState({
            kind: "error",
            message: `Не найдены обязательные колонки: ${missing.join(", ")}.\nНайденные заголовки: ${headers.filter(Boolean).join(", ")}`,
          });
          return;
        }

        const today = new Date().toISOString().slice(0, 10);
        const rows: ParsedRow[] = [];

        for (let i = 1; i < rawRows.length; i++) {
          const row = rawRows[i] as unknown[];
          // Skip completely empty rows
          if (row.every(cell => cell === "" || cell === null || cell === undefined)) continue;

          const certNum  = colCert  !== -1 ? String(row[colCert]  ?? "").trim() : null;
          const fio      = colFio   !== -1 ? String(row[colFio]   ?? "").trim() : null;
          const area     = colArea  !== -1 ? String(row[colArea]  ?? "").trim() : null;
          const rawDate  = colValidTo !== -1 ? row[colValidTo] : null;

          const validTo = parseDate(rawDate);
          const dateParseError = rawDate !== "" && rawDate !== null && rawDate !== undefined && validTo === null;

          const certStatus: "Активный" | "Истёкший" =
            validTo && validTo >= today ? "Активный" : "Истёкший";

          rows.push({
            certificate_number: certNum || null,
            expert_full_name:   fio     || null,
            expertise_area:     area    || null,
            valid_to:           validTo,
            certificate_status: certStatus,
            load_status:        "Загружен",
            _dateParseError:    dateParseError,
          });
        }

        if (rows.length === 0) {
          setState({ kind: "error", message: "В файле нет строк с данными (только заголовок)" });
          return;
        }

        const summary = calcSummary(rows);
        setState({ kind: "preview", rows, summary, fileName: file.name });
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

  async function runImport() {
    if (state.kind !== "preview") return;
    const { rows, summary, fileName } = state;
    setState({ kind: "importing" });

    try {
      // 1. Truncate import table
      const { error: truncErr } = await supabase.rpc("truncate_certificates_import");
      if (truncErr) throw new Error(`Ошибка очистки таблицы: ${truncErr.message}`);

      // 2. Insert all rows in batches of 500
      const insertRows = rows.map(r => ({
        certificate_number: r.certificate_number,
        expert_full_name:   r.expert_full_name,
        expertise_area:     r.expertise_area,
        valid_to:           r.valid_to,
        certificate_status: r.certificate_status,
        load_status:        r.load_status,
      }));

      const BATCH = 500;
      for (let i = 0; i < insertRows.length; i += BATCH) {
        const batch = insertRows.slice(i, i + BATCH);
        const { error: insErr } = await supabase
          .from("palata_certificates_import")
          .insert(batch);
        if (insErr) throw new Error(`Ошибка вставки строк ${i + 1}–${i + batch.length}: ${insErr.message}`);
      }

      setState({ kind: "done", summary, fileName });
    } catch (err: unknown) {
      setState({ kind: "error", message: (err as Error).message });
    }
  }

  // ── Renders ─────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto px-6 py-10">

        <div className="mb-8">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Импорт реестра</p>
          <h1 className="text-2xl font-bold text-slate-900">Импорт сертификатов</h1>
          <p className="text-sm text-slate-500 mt-1">
            Каждый новый импорт полностью заменяет предыдущий реестр.
          </p>
        </div>

        {/* ── Error ── */}
        {state.kind === "error" && (
          <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700">Ошибка</p>
              <p className="text-sm text-red-600 whitespace-pre-line mt-0.5">{state.message}</p>
              <button
                className="text-xs text-red-500 underline mt-2"
                onClick={() => setState({ kind: "idle" })}
              >
                Попробовать снова
              </button>
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {state.kind === "done" && (
          <div className="mb-6 p-5 rounded-xl border border-emerald-200 bg-emerald-50">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <p className="text-sm font-semibold text-emerald-800">
                Импорт завершён — {state.fileName}
              </p>
            </div>
            <SummaryGrid summary={state.summary} />
            <button
              className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 hover:text-emerald-900 transition-colors"
              onClick={() => setState({ kind: "idle" })}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Загрузить новый файл
            </button>
          </div>
        )}

        {/* ── Upload zone ── */}
        {(state.kind === "idle" || state.kind === "error") && (
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
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={onFileChange}
            />
          </div>
        )}

        {/* ── Parsing ── */}
        {state.kind === "parsing" && (
          <div className="flex items-center gap-3 py-10 justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Разбираем файл…</span>
          </div>
        )}

        {/* ── Importing ── */}
        {state.kind === "importing" && (
          <div className="flex items-center gap-3 py-10 justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Загружаем данные в базу…</span>
          </div>
        )}

        {/* ── Preview ── */}
        {state.kind === "preview" && (
          <div className="space-y-6">

            {/* Summary */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">
                Предварительный итог — {state.fileName}
              </p>
              <SummaryGrid summary={state.summary} />
            </div>

            {/* Warnings */}
            {(state.summary.dateErrors > 0 || state.summary.emptyCertNumber > 0 || state.summary.emptyFio > 0) && (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 space-y-1.5">
                <p className="text-xs font-semibold text-amber-800 mb-2">Предупреждения (строки будут загружены, но с пустыми полями)</p>
                {state.summary.dateErrors > 0 && (
                  <p className="text-xs text-amber-700">• {state.summary.dateErrors} строк с ошибкой парсинга даты — поле «Срок действия» будет пустым, статус «Истёкший»</p>
                )}
                {state.summary.emptyCertNumber > 0 && (
                  <p className="text-xs text-amber-700">• {state.summary.emptyCertNumber} строк без номера сертификата</p>
                )}
                {state.summary.emptyFio > 0 && (
                  <p className="text-xs text-amber-700">• {state.summary.emptyFio} строк без ФИО</p>
                )}
              </div>
            )}

            {/* Confirm button */}
            <div className="flex items-center gap-4">
              <button
                onClick={runImport}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F4C9A] text-white text-sm font-semibold hover:bg-[#002B5C] transition-colors"
              >
                <Upload className="w-4 h-4" />
                Подтвердить импорт ({state.summary.total} строк)
              </button>
              <button
                onClick={() => setState({ kind: "idle" })}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Отмена
              </button>
            </div>

            {/* Preview table */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 px-5 py-3 border-b border-slate-100">
                Предпросмотр (первые 20 строк)
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-500">#</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Номер документа</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-500">ФИО эксперта</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Область экспертизы</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Срок действия</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.rows.slice(0, 20).map((row, i) => (
                      <tr key={i} className={`border-b border-slate-50 ${row._dateParseError ? "bg-amber-50" : ""}`}>
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-slate-700">{row.certificate_number ?? <span className="text-slate-300 italic">пусто</span>}</td>
                        <td className="px-3 py-2 text-slate-700 max-w-[180px] truncate">{row.expert_full_name ?? <span className="text-slate-300 italic">пусто</span>}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate">{row.expertise_area ?? "—"}</td>
                        <td className={`px-3 py-2 font-mono ${row._dateParseError ? "text-amber-600" : "text-slate-700"}`}>
                          {row.valid_to
                            ? new Date(row.valid_to).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
                            : <span className="text-amber-500 italic">ошибка даты</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            row.certificate_status === "Активный"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}>
                            {row.certificate_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {state.rows.length > 20 && (
                  <p className="text-xs text-slate-400 text-center py-3">
                    … и ещё {state.rows.length - 20} строк
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

// ─── Summary grid ─────────────────────────────────────────────────────────────

function SummaryGrid({ summary }: { summary: ImportSummary }) {
  const items = [
    { label: "Всего строк",          value: summary.total,           color: "text-slate-800" },
    { label: "Активных",             value: summary.active,          color: "text-emerald-700" },
    { label: "Истёкших",             value: summary.expired,         color: "text-slate-500" },
    { label: "Ошибок даты",          value: summary.dateErrors,      color: summary.dateErrors > 0 ? "text-amber-600" : "text-slate-400" },
    { label: "Пустых номеров",       value: summary.emptyCertNumber, color: summary.emptyCertNumber > 0 ? "text-amber-600" : "text-slate-400" },
    { label: "Пустых ФИО",           value: summary.emptyFio,        color: summary.emptyFio > 0 ? "text-amber-600" : "text-slate-400" },
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcSummary(rows: ParsedRow[]): ImportSummary {
  return {
    total:           rows.length,
    active:          rows.filter(r => r.certificate_status === "Активный").length,
    expired:         rows.filter(r => r.certificate_status === "Истёкший").length,
    dateErrors:      rows.filter(r => r._dateParseError).length,
    emptyCertNumber: rows.filter(r => !r.certificate_number).length,
    emptyFio:        rows.filter(r => !r.expert_full_name).length,
  };
}
