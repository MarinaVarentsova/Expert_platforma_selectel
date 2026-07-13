import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { runMatching } from "@/lib/matching";
import { useAuth } from "@/lib/useAuth";
import { getToken } from "@/lib/authClient";
import { notify } from "@/lib/notifyApi";
import { Upload, X, FileText, FileSpreadsheet, Image, File, ArrowLeft, CheckCircle2, Loader2, ChevronDown, Check, ClipboardList, Zap, Star, User, Sparkles, AlertCircle } from "lucide-react";


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
  expertise_direction_id: string;
  region_id: string;
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
  | { kind: "success"; requestId: string; title: string; matchedCount: number }
  | { kind: "error"; message: string };

type AiStatus = "idle" | "detected" | "manual";

type AiDetectResult = {
  detected: boolean;
  direction_id: string | null;
  direction_name: string | null;
  confidence: number;
  reason: string;
  matched_markers: string[];
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewRequest() {
  const [, navigate] = useLocation();
  const { state: authState } = useAuth();
  const currentUser = authState.kind === "authenticated" ? authState.user : null;
  const currentUserId = currentUser?.id ?? null;

  const [directions, setDirections] = useState<Array<{ id: string; name: string }>>([]);
  const [allRegions, setAllRegions] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    fetch("/api/palata/expertise-directions")
      .then(r => r.json())
      .then(b => { if (b.success) setDirections(b.rows ?? []); })
      .catch(() => {});
  }, [authState.kind]);

  useEffect(() => {
    console.log("[regions] load start");
    fetch("/api/palata/regions")
      .then(r => r.json())
      .then(b => {
        const list = (b.rows ?? []) as { id: string; name: string }[];
        list.sort((a, b) => {
          if (a.name === "Вся Россия") return -1;
          if (b.name === "Вся Россия") return 1;
          return 0;
        });
        setAllRegions(list);
      })
      .catch(() => {});
  }, []);

  // ── Diagnostic: mount / unmount ──────────────────────────────────────────
  useEffect(() => {
    console.log("[new-request] mounted");
    return () => { console.log("[new-request] unmounted"); };
  }, []);

  // ── Diagnostic: authState changes ────────────────────────────────────────
  useEffect(() => {
    console.log("[new-request] authState", {
      kind: authState.kind,
      userId: authState.kind === "authenticated" ? authState.user.id : null,
      sessionExists: authState.kind === "authenticated",
    });
  }, [authState]);

  const [form, setForm] = useState<FormData>({
    expertise_direction_id: "",
    region_id: "",
    urgency: "normal",
    requires_travel: false,
    description: "",
    materials_available: "",
    customer_name: currentUser?.full_name ?? "",
    customer_phone: "",
    customer_email: currentUser?.email ?? "",
  });

  const [files, setFiles]     = useState<File[]>([]);
  const [state, setState]     = useState<SubmitState>({ kind: "idle" });
  const [errors, setErrors]   = useState<Partial<Record<keyof FormData, string>>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  // AI direction detection state
  const [aiStatus, setAiStatus]           = useState<AiStatus>("idle");
  const [aiDetectedName, setAiDetectedName] = useState<string>("");
  const [aiFailMessage, setAiFailMessage]   = useState<string>("");

  const [dirDropOpen, setDirDropOpen] = useState(false);
  const [dirSearch, setDirSearch]     = useState("");
  const dirDropRef                    = useRef<HTMLDivElement>(null);
  const aiWarnRef                     = useRef<HTMLDivElement>(null);

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

  // Прокрутить к предупреждению, когда ИИ не смог определить направление
  useEffect(() => {
    if (aiStatus === "manual" && aiWarnRef.current) {
      aiWarnRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [aiStatus]);

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  }

  // Validate form fields. Direction is required only in manual mode.
  function validate(requireDirection: boolean): boolean {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (requireDirection && !form.expertise_direction_id)
      e.expertise_direction_id = "Выберите направление экспертизы";
    if (!form.region_id)
      e.region_id = "Выберите регион";
    if (!form.description.trim())
      e.description = "Опишите суть дела";
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

    // Direction is required only when already in manual mode
    const requireDir = false;
    if (!validate(requireDir)) return;

    let resolvedDirectionId = form.expertise_direction_id;

    // ── Step 1: AI direction detection (only if direction not yet set) ──────
    if (!resolvedDirectionId) {
      setState({ kind: "submitting", step: "Определяем направление экспертизы по описанию ситуации…" });

      try {
        const resp = await fetch("/api/ai-detect-direction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: form.description.trim(),
            availableDirections: directions,
          }),
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const aiResult = await resp.json() as AiDetectResult;

        console.log("[new-request] AI result:", {
          detected: aiResult.detected,
          direction_name: aiResult.direction_name,
          confidence: aiResult.confidence,
          matched_markers: aiResult.matched_markers,
        });

        if (aiResult.detected && aiResult.direction_id) {
          // AI succeeded — set direction and proceed with order creation
          resolvedDirectionId = aiResult.direction_id;
          set("expertise_direction_id", aiResult.direction_id);
          setAiStatus("detected");
          setAiDetectedName(aiResult.direction_name ?? "");
        } else {
          // AI could not determine — show informational message
          const msg = "По этому вопросу мы пока не подбираем экспертов.\nНа платформе сейчас представлены специалисты по строительным дефектам, ремонту, заливам, пожарам, трещинам и другим повреждениям недвижимости.\nВы можете описать такую ситуацию или изменить текущий запрос.";
          setAiStatus("manual");
          setAiFailMessage(msg);
          setState({ kind: "idle" });
          return;
        }
      } catch (err: unknown) {
        console.warn("[new-request] AI detect error:", (err as Error).message);
        setAiStatus("manual");
        setAiFailMessage("По этому вопросу мы пока не подбираем экспертов.\nНа платформе сейчас представлены специалисты по строительным дефектам, ремонту, заливам, пожарам, трещинам и другим повреждениям недвижимости.\nВы можете описать такую ситуацию или изменить текущий запрос.");
        setState({ kind: "idle" });
        return;
      }
    }

    // ── Safety guard: direction must be set before insert ────────────────────
    if (!resolvedDirectionId) {
      setErrors(errs => ({ ...errs, expertise_direction_id: "Выберите направление экспертизы" }));
      setState({ kind: "idle" });
      return;
    }

    // ── Step 2: Create order ─────────────────────────────────────────────────
    setState({ kind: "submitting", step: "Создание заказа…" });

    try {
      const selectedRegionId = form.region_id || null;
      console.log("[new-request] selectedRegionId:", selectedRegionId);

      const reqHeaders: Record<string, string> = { "Content-Type": "application/json" };
      const token = getToken();
      if (token) reqHeaders["Authorization"] = `Bearer ${token}`;

      const reqRes = await fetch("/api/palata/requests", {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify({
          expertise_direction_id: resolvedDirectionId,
          region_id: selectedRegionId,
          description: form.description.trim() || null,
          customer_name: form.customer_name.trim(),
          customer_phone: form.customer_phone.trim() || null,
          customer_email: form.customer_email.trim() || null,
          urgency: form.urgency,
          requires_travel: form.requires_travel,
          materials_available: form.materials_available.trim() || null,
        }),
      });
      const reqBody = await reqRes.json().catch(() => null);
      console.log("[new-request] created request:", reqBody);
      if (!reqRes.ok || !reqBody?.success) {
        throw new Error(reqBody?.message ?? "Ошибка создания заявки");
      }

      const requestId = reqBody.request.id as string;
      const autoTitle = reqBody.request.title as string;

      // Upload files (if any)
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

          const fileInsRes = await fetch("/api/palata/request-files", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              request_id: requestId,
              bucket_path: path,
              file_name: file.name,
              mime_type: file.type,
              size_bytes: file.size,
              uploader_id: currentUserId,
            }),
          }).then(r => r.json()).catch(() => ({ success: false }));
          if (!fileInsRes.success) console.warn("File record error: insert failed");
          return path;
        });
        await Promise.all(uploads);
      }

      // Auto-matching
      setState({ kind: "submitting", step: "Подбор экспертов…" });
      let matchedCount = 0;
      try {
        const result = await runMatching({
          requestId,
          expertiseDirectionId: resolvedDirectionId,
          regionIds: form.region_id ? [form.region_id] : [],
          requiresTravel: form.requires_travel,
          customerId: currentUserId ?? undefined,
        });
        matchedCount = result.matched;
      } catch (matchErr) {
        console.warn("Matching skipped:", matchErr);
      }

      // Email notifications (fire-and-forget)
      const directionName = directions.find(d => d.id === resolvedDirectionId)?.name ?? "—";
      if (form.customer_email.trim()) {
        notify({
          type: "request_created",
          requestId,
          requestShortId: requestId.slice(0, 8).toUpperCase(),
          requestTitle:   autoTitle,
          expertiseType:  directionName,
          region:         allRegions.find(r => r.id === form.region_id)?.name ?? "—",
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
                requestTitle:   autoTitle,
                expertiseType:  directionName,
                region:         allRegions.find(r => r.id === form.region_id)?.name ?? "—",
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

      setState({ kind: "success", requestId, title: autoTitle, matchedCount });
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
                Перейдите в заказ для выбора экспертов.
              </p>
            </div>
          ) : (
            <div className="bg-[#F4F6FA] border border-[#D0D8E8] rounded-xl px-5 py-5 mb-8 text-center">
              {/* Radar widget */}
              <div className="flex items-center justify-center mb-3">
                <div className="relative w-14 h-14 flex items-center justify-center">
                  <span className="absolute inline-flex w-14 h-14 rounded-full bg-[#0F4C9A]/10 animate-ping" style={{ animationDuration: "1.8s" }} />
                  <span className="absolute inline-flex w-10 h-10 rounded-full bg-[#0F4C9A]/15 animate-ping" style={{ animationDuration: "1.8s", animationDelay: "0.3s" }} />
                  <span className="relative w-7 h-7 rounded-full bg-[#0F4C9A]/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#0F4C9A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <circle cx="11" cy="11" r="8" />
                      <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
                    </svg>
                  </span>
                </div>
              </div>
              <p className="text-sm font-semibold text-[#002B5C] mb-1">Поиск продолжается</p>
              <p className="text-xs text-[#555555] leading-relaxed">
                Мы не останавливаемся — система продолжает искать подходящих экспертов
                и уведомит вас, как только найдёт кандидатов.
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

  // ── Diagnostic: every render ─────────────────────────────────────────────
  console.log("[new-request] render", {
    regionsCount: allRegions.length,
    selectedRegionId: form.region_id,
    authKind: authState.kind,
  });

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#F4F4F4]">

      {/* ── Dashboard nav block ──────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-5">
        <div className="max-w-screen-2xl mx-auto">
          {/* User info + profile button */}
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Личный кабинет заказчика</p>
            <p className="text-lg font-bold text-slate-900 leading-tight">
              {currentUser?.full_name ?? currentUser?.email ?? ""}
            </p>
            {currentUser?.email && currentUser?.full_name && (
              <p className="text-xs text-slate-400 mt-0.5">{currentUser.email}</p>
            )}
            <button
              onClick={() => navigate("/customer?tab=profile")}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border bg-[#0F4C9A] border-[#0F4C9A] text-white hover:bg-[#002B5C] hover:border-[#002B5C] transition-all"
            >
              <User className="w-3.5 h-3.5" />
              Мой профиль
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-slate-200 overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6 scrollbar-none">
            <button
              onClick={() => navigate("/customer?tab=requests")}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition-all rounded-full border-b-2 -mb-px border-transparent text-[#002B5C] hover:bg-[#0F4C9A]/10 hover:text-[#0F4C9A]"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              Мои заказы
            </button>
            <button
              onClick={() => navigate("/customer?tab=actions")}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition-all rounded-full border-b-2 -mb-px border-transparent text-[#002B5C] hover:bg-[#0F4C9A]/10 hover:text-[#0F4C9A]"
            >
              <Zap className="w-3.5 h-3.5" />
              Требуют действия
            </button>
            <button
              onClick={() => navigate("/customer?tab=rate")}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition-all rounded-full border-b-2 -mb-px border-transparent text-[#002B5C] hover:bg-[#0F4C9A]/10 hover:text-[#0F4C9A]"
            >
              <Star className="w-3.5 h-3.5" />
              Оценить эксперта
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="mb-7">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#666666] mb-1">Новый заказ</p>
          <h1 className="text-2xl font-bold text-[#111111]">Создать заказ на экспертизу</h1>
          <p className="text-sm text-[#666666] mt-1">Заполните форму — система автоматически подберёт эксперта</p>
          <p className="text-xs text-[#888888] mt-0.5"><span className="text-red-400">*</span> — обязательные поля для заполнения</p>
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
            {/* ── AI direction status banners ── */}
            {aiStatus === "detected" && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50">
                <Sparkles className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Направление определено автоматически</p>
                  <p className="text-sm text-emerald-700 mt-0.5">{aiDetectedName}</p>
                </div>
              </div>
            )}

            {aiStatus === "manual" && (
              <div ref={aiWarnRef} className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">{aiFailMessage}</p>
              </div>
            )}

            {/* ── Region ── */}
            {console.log("[regions] render select", {
              regionsCount: allRegions.length,
              selectedRegionId: form.region_id,
              firstRegion: allRegions[0],
            }) as unknown as null}
            <Field label="Регион" required error={errors.region_id}>
              <select
                value={form.region_id}
                onFocus={() => {
                  console.log("[regions] dropdown opened", {
                    regionsCount: allRegions.length,
                    firstRegion: allRegions[0],
                  });
                }}
                onChange={e => {
                  const selected = allRegions.find(r => r.id === e.target.value);
                  console.log("[regions] selected", { id: e.target.value, name: selected?.name ?? null });
                  set("region_id", e.target.value);
                }}
                disabled={busy || allRegions.length === 0}
                className={inputCls(!!errors.region_id)}
              >
                <option value="">{allRegions.length === 0 ? "Загрузка регионов…" : "— выберите регион —"}</option>
                {allRegions.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </Field>

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
            <Field label="Описание ситуации" required error={errors.description}>
              <textarea
                className={`${inputCls(!!errors.description)} resize-none`}
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
          </FormCard>

          {/* ── 3: Файлы ────────────────────────────────────────────── */}
          <FormCard title="Прикреплённые документы" num="03">
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

          {/* ── 4: Контакты ─────────────────────────────────────────── */}
          <FormCard title="Контактные данные" num="04">
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
                aiStatus === "idle" ? "Создать заказ" : "Создать заказ"
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
