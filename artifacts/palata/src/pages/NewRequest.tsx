import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { runMatching } from "@/lib/matching";
import { useAuth } from "@/lib/authContext";
import { notify } from "@/lib/notifyApi";
import { Upload, X, FileText, FileSpreadsheet, Image, File, ArrowLeft, CheckCircle2, Loader2, ChevronDown, Check } from "lucide-react";
import { RegionMultiSelect } from "@/components/RegionMultiSelect";

const URGENCY_OPTIONS = [
  { value: "normal",      label: "Стандартная",   sub: "14–30 дней" },
  { value: "urgent",      label: "Срочная",        sub: "7–14 дней" },
  { value: "very_urgent", label: "Очень срочная",  sub: "до 7 дней" },
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
  expertise_direction_id: string;
  region_ids: string[];
  urgency: string;
  requires_travel: boolean;
  description: string;
  materials_available: string;
  customer_comment: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
};

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting"; step: string }
  | { kind: "success"; requestId: string; title: string; matchedCount: number }
  | { kind: "error"; message: string };

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewRequest() {
  const [, navigate] = useLocation();
  const { state: authState } = useAuth();
  const currentUser = authState.kind === "authenticated" ? authState.user : null;
  const currentUserId = currentUser?.id ?? null;

  const [directions, setDirections] = useState<Array<{ id: string; name: string }>>([]);
  const [allRegions, setAllRegions] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    supabase.from("palata_expertise_directions")
      .select("id, name")
      .order("sort_order")
      .then(({ data, error }) => {
        if (!error) setDirections(data ?? []);
      });
  }, [authState.kind]);

  useEffect(() => {
    supabase.from("palata_regions").select("id, name")
      .order("sort_order").order("name")
      .then(({ data }) => setAllRegions(data ?? []));
  }, []);

  const [form, setForm] = useState<FormData>({
    title: "",
    expertise_direction_id: "",
    region_ids: [],
    urgency: "normal",
    requires_travel: false,
    description: "",
    materials_available: "",
    customer_comment: "",
    customer_name: currentUser?.full_name ?? "",
    customer_phone: "",
    customer_email: currentUser?.email ?? "",
  });

  const [files, setFiles]     = useState<File[]>([]);
  const [state, setState]     = useState<SubmitState>({ kind: "idle" });
  const [errors, setErrors]   = useState<Partial<Record<keyof FormData, string>>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const [dirDropOpen, setDirDropOpen] = useState(false);
  const [dirSearch, setDirSearch]     = useState("");
  const dirDropRef                    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dirDropOpen) return;
    function handler(e: MouseEvent) {
      if (dirDropRef.current && !dirDropRef.current.contains(e.target as Node)) {
        setDirDropOpen(false);
        setDirSearch("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dirDropOpen]);

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (!form.title.trim() || form.title.trim().length < 3)
      e.title = "Введите название (минимум 3 символа)";
    if (!form.expertise_direction_id)
      e.expertise_direction_id = "Выберите направление экспертизы";
    if (form.region_ids.length === 0)
      e.region_ids = "Выберите хотя бы один регион";
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
    setState({ kind: "submitting", step: "Создание заказа…" });

    try {
      // Build combined description: situation + comment (if any)
      const situation = form.description.trim();
      const comment   = form.customer_comment.trim();
      const fullDescription = situation && comment
        ? `${situation}\n\n─── Комментарий заказчика ───\n${comment}`
        : situation || (comment ? `─── Комментарий заказчика ───\n${comment}` : null);

      // 1. Insert request with status = new
      const selectedRegionId = form.region_ids[0] ?? null;
      console.log("[new-request] selectedRegionId:", selectedRegionId);
      console.log("[new-request] payload.region_id:", selectedRegionId);

      const { data: reqData, error: reqError } = await supabase
        .from("palata_requests")
        .insert({
          status: "new",
          title: form.title.trim(),
          description: fullDescription,
          expertise_direction_id: form.expertise_direction_id,
          region_id: selectedRegionId,
          urgency: form.urgency,
          requires_travel: form.requires_travel,
          materials_available: form.materials_available.trim() || null,
          customer_name: form.customer_name.trim(),
          customer_phone: form.customer_phone.trim() || null,
          customer_email: form.customer_email.trim() || null,
          customer_id: currentUserId,
        })
        .select("id")
        .single();

      if (reqError) throw new Error(reqError.message);
      const requestId: string = reqData.id;

      // 2. Save request regions
      if (form.region_ids.length > 0) {
        await supabase.from("palata_request_regions").insert(
          form.region_ids.map(rid => ({ request_id: requestId, region_id: rid }))
        );

      }

      // 3. Upload files (if any)
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

          const { error: fileError } = await supabase
            .from("palata_request_files")
            .insert({
              request_id: requestId,
              bucket_path: path,
              file_name: file.name,
              mime_type: file.type,
              size_bytes: file.size,
              uploader_id: currentUserId,
            });
          if (fileError) console.warn("File record error:", fileError.message);
          return path;
        });
        await Promise.all(uploads);
      }

      // 3. Status event: new request created
      await supabase.from("palata_status_events").insert({
        entity_type: "request",
        entity_id: requestId,
        old_status: null,
        new_status: "new",
        actor_id: currentUserId,
        note: "Заявка создана заказчиком через форму",
      });

      // 4. Auto-matching
      setState({ kind: "submitting", step: "Подбор экспертов…" });
      let matchedCount = 0;
      try {
        const result = await runMatching({
          requestId,
          expertiseDirectionId: form.expertise_direction_id,
          regionIds: form.region_ids,
          requiresTravel: form.requires_travel,
          customerId: currentUserId ?? undefined,
        });
        matchedCount = result.matched;
      } catch (matchErr) {
        console.warn("Matching skipped:", matchErr);
      }

      // 5. Email notifications (fire-and-forget)
      if (form.customer_email.trim()) {
        notify({
          type: "request_created",
          requestId,
          requestShortId: requestId.slice(0, 8).toUpperCase(),
          requestTitle:   form.title.trim(),
          expertiseType:  directions.find(d => d.id === form.expertise_direction_id)?.name ?? "—",
          region:         form.region_ids.map(id => allRegions.find(r => r.id === id)?.name ?? "").filter(Boolean).join(", "),
          currentStatus:  "new",
          recipientEmail: form.customer_email.trim(),
          recipientType:  "customer",
          recipientName:  form.customer_name.trim() || undefined,
        });
      }

      if (matchedCount > 0) {
        supabase
          .from("palata_request_matches")
          .select("expert_id")
          .eq("request_id", requestId)
          .eq("status", "proposed")
          .then(async ({ data: matchRows }) => {
            if (!matchRows?.length) return;
            const expertIds = matchRows.map((m: { expert_id: string }) => m.expert_id);
            const { data: expertUsers } = await supabase
              .from("palata_users")
              .select("id, email, full_name")
              .in("id", expertIds);
            if (!expertUsers?.length) return;
            notify(
              (expertUsers as { id: string; email: string; full_name: string | null }[]).map(u => ({
                type:           "expert_proposed" as const,
                requestId,
                requestShortId: requestId.slice(0, 8).toUpperCase(),
                requestTitle:   form.title.trim(),
                expertiseType:  directions.find(d => d.id === form.expertise_direction_id)?.name ?? "—",
                region:         form.region_ids.map(id => allRegions.find(r => r.id === id)?.name ?? "").filter(Boolean).join(", "),
                currentStatus:  "new",
                recipientEmail: u.email,
                recipientType:  "expert" as const,
                recipientName:  u.full_name ?? undefined,
                expertId:       u.id,
                expertName:     u.full_name ?? undefined,
              })),
            );
          });
      }

      setState({ kind: "success", requestId, title: form.title.trim(), matchedCount });
    } catch (err: unknown) {
      setState({ kind: "error", message: (err as Error).message ?? "Неизвестная ошибка" });
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (state.kind === "success") {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-6 bg-[#F4F4F4]">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-[#0F4C9A]/10 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-[#0F4C9A]" />
          </div>
          <h1 className="text-2xl font-bold text-[#111111] mb-2">Заказ создан</h1>
          <p className="text-sm text-[#666666] mb-1 font-medium">{state.title}</p>
          <p className="text-xs font-mono text-[#666666] mb-6">{state.requestId.slice(0, 8).toUpperCase()}</p>

          {state.matchedCount > 0 ? (
            <div className="bg-[#0F4C9A]/8 border border-[#0F4C9A]/20 rounded-xl px-5 py-4 mb-8 text-left">
              <p className="text-sm font-semibold text-[#002B5C] mb-1">
                Подобрано {state.matchedCount} эксперт{state.matchedCount === 1 ? "" : state.matchedCount < 5 ? "а" : "ов"}
              </p>
              <p className="text-xs text-[#666666] leading-relaxed">
                Эксперты получат предложение и смогут принять заказ. Как только кто-то примет — вы увидите уведомление во вкладке «Требуют действия».
              </p>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-8 text-left">
              <p className="text-sm font-semibold text-amber-800 mb-1">Автоподбор не нашёл экспертов</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                Администратор займётся подбором вручную и свяжется с вами.
              </p>
            </div>
          )}

          <div className="flex items-center justify-center gap-3">
            <Link href={`/requests/${state.requestId}`}>
              <button className="btn-primary">Открыть заказ</button>
            </Link>
            <Link href="/customer">
              <button className="btn-ghost">В личный кабинет</button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  const busy = state.kind === "submitting";

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#F4F4F4]">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">

        {/* Back */}
        <button
          onClick={() => navigate("/customer")}
          className="inline-flex items-center gap-1.5 text-sm text-[#666666] hover:text-[#111111] mb-6 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Личный кабинет
        </button>

        {/* Header */}
        <div className="mb-7">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#666666] mb-1">Новый заказ</p>
          <h1 className="text-2xl font-bold text-[#111111]">Создать заказ на экспертизу</h1>
          <p className="text-sm text-[#666666] mt-1">Заполните форму — система автоматически подберёт эксперта</p>
        </div>

        {/* Error */}
        {state.kind === "error" && (
          <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50">
            <p className="text-sm font-semibold text-red-700 mb-0.5">Ошибка при создании заказа</p>
            <p className="text-xs text-red-600">{state.message}</p>
            <button className="text-xs text-red-500 underline mt-1" onClick={() => setState({ kind: "idle" })}>
              Попробовать снова
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── 1: О заказе ─────────────────────────────────────────── */}
          <FormCard title="О заказе" num="01">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Направление экспертизы" required error={errors.expertise_direction_id}>
                <div className="relative" ref={dirDropRef}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDirDropOpen(v => !v)}
                    className={`${inputCls(!!errors.expertise_direction_id)} flex items-center justify-between text-left`}
                  >
                    <span className={form.expertise_direction_id ? "text-[#111111]" : "text-slate-400"}>
                      {form.expertise_direction_id
                        ? (directions.find(d => d.id === form.expertise_direction_id)?.name ?? "— выберите —")
                        : "— выберите —"}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${dirDropOpen ? "rotate-180" : ""}`} />
                  </button>

                  {dirDropOpen && (
                    <div className="absolute z-20 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                      <div className="p-2 border-b border-slate-100">
                        <input
                          type="text"
                          value={dirSearch}
                          onChange={e => setDirSearch(e.target.value)}
                          placeholder="Поиск направления…"
                          autoFocus
                          className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30 focus:border-[#0F4C9A]"
                        />
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        {directions
                          .filter(d => d.name.toLowerCase().includes(dirSearch.toLowerCase()))
                          .map(d => {
                            const sel = form.expertise_direction_id === d.id;
                            return (
                              <button
                                key={d.id}
                                type="button"
                                onClick={() => {
                                  set("expertise_direction_id", d.id);
                                  setDirDropOpen(false);
                                  setDirSearch("");
                                }}
                                className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5 transition-colors ${
                                  sel
                                    ? "bg-[#F0F4FF] text-[#002B5C]"
                                    : "hover:bg-[#F4F4F4] text-[#111111]"
                                }`}
                              >
                                <div className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center transition-colors ${
                                  sel ? "bg-[#002B5C] border-[#002B5C]" : "border-slate-300"
                                }`}>
                                  {sel && <Check className="w-2.5 h-2.5 text-white" />}
                                </div>
                                {d.name}
                              </button>
                            );
                          })}
                        {directions.filter(d => d.name.toLowerCase().includes(dirSearch.toLowerCase())).length === 0 && (
                          <p className="text-sm text-slate-400 text-center py-6">Ничего не найдено</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Field>

              <Field label="Регион" required error={errors.region_ids}>
                <RegionMultiSelect
                  selectedIds={form.region_ids}
                  onChange={ids => set("region_ids", ids)}
                  disabled={busy}
                  hasError={!!errors.region_ids}
                  placeholder="— выберите регион(ы) —"
                />
              </Field>
            </div>

            {/* Срочность */}
            <Field label="Срочность">
              <div className="grid grid-cols-3 gap-2">
                {URGENCY_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    className={[
                      "flex flex-col items-center text-center px-3 py-3 rounded-lg border cursor-pointer transition-all select-none",
                      form.urgency === opt.value
                        ? "border-[#0F4C9A] bg-[#0F4C9A]/8 text-[#002B5C]"
                        : "border-[#D0D0D0] hover:border-[#0F4C9A]/50 text-[#666666]",
                    ].join(" ")}
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
                    <span className="text-xs text-[#666666] mt-0.5">{opt.sub}</span>
                  </label>
                ))}
              </div>
            </Field>

            {/* Выезд / дистанционно */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-[#111111]">Формат работы</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: false, label: "Дистанционно", desc: "Без выезда к объекту" },
                  { value: true,  label: "Выезд",         desc: "Эксперт посетит объект" },
                ].map(opt => (
                  <label
                    key={String(opt.value)}
                    className={[
                      "flex flex-col px-4 py-3 rounded-lg border cursor-pointer transition-all select-none",
                      form.requires_travel === opt.value
                        ? "border-[#0F4C9A] bg-[#0F4C9A]/8 text-[#002B5C]"
                        : "border-[#D0D0D0] hover:border-[#0F4C9A]/50 text-[#666666]",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="requires_travel"
                      checked={form.requires_travel === opt.value}
                      onChange={() => set("requires_travel", opt.value)}
                      className="sr-only"
                      disabled={busy}
                    />
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-xs text-[#666666]">{opt.desc}</span>
                  </label>
                ))}
              </div>
            </div>
          </FormCard>

          {/* ── 2: Описание ─────────────────────────────────────────── */}
          <FormCard title="Описание и материалы" num="02">
            <Field label="Описание ситуации">
              <textarea
                className={`${inputCls(false)} resize-none`}
                rows={4}
                placeholder="Опишите суть дела, что произошло и какой результат вам нужен от экспертизы"
                value={form.description}
                onChange={e => set("description", e.target.value)}
                disabled={busy}
              />
            </Field>

            <Field label="Имеющиеся материалы">
              <textarea
                className={`${inputCls(false)} resize-none`}
                rows={3}
                placeholder="Перечислите документы, фотографии, акты и другие материалы, которые у вас есть"
                value={form.materials_available}
                onChange={e => set("materials_available", e.target.value)}
                disabled={busy}
              />
            </Field>

            <Field label="Комментарий заказчика">
              <textarea
                className={`${inputCls(false)} resize-none`}
                rows={3}
                placeholder="Дополнительные пожелания к эксперту, сроки, особые условия — любые комментарии, которые помогут специалисту"
                value={form.customer_comment}
                onChange={e => set("customer_comment", e.target.value)}
                disabled={busy}
              />
            </Field>
          </FormCard>

          {/* ── 3: Контакты ─────────────────────────────────────────── */}
          <FormCard title="Контактные данные" num="03">
            <p className="text-xs text-[#666666] -mt-1">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Телефон">
                <input
                  type="tel"
                  className={inputCls(false)}
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
            {errors.customer_email && (
              <p className="text-xs text-red-500 -mt-2">{errors.customer_email}</p>
            )}
          </FormCard>

          {/* ── 4: Файлы ────────────────────────────────────────────── */}
          <FormCard title="Прикреплённые документы" num="04">
            <p className="text-xs text-[#666666] -mt-1">
              PDF, DOC, DOCX, XLS, XLSX, JPG, PNG — не более 50 МБ каждый
            </p>

            {files.length > 0 && (
              <div className="space-y-1.5">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-3 py-2 bg-[#F4F4F4] rounded-lg border border-[#D0D0D0]">
                    <span className="text-[#666666] shrink-0">{fileIconEl(f.type)}</span>
                    <span className="text-sm text-[#111111] flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-[#666666] shrink-0">{fmtSize(f.size)}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-[#666666] hover:text-red-500 transition-colors ml-0.5 shrink-0"
                      disabled={busy}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-[#D0D0D0] text-sm text-[#666666] hover:border-[#0F4C9A] hover:text-[#0F4C9A] hover:bg-[#0F4C9A]/5 transition-colors"
              disabled={busy}
            >
              <Upload className="w-4 h-4" />
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

          {/* ── Submit ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-4 pt-1 pb-8">
            <button
              type="submit"
              className="btn-primary inline-flex items-center gap-2"
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {state.step}
                </>
              ) : (
                "Создать заказ"
              )}
            </button>
            <Link href="/customer">
              <button type="button" className="btn-ghost" disabled={busy}>
                Отмена
              </button>
            </Link>
          </div>

        </form>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FormCard({ title, num, children }: { title: string; num: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-[#D0D0D0] p-6 space-y-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#002B5C] text-[#FFFFFF] text-[9px] font-bold flex items-center justify-center">
          {num}
        </span>
        <h2 className="text-xs font-bold uppercase tracking-widest text-[#666666]">{title}</h2>
      </div>
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
      <label className="block text-sm font-medium text-[#111111] mb-1.5">
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
    "w-full text-sm rounded-lg border px-3 py-2.5 bg-white text-[#111111]",
    "focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30 focus:border-[#0F4C9A]",
    "disabled:bg-[#F4F4F4] disabled:text-[#666666]",
    "transition-colors placeholder:text-[#D0D0D0]",
    hasError ? "border-red-300 bg-red-50" : "border-[#D0D0D0]",
  ].join(" ");
}

function fileIconEl(mime: string) {
  if (mime === "application/pdf") return <FileText className="w-4 h-4" />;
  if (mime.includes("word")) return <FileText className="w-4 h-4" />;
  if (mime.includes("excel") || mime.includes("spreadsheet")) return <FileSpreadsheet className="w-4 h-4" />;
  if (mime.startsWith("image/")) return <Image className="w-4 h-4" />;
  return <File className="w-4 h-4" />;
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
