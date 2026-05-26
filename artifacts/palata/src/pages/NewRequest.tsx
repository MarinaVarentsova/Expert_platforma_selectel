import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPERTISE_TYPES = [
  "Строительно-техническая",
  "Оценочная",
  "Почерковедческая",
  "Авторедческая (документов)",
  "Автотехническая",
  "Трасологическая",
  "Бухгалтерская",
  "Финансово-экономическая",
  "Пожарно-техническая",
  "Электротехническая",
  "Психологическая",
  "Психиатрическая",
  "Землеустроительная",
  "Экологическая",
  "Товароведческая",
  "Компьютерно-техническая",
  "Медицинская",
  "Другая",
];

const REGIONS = [
  "Москва",
  "Московская область",
  "Санкт-Петербург",
  "Ленинградская область",
  "Краснодарский край",
  "Новосибирская область",
  "Свердловская область",
  "Республика Татарстан",
  "Нижегородская область",
  "Ростовская область",
  "Челябинская область",
  "Самарская область",
  "Республика Башкортостан",
  "Омская область",
  "Красноярский край",
  "Воронежская область",
  "Пермский край",
  "Волгоградская область",
  "Саратовская область",
  "Другой регион",
];

const URGENCY_OPTIONS = [
  { value: "normal",      label: "Стандартная",    sub: "14–30 дней" },
  { value: "urgent",      label: "Срочная",         sub: "7–14 дней" },
  { value: "very_urgent", label: "Очень срочная",   sub: "до 7 дней" },
];

const ALLOWED_MIME = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
];
const ACCEPT_ATTR = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

type FormData = {
  title: string;
  expertise_type: string;
  region: string;
  urgency: string;
  requires_travel: boolean;
  description: string;
  materials_available: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
};

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting"; step: string }
  | { kind: "success"; requestId: string; title: string }
  | { kind: "error"; message: string };

const INIT: FormData = {
  title: "",
  expertise_type: "",
  region: "",
  urgency: "normal",
  requires_travel: false,
  description: "",
  materials_available: "",
  customer_name: "",
  customer_phone: "",
  customer_email: "",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewRequest() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState<FormData>(INIT);
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (!form.title.trim() || form.title.trim().length < 3)
      e.title = "Введите название (минимум 3 символа)";
    if (!form.expertise_type)
      e.expertise_type = "Выберите направление экспертизы";
    if (!form.region)
      e.region = "Выберите регион";
    if (!form.customer_name.trim())
      e.customer_name = "Введите ваше имя";
    if (!form.customer_email.trim() && !form.customer_phone.trim())
      e.customer_email = "Укажите email или телефон для связи";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []).filter(f => ALLOWED_MIME.includes(f.type));
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size));
      return [...prev, ...selected.filter(f => !existing.has(f.name + f.size))];
    });
    e.target.value = "";
  }

  function removeFile(idx: number) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setState({ kind: "submitting", step: "Создание заявки…" });

    try {
      // 1. Insert request
      const { data: reqData, error: reqError } = await supabase
        .from("palata_requests")
        .insert({
          status: "pending",
          title: form.title.trim(),
          description: form.description.trim() || null,
          expertise_type: form.expertise_type,
          region: form.region,
          urgency: form.urgency,
          requires_travel: form.requires_travel,
          materials_available: form.materials_available.trim() || null,
          customer_name: form.customer_name.trim(),
          customer_phone: form.customer_phone.trim() || null,
          customer_email: form.customer_email.trim() || null,
        })
        .select("id")
        .single();

      if (reqError) throw new Error(reqError.message);
      const requestId: string = reqData.id;

      // 2. Upload files (if any)
      if (files.length > 0) {
        setState({ kind: "submitting", step: `Загрузка файлов (0 / ${files.length})…` });
        const uploads = files.map(async (file, idx) => {
          const safeName = file.name.replace(/[^a-zA-Z0-9._\-а-яёА-ЯЁ]/gu, "_");
          const path = `requests/${requestId}/${Date.now()}_${idx}_${safeName}`;
          const { error: uploadError } = await supabase.storage
            .from("palata-request-files")
            .upload(path, file, { contentType: file.type, upsert: false });

          if (uploadError) {
            console.warn("File upload skipped:", file.name, uploadError.message);
            return null;
          }

          // Insert file record
          const { error: fileError } = await supabase
            .from("palata_request_files")
            .insert({
              request_id: requestId,
              bucket_path: path,
              file_name: file.name,
              mime_type: file.type,
              size_bytes: file.size,
            });
          if (fileError) console.warn("File record error:", fileError.message);
          return path;
        });
        await Promise.all(uploads);
      }

      // 3. Status event
      await supabase.from("palata_status_events").insert({
        entity_type: "request",
        entity_id: requestId,
        old_status: null,
        new_status: "pending",
        actor_id: null,
        note: "Заявка создана заказчиком через форму",
      });

      setState({ kind: "success", requestId, title: form.title.trim() });
    } catch (err: unknown) {
      setState({ kind: "error", message: (err as Error).message ?? "Неизвестная ошибка" });
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (state.kind === "success") {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Заявка создана</h1>
        <p className="text-sm text-slate-500 mb-1">{state.title}</p>
        <p className="text-xs font-mono text-slate-400 mb-8">{state.requestId.slice(0, 8).toUpperCase()}</p>
        <p className="text-sm text-slate-600 mb-8 leading-relaxed">
          Мы обработаем вашу заявку и подберём подходящего эксперта.<br />
          Вы можете отслеживать статус в личном кабинете.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href={`/requests/${state.requestId}`}>
            <button className="btn-primary">Открыть заказ</button>
          </Link>
          <Link href="/customer">
            <button className="btn-ghost">В личный кабинет</button>
          </Link>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  const busy = state.kind === "submitting";

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <button
        onClick={() => navigate("/customer")}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors"
      >
        ← Личный кабинет
      </button>

      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Заказчик</p>
        <h1 className="text-2xl font-bold text-slate-900">Новая заявка</h1>
        <p className="text-sm text-slate-500 mt-1">Заполните форму — мы подберём подходящего эксперта</p>
      </div>

      {state.kind === "error" && (
        <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-700 mb-0.5">Ошибка при создании заявки</p>
          <p className="text-xs text-red-600">{state.message}</p>
          <button className="text-xs text-red-500 underline mt-1" onClick={() => setState({ kind: "idle" })}>
            Попробовать снова
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── Section 1: О заявке ──────────────────────────────────────────── */}
        <FormCard title="О заявке">
          <Field label="Название заказа" required error={errors.title}>
            <input
              type="text"
              className={inputCls(!!errors.title)}
              placeholder="Например: строительно-техническая экспертиза жилого дома"
              value={form.title}
              onChange={e => set("title", e.target.value)}
              disabled={busy}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Направление экспертизы" required error={errors.expertise_type}>
              <select
                className={inputCls(!!errors.expertise_type)}
                value={form.expertise_type}
                onChange={e => set("expertise_type", e.target.value)}
                disabled={busy}
              >
                <option value="">— выберите —</option>
                {EXPERTISE_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>

            <Field label="Регион" required error={errors.region}>
              <select
                className={inputCls(!!errors.region)}
                value={form.region}
                onChange={e => set("region", e.target.value)}
                disabled={busy}
              >
                <option value="">— выберите —</option>
                {REGIONS.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Urgency */}
          <Field label="Срочность">
            <div className="grid grid-cols-3 gap-2">
              {URGENCY_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className={`
                    flex flex-col items-center text-center px-3 py-3 rounded-lg border cursor-pointer transition-colors
                    ${form.urgency === opt.value
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 hover:border-slate-300 text-slate-600"}
                  `}
                >
                  <input
                    type="radio"
                    name="urgency"
                    value={opt.value}
                    checked={form.urgency === opt.value}
                    onChange={() => set("urgency", opt.value)}
                    className="sr-only"
                    disabled={busy}
                  />
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-xs text-slate-400 mt-0.5">{opt.sub}</span>
                </label>
              ))}
            </div>
          </Field>

          {/* Requires travel */}
          <label className="flex items-center gap-3 cursor-pointer select-none group">
            <div
              className={`
                w-10 h-6 rounded-full transition-colors relative flex-shrink-0
                ${form.requires_travel ? "bg-indigo-600" : "bg-slate-200"}
              `}
              onClick={() => !busy && set("requires_travel", !form.requires_travel)}
            >
              <div className={`
                absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform
                ${form.requires_travel ? "translate-x-5" : "translate-x-1"}
              `} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">Требуется выезд эксперта на место</p>
              <p className="text-xs text-slate-400">Укажите, если эксперту нужно посетить объект</p>
            </div>
          </label>
        </FormCard>

        {/* ── Section 2: Описание ──────────────────────────────────────────── */}
        <FormCard title="Описание и материалы">
          <Field label="Описание ситуации">
            <textarea
              className={inputCls(false) + " resize-none"}
              rows={4}
              placeholder="Опишите суть дела, что произошло и какой результат вам нужен от экспертизы"
              value={form.description}
              onChange={e => set("description", e.target.value)}
              disabled={busy}
            />
          </Field>

          <Field label="Имеющиеся материалы">
            <textarea
              className={inputCls(false) + " resize-none"}
              rows={3}
              placeholder="Перечислите документы, фотографии, акты и другие материалы, которые у вас есть"
              value={form.materials_available}
              onChange={e => set("materials_available", e.target.value)}
              disabled={busy}
            />
          </Field>
        </FormCard>

        {/* ── Section 3: Контакты ──────────────────────────────────────────── */}
        <FormCard title="Контактные данные">
          <p className="text-xs text-slate-400 -mt-1 mb-1">
            Необходимы для связи с экспертом после подбора
          </p>

          <Field label="Ваше имя" required error={errors.customer_name}>
            <input
              type="text"
              className={inputCls(!!errors.customer_name)}
              placeholder="ФИО или название организации"
              value={form.customer_name}
              onChange={e => set("customer_name", e.target.value)}
              disabled={busy}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Телефон" error={errors.customer_phone}>
              <input
                type="tel"
                className={inputCls(!!errors.customer_phone)}
                placeholder="+7 (___) ___-__-__"
                value={form.customer_phone}
                onChange={e => set("customer_phone", e.target.value)}
                disabled={busy}
              />
            </Field>

            <Field label="Email" error={errors.customer_email}>
              <input
                type="email"
                className={inputCls(!!errors.customer_email)}
                placeholder="example@domain.ru"
                value={form.customer_email}
                onChange={e => set("customer_email", e.target.value)}
                disabled={busy}
              />
            </Field>
          </div>
          {errors.customer_email && !errors.customer_phone && (
            <p className="text-xs text-red-500 -mt-2">{errors.customer_email}</p>
          )}
        </FormCard>

        {/* ── Section 4: Файлы ─────────────────────────────────────────────── */}
        <FormCard title="Прикреплённые документы">
          <p className="text-xs text-slate-400 -mt-1 mb-3">
            PDF, DOC, DOCX, XLS, XLSX, JPG, PNG — не более 50 МБ каждый
          </p>

          {/* File list */}
          {files.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-slate-400 text-sm">{fileIcon(f.type)}</span>
                  <span className="text-sm text-slate-700 flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-slate-400 shrink-0">{fmtSize(f.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="text-slate-300 hover:text-red-400 transition-colors ml-1"
                    disabled={busy}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload button */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            disabled={busy}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-8m0 0l-3 3m3-3l3 3M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
            </svg>
            {files.length === 0 ? "Прикрепить файлы" : "Добавить ещё"}
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={onFileChange}
          />
        </FormCard>

        {/* ── Submit ───────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            className="btn-primary"
            disabled={busy}
          >
            {busy
              ? state.step
              : "Подать заявку"}
          </button>
          <Link href="/customer">
            <button type="button" className="btn-ghost" disabled={busy}>
              Отмена
            </button>
          </Link>
        </div>

      </form>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FormCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</h2>
      {children}
    </div>
  );
}

function Field({
  label, required, error, children,
}: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function inputCls(hasError: boolean) {
  return [
    "w-full text-sm rounded-lg border px-3 py-2.5 bg-white",
    "focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent",
    "disabled:bg-slate-50 disabled:text-slate-400",
    "transition-colors",
    hasError ? "border-red-300 bg-red-50" : "border-slate-300",
  ].join(" ");
}

function fileIcon(mime: string) {
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("word")) return "DOC";
  if (mime.includes("excel") || mime.includes("spreadsheet")) return "XLS";
  if (mime.startsWith("image/")) return "IMG";
  return "FILE";
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
