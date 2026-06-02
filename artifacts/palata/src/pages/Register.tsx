import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import {
  ChevronLeft, Building2, GraduationCap, Check,
  Eye, EyeOff,
} from "lucide-react";
import { RegionMultiSelect } from "@/components/RegionMultiSelect";
import { CertificateInputList } from "@/components/CertificateInputList";
import {
  verifyCertificate, mergeDirectionIds, normalizeCertNumber,
  type CertResult,
} from "@/lib/certificates";

type Role = "customer" | "expert";
type Step = "role" | "form" | "success";

function inputClass(extra = "") {
  return `w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30 focus:border-[#0F4C9A] bg-white ${extra}`;
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-slate-700 mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

export default function Register() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("role");
  const [role, setRole] = useState<Role>("customer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);

  const [fullName, setFullName]           = useState("");
  const [email, setEmail]                 = useState("");
  const [password, setPassword]           = useState("");
  const [confirmPwd, setConfirmPwd]       = useState("");
  const [phone, setPhone]                 = useState("");

  const [companyName, setCompanyName]     = useState("");
  const [inn, setInn]                     = useState("");
  const [contactName, setContactName]     = useState("");
  const [notes, setNotes]                 = useState("");

  // Shared region IDs for both customer and expert
  const [regionIds, setRegionIds]         = useState<string[]>([]);

  // All directions — needed for cert → direction fallback lookup
  const [allDirections, setAllDirections] = useState<Array<{ id: string; name: string }>>([]);

  // Expert certificates
  const [certNumbers, setCertNumbers]       = useState<string[]>([""]);
  const [certResults, setCertResults]       = useState<(CertResult | null)[]>([null]);
  const [certVerifying, setCertVerifying]   = useState<boolean[]>([false]);
  // Resolved direction names shown on success screen
  const [registeredDirNames, setRegisteredDirNames] = useState<string[]>([]);
  const [certWarnings, setCertWarnings]             = useState<string[]>([]);

  const PALATA_URL = "https://xn--80aaaio3ae2acfmjkg3n.xn--p1ai/";

  useEffect(() => {
    supabase.from("palata_expertise_directions")
      .select("id, name")
      .order("sort_order")
      .then(({ data }) => setAllDirections(data ?? []));
  }, []);

  const [tripReady, setTripReady]         = useState(false);
  const [palataOk, setPalataOk]           = useState(false);
  const [palataNum, setPalataNum]         = useState("");
  const [centrsudOk, setCentrsudOk]       = useState(false);
  const [centrsudNum, setCentrsudNum]     = useState("");
  const [bio, setBio]                     = useState("");

  function addCert() {
    setCertNumbers(p => [...p, ""]);
    setCertResults(p => [...p, null]);
    setCertVerifying(p => [...p, false]);
  }
  function removeCert(idx: number) {
    setCertNumbers(p => p.filter((_, i) => i !== idx));
    setCertResults(p => p.filter((_, i) => i !== idx));
    setCertVerifying(p => p.filter((_, i) => i !== idx));
  }
  function updateCert(idx: number, val: string) {
    setCertNumbers(p => p.map((v, i) => i === idx ? val : v));
    setCertResults(p => p.map((v, i) => i === idx ? null : v));
  }
  async function verifyCert(idx: number) {
    const raw = certNumbers[idx];
    if (!raw.trim()) return;
    setCertVerifying(p => p.map((v, i) => i === idx ? true : v));
    const result = await verifyCertificate(raw, allDirections, fullName);
    setCertResults(p => p.map((v, i) => i === idx ? result : v));
    setCertVerifying(p => p.map((v, i) => i === idx ? false : v));
  }

  function chooseRole(r: Role) {
    setRole(r);
    setRegionIds([]);
    setStep("form");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) { setError("Введите ФИО"); return; }
    if (password.length < 8) { setError("Пароль должен быть не менее 8 символов"); return; }
    if (password !== confirmPwd) { setError("Пароли не совпадают"); return; }

    setLoading(true);

    // ── Pre-verify certs for expert before signUp ──────────────────────────
    let preVerified: (CertResult | null)[] = [...certResults];
    let verifiedCerts: CertResult[]        = [];
    let newCertWarnings: string[]          = [];

    if (role === "expert") {
      if (!palataOk) {
        setError("Регистрация эксперта возможна только при наличии действующего сертификата Палаты судебных экспертов.");
        setLoading(false);
        return;
      }

      for (let i = 0; i < certNumbers.length; i++) {
        if (certNumbers[i].trim() && !preVerified[i]) {
          preVerified[i] = await verifyCertificate(certNumbers[i], allDirections, fullName);
        }
      }
      setCertResults(preVerified);

      verifiedCerts = preVerified.filter((r): r is CertResult => r?.status === "verified");
      const hasCerts = certNumbers.some(n => n.trim());

      if (!hasCerts || verifiedCerts.length === 0) {
        setError(
          hasCerts
            ? "Не найдено ни одного действующего сертификата. Регистрация эксперта возможна только с действующим сертификатом. " +
              `Новый сертификат можно получить на сайте Палаты: ${PALATA_URL}`
            : "Для регистрации эксперта укажите хотя бы один действующий сертификат."
        );
        setLoading(false);
        return;
      }

      newCertWarnings = certNumbers
        .map((num, i) => ({ num: normalizeCertNumber(num.trim()), result: preVerified[i] }))
        .filter(({ num, result }) => num && result?.status !== "verified")
        .map(({ num }) =>
          `Сертификат ${num} не найден или срок его действия истёк. Он не был добавлен в профиль. ` +
          `Новый сертификат можно получить на сайте Палаты: ${PALATA_URL}`
        );
    }
    // ──────────────────────────────────────────────────────────────────────

    const meta: Record<string, unknown> = {
      role,
      full_name: fullName.trim(),
      phone: phone.trim() || null,
    };

    if (role === "customer") {
      Object.assign(meta, {
        company_name: companyName.trim() || null,
        inn:          inn.trim() || null,
        contact_name: contactName.trim() || null,
        notes:        notes.trim() || null,
        region_id:    regionIds[0] ?? null,
      });
    } else {
      Object.assign(meta, {
        bio:                              bio.trim() || null,
        business_trip_ready:              tripReady,
        palata_registry_verified:         palataOk,
        palata_registry_number:           palataOk ? palataNum.trim() || null : null,
        centrsudexpert_verified:          centrsudOk,
        centrsudexpert_registry_number:   centrsudOk ? centrsudNum.trim() || null : null,
      });
    }

    const { data, error: signUpErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: meta },
    });

    if (signUpErr) {
      setError(signUpErr.message);
      setLoading(false);
      return;
    }

    if (!data.user) {
      setError("Произошла ошибка. Попробуйте ещё раз.");
      setLoading(false);
      return;
    }

    if (data.session) {
      const userId = data.user.id;

      if (role === "customer") {
        const cpPayload = {
          user_id:      userId,
          company_name: companyName.trim() || null,
          inn:          inn.trim() || null,
          contact_name: contactName.trim() || null,
          notes:        notes.trim() || null,
          region_id:    regionIds[0] ?? null,
        };
        console.log("[register] role:", role);
        console.log("[register] regionIds:", regionIds);
        console.log("[register] regionIds[0]:", regionIds[0]);
        console.log("[register] palata_customer_profiles payload:", cpPayload);
        const { data: cpData, error: cpErr } = await supabase.from("palata_customer_profiles").upsert(cpPayload, { onConflict: "user_id" }).select();
        console.log("[register] palata_customer_profiles response → data:", cpData, "error:", cpErr);
      } else {
        const { error: epErr } = await supabase.from("palata_expert_profiles").upsert({
          user_id:                          userId,
          bio:                              bio.trim() || null,
          business_trip_ready:              tripReady,
          accepts_requests:                 true,
          palata_registry_verified:         palataOk,
          palata_registry_number:           palataOk ? palataNum.trim() || null : null,
          centrsudexpert_verified:          centrsudOk,
          centrsudexpert_registry_number:   centrsudOk ? centrsudNum.trim() || null : null,
        }, { onConflict: "user_id" });
        if (epErr) console.error("[register] palata_expert_profiles upsert:", epErr.message);

        // Use pre-verified results (already verified above, before signUp)
        const dirIds   = mergeDirectionIds(verifiedCerts);
        const dirNames = dirIds.map(id => allDirections.find(d => d.id === id)?.name ?? id);
        setRegisteredDirNames(dirNames);
        setCertWarnings(newCertWarnings);

        // Delete + insert directions
        await supabase.from("palata_expert_directions").delete().eq("expert_id", userId);
        if (dirIds.length > 0) {
          const { error: edErr } = await supabase.from("palata_expert_directions").insert(
            dirIds.map(id => ({ expert_id: userId, expertise_direction_id: id }))
          );
          if (edErr) console.error("[register] palata_expert_directions insert:", edErr.message);
        }

        // Save ONLY verified certs
        if (verifiedCerts.length > 0) {
          const { error: ecErr } = await supabase.from("palata_expert_certificates").insert(
            verifiedCerts.map(r => ({
              expert_id:          userId,
              certificate_number: r.number,
              status:             "verified" as const,
              cert_valid_to:      r.validTo ?? null,
              cert_expert_name:   r.expertName ?? null,
              cert_direction_ids: r.directionIds,
            }))
          );
          if (ecErr) console.error("[register] palata_expert_certificates insert:", ecErr.message);
        }

        if (regionIds.length > 0) {
          const { error: erErr } = await supabase.from("palata_expert_regions").insert(
            regionIds.map(id => ({ expert_id: userId, region_id: id }))
          );
          if (erErr) console.error("[register] palata_expert_regions insert:", erErr.message);
        }
      }
      navigate(role === "customer" ? "/customer" : "/expert");
      return;
    }

    // Email-confirmation path: store pre-verified data for success screen
    const dirIds   = mergeDirectionIds(verifiedCerts);
    const dirNames = dirIds.map(id => allDirections.find(d => d.id === id)?.name ?? id);
    setRegisteredDirNames(dirNames);
    setCertWarnings(newCertWarnings);

    setStep("success");
    setLoading(false);
  }

  if (step === "success") {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#F4F4F4] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-4">
          <div className="bg-white rounded-2xl border border-[#D0D0D0] p-8 text-center shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-5">
              <Check className="w-7 h-7 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-[#111111] mb-2">Проверьте email</h2>
            <p className="text-sm text-[#666666] leading-relaxed mb-2">
              Мы отправили письмо на{" "}
              <span className="font-semibold text-[#111111]">{email}</span>.
            </p>
            <p className="text-sm text-[#666666] leading-relaxed mb-6">
              Перейдите по ссылке в письме, чтобы активировать аккаунт.
            </p>
            <Link href="/login">
              <button className="w-full btn-primary">Перейти на страницу входа</button>
            </Link>
          </div>

          {role === "expert" && (
            <>
              {/* Warnings for invalid certs */}
              {certWarnings.map((msg, i) => (
                <div key={i} className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="text-sm text-amber-800 leading-relaxed">{msg}</p>
                </div>
              ))}

              {/* Found directions */}
              <div className="bg-white rounded-2xl border border-[#D0D0D0] p-6 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#666666] mb-3">
                  Направления экспертизы
                </p>
                {registeredDirNames.length > 0 ? (
                  <ul className="space-y-2">
                    {registeredDirNames.map(name => (
                      <li key={name} className="flex items-center gap-2 text-sm text-[#111111]">
                        <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        {name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400">
                    Направления не определены — сертификаты будут проверены вручную.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (step === "role") {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#F4F4F4] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#666666] mb-3">Регистрация</p>
            <h1 className="text-2xl font-bold text-[#111111] mb-2">Кто вы?</h1>
            <p className="text-sm text-[#666666]">Выберите роль для создания аккаунта</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => chooseRole("customer")}
              className="bg-white rounded-2xl border border-[#D0D0D0] p-6 hover:border-[#D0D0D0] hover:shadow-md transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-xl bg-[#F4F4F4] border border-[#D0D0D0] flex items-center justify-center mb-4">
                <Building2 className="w-5 h-5 text-[#002B5C]" />
              </div>
              <p className="text-sm font-bold text-[#111111] mb-1 group-hover:text-[#002B5C] transition-colors">Заказчик</p>
              <p className="text-xs text-[#666666] leading-relaxed">
                Организация или физическое лицо, которому нужна судебная экспертиза
              </p>
            </button>

            <button
              onClick={() => chooseRole("expert")}
              className="bg-white rounded-2xl border border-[#D0D0D0] p-6 hover:border-[#D0D0D0] hover:shadow-md transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-xl bg-[#F4F4F4] border border-[#D0D0D0] flex items-center justify-center mb-4">
                <GraduationCap className="w-5 h-5 text-[#002B5C]" />
              </div>
              <p className="text-sm font-bold text-[#111111] mb-1 group-hover:text-[#002B5C] transition-colors">Эксперт</p>
              <p className="text-xs text-[#666666] leading-relaxed">
                Аккредитованный судебный эксперт, принимающий заказы через платформу
              </p>
            </button>
          </div>

          <p className="text-center text-xs text-[#666666]">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="text-[#002B5C] font-semibold hover:underline">Войти</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#F4F4F4] px-4 py-10">
      <div className="max-w-xl mx-auto">

        <button
          onClick={() => setStep("role")}
          className="flex items-center gap-1.5 text-xs text-[#666666] hover:text-[#002B5C] transition-colors mb-6"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Назад к выбору роли
        </button>

        <div className="mb-6 flex items-center gap-2">
          {role === "customer"
            ? <Building2 className="w-5 h-5 text-[#002B5C]" />
            : <GraduationCap className="w-5 h-5 text-[#002B5C]" />}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#666666]">
              {role === "customer" ? "Регистрация заказчика" : "Регистрация эксперта"}
            </p>
            <h1 className="text-xl font-bold text-[#111111] leading-snug">Создать аккаунт</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div className="bg-white rounded-2xl border border-[#D0D0D0] p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#666666] mb-4">Данные аккаунта</p>
            <div className="space-y-3">
              <div>
                <Label required>ФИО</Label>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                  required placeholder="Иванов Иван Иванович" className={inputClass()} />
                {role === "expert" && (
                  <p className="text-xs text-slate-400 mt-1">
                    Укажите полностью — ФИО используется для проверки сертификата Палаты.
                  </p>
                )}
              </div>
              <div>
                <Label required>Email</Label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required placeholder="example@domain.ru" className={inputClass()} />
              </div>
              <div>
                <Label>Телефон</Label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="+7 (999) 000-00-00" className={inputClass()} />
              </div>
              <div>
                <Label required>Пароль</Label>
                <div className="relative">
                  <input type={showPwd ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                    required minLength={8} placeholder="Не менее 8 символов" className={inputClass("pr-10")} />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label required>Повторите пароль</Label>
                <input type={showPwd ? "text" : "password"} value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                  required placeholder="Повторите пароль" className={inputClass()} />
              </div>
            </div>
          </div>

          {role === "customer" && (
            <div className="bg-white rounded-2xl border border-[#D0D0D0] p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#666666] mb-4">Данные организации</p>
              <div className="space-y-3">
                <div>
                  <Label>Компания / Организация</Label>
                  <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                    placeholder='ООО «Ромашка»' className={inputClass()} />
                </div>
                <div>
                  <Label>ИНН</Label>
                  <input type="text" value={inn} onChange={e => setInn(e.target.value)}
                    placeholder="7700000000" className={inputClass("font-mono")} />
                </div>
                <div>
                  <Label>Контактное лицо</Label>
                  <input type="text" value={contactName} onChange={e => setContactName(e.target.value)}
                    placeholder="Иванов Иван Иванович" className={inputClass()} />
                </div>
                <div>
                  <Label>Регион</Label>
                  <RegionMultiSelect
                    selectedIds={regionIds}
                    onChange={setRegionIds}
                    max={1}
                    placeholder="Выберите регион присутствия…"
                  />
                </div>
                <div>
                  <Label>Примечания</Label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                    placeholder="Дополнительная информация..." className={inputClass("resize-none")} />
                </div>
              </div>
            </div>
          )}

          {role === "expert" && (
            <>
              {/* Регионы работы */}
              <div className="bg-white rounded-2xl border border-[#D0D0D0] p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#666666] mb-3">Регионы работы</p>
                <RegionMultiSelect
                  selectedIds={regionIds}
                  onChange={setRegionIds}
                  placeholder="Выберите регионы работы…"
                />
              </div>

              {/* Статус и реестры */}
              <div className="bg-white rounded-2xl border border-[#D0D0D0] p-5 space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#666666]">Статус и реестры</p>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={tripReady} onChange={e => setTripReady(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#002B5C]" />
                  <div>
                    <p className="text-sm font-medium text-slate-800">Готов к командировкам</p>
                    <p className="text-xs text-slate-400">Выезд в другой регион</p>
                  </div>
                </label>

                {/* Палата: checkbox + сертификаты внутри */}
                <div className="space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={palataOk} onChange={e => setPalataOk(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-[#002B5C]" />
                    <p className="text-sm font-medium text-slate-800">Сертифицирован Палатой судебных экспертов</p>
                  </label>
                  {palataOk ? (
                    <div className="ml-7">
                      <p className="text-xs text-slate-400 mb-3">
                        Введите номера сертификатов. Направления экспертизы определятся автоматически.
                      </p>
                      <CertificateInputList
                        numbers={certNumbers}
                        results={certResults}
                        verifying={certVerifying}
                        onChange={updateCert}
                        onVerify={verifyCert}
                        onAdd={addCert}
                        onRemove={removeCert}
                      />
                    </div>
                  ) : (
                    <p className="ml-7 text-xs text-slate-400">
                      Регистрация эксперта возможна только при наличии действующего сертификата Палаты.
                    </p>
                  )}
                </div>

                {/* СРО ЦСЭ */}
                <div className="space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={centrsudOk} onChange={e => setCentrsudOk(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-[#002B5C]" />
                    <p className="text-sm font-medium text-slate-800">Являюсь участником СРО «ЦСЭ»</p>
                  </label>
                  {centrsudOk && (
                    <input type="text" value={centrsudNum} onChange={e => setCentrsudNum(e.target.value)}
                      placeholder="Номер регистрации" className={inputClass("font-mono ml-7")} />
                  )}
                </div>
              </div>

              {/* Описание опыта */}
              <div className="bg-white rounded-2xl border border-[#D0D0D0] p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#666666] mb-3">Описание опыта</p>
                <textarea value={bio} onChange={e => setBio(e.target.value)} rows={4}
                  placeholder="Опишите ваш опыт, специализации, достижения..."
                  className={inputClass("resize-none")} />
              </div>
            </>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button type="submit" disabled={loading} className="w-full btn-primary py-3 disabled:opacity-50">
            {loading ? "Создание аккаунта…" : "Зарегистрироваться"}
          </button>

          <p className="text-center text-xs text-[#666666] pb-2">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="text-[#002B5C] font-semibold hover:underline">Войти</Link>
          </p>

        </form>
      </div>
    </div>
  );
}
