import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import {
  ChevronLeft, ChevronDown, Building2, GraduationCap, Check, X,
  Eye, EyeOff,
} from "lucide-react";
import { useRef } from "react";

const REGION_OPTIONS = [
  { value: "Moskva",          label: "Москва" },
  { value: "Sankt-Peterburg", label: "Санкт-Петербург" },
  { value: "Krasnodar",       label: "Краснодар" },
  { value: "Nizhny Novgorod", label: "Нижний Новгород" },
  { value: "Ekaterinburg",    label: "Екатеринбург" },
  { value: "Kazan",           label: "Казань" },
  { value: "Rostov-na-Donu",  label: "Ростов-на-Дону" },
  { value: "Novosibirsk",     label: "Новосибирск" },
  { value: "Samara",          label: "Самара" },
  { value: "Voronezh",        label: "Воронеж" },
];

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
  const [region, setRegion]               = useState("");
  const [notes, setNotes]                 = useState("");

  const [selectedDirIds, setSelectedDirIds] = useState<string[]>([]);
  const [directions, setDirections]         = useState<Array<{ id: string; name: string }>>([]);
  const [dirDropOpen, setDirDropOpen]       = useState(false);
  const [dirSearch, setDirSearch]           = useState("");
  const dirDropRef                          = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from("palata_expertise_directions")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setDirections(data ?? []));
  }, []);

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

  const [regions, setRegions]             = useState<string[]>([]);
  const [tripReady, setTripReady]         = useState(false);
  const [palataOk, setPalataOk]           = useState(false);
  const [palataNum, setPalataNum]         = useState("");
  const [centrsudOk, setCentrsudOk]       = useState(false);
  const [centrsudNum, setCentrsudNum]     = useState("");
  const [bio, setBio]                     = useState("");

  const MAX_DIRS = 10;
  function toggleSpec(v: string) {
    setSelectedDirIds(p => {
      if (p.includes(v)) return p.filter(x => x !== v);
      if (p.length >= MAX_DIRS) return p;
      return [...p, v];
    });
  }
  function toggleRegion(v: string) {
    setRegions(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]);
  }

  function chooseRole(r: Role) {
    setRole(r);
    setStep("form");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) { setError("Введите ФИО"); return; }
    if (password.length < 8) { setError("Пароль должен быть не менее 8 символов"); return; }
    if (password !== confirmPwd) { setError("Пароли не совпадают"); return; }

    setLoading(true);

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
        region:       region || null,
        notes:        notes.trim() || null,
      });
    } else {
      Object.assign(meta, {
        bio:                              bio.trim() || null,
        business_trip_ready:              tripReady,
        palata_registry_verified:         palataOk,
        palata_registry_number:           palataOk ? palataNum.trim() || null : null,
        centrsudexpert_verified:          centrsudOk,
        centrsudexpert_registry_number:   centrsudOk ? centrsudNum.trim() || null : null,
        specializations: [],
        regions,
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
      if (role === "customer") {
        await supabase.from("palata_customer_profiles").upsert({
          user_id:      data.user.id,
          company_name: companyName.trim() || null,
          inn:          inn.trim() || null,
          contact_name: contactName.trim() || null,
          region:       region || null,
          notes:        notes.trim() || null,
        }, { onConflict: "user_id" });
      } else {
        await supabase.from("palata_expert_profiles").upsert({
          user_id:                          data.user.id,
          bio:                              bio.trim() || null,
          business_trip_ready:              tripReady,
          accepts_requests:                 true,
          palata_registry_verified:         palataOk,
          palata_registry_number:           palataOk ? palataNum.trim() || null : null,
          centrsudexpert_verified:          centrsudOk,
          centrsudexpert_registry_number:   centrsudOk ? centrsudNum.trim() || null : null,
          specializations: [],
          regions,
        }, { onConflict: "user_id" });
        if (selectedDirIds.length > 0 && data?.user) {
          await supabase.from("palata_expert_directions").insert(
            selectedDirIds.map(id => ({ expert_id: data.user!.id, expertise_direction_id: id }))
          );
        }
      }
      navigate(role === "customer" ? "/customer" : "/expert");
      return;
    }

    setStep("success");
    setLoading(false);
  }

  if (step === "success") {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#F4F4F4] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
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
                  <select value={region} onChange={e => setRegion(e.target.value)} className={inputClass()}>
                    <option value="">Выберите регион</option>
                    {REGION_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
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
              <div className="bg-white rounded-2xl border border-[#D0D0D0] p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#666666]">Направления экспертизы</p>
                  <span className="text-[10px] text-slate-400">{selectedDirIds.length}/{MAX_DIRS}</span>
                </div>

                {/* Dropdown multiselect */}
                <div className="relative" ref={dirDropRef}>
                  <button
                    type="button"
                    onClick={() => setDirDropOpen(v => !v)}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30 focus:border-[#0F4C9A] hover:border-slate-300 transition-colors"
                  >
                    <span className={selectedDirIds.length === 0 ? "text-slate-400" : "text-[#111111]"}>
                      {selectedDirIds.length === 0
                        ? "Выберите направления экспертизы…"
                        : `Выбрано направлений: ${selectedDirIds.length}`}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${dirDropOpen ? "rotate-180" : ""}`} />
                  </button>

                  {dirDropOpen && (
                    <div className="absolute z-20 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                      {/* Search */}
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

                      {/* List */}
                      <div className="max-h-56 overflow-y-auto">
                        {directions
                          .filter(d => d.name.toLowerCase().includes(dirSearch.toLowerCase()))
                          .map(d => {
                            const sel = selectedDirIds.includes(d.id);
                            const disabled = !sel && selectedDirIds.length >= MAX_DIRS;
                            return (
                              <button
                                key={d.id}
                                type="button"
                                disabled={disabled}
                                onClick={() => toggleSpec(d.id)}
                                className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5 transition-colors ${
                                  disabled
                                    ? "opacity-40 cursor-not-allowed"
                                    : sel
                                    ? "bg-[#F0F4FF] text-[#002B5C]"
                                    : "hover:bg-[#F4F4F4] text-[#111111]"
                                }`}
                              >
                                <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
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

                      {selectedDirIds.length >= MAX_DIRS && (
                        <div className="px-3 py-2 border-t border-slate-100 bg-amber-50">
                          <p className="text-[11px] text-amber-700">Выбрано максимальное количество направлений ({MAX_DIRS})</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Selected chips */}
                {selectedDirIds.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedDirIds.map(id => {
                      const d = directions.find(x => x.id === id);
                      return (
                        <span key={id} className="inline-flex items-center gap-1 text-xs bg-[#002B5C] text-white px-2.5 py-1 rounded-full">
                          {d?.name ?? id}
                          <button type="button" onClick={() => toggleSpec(id)} className="hover:opacity-70 transition-opacity ml-0.5">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-[#D0D0D0] p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#666666] mb-3">Регионы работы</p>
                <div className="flex flex-wrap gap-2">
                  {REGION_OPTIONS.map(r => (
                    <button key={r.value} type="button" onClick={() => toggleRegion(r.value)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
                        regions.includes(r.value)
                          ? "bg-[#002B5C] text-white border-[#002B5C]"
                          : "bg-white text-slate-600 border-slate-200 hover:border-[#D0D0D0] hover:text-[#002B5C]"
                      }`}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

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

                <div className="space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={palataOk} onChange={e => setPalataOk(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-[#002B5C]" />
                    <p className="text-sm font-medium text-slate-800">Зарегистрирован в Палате судебных экспертов</p>
                  </label>
                  {palataOk && (
                    <input type="text" value={palataNum} onChange={e => setPalataNum(e.target.value)}
                      placeholder="Номер регистрации" className={inputClass("font-mono ml-7")} />
                  )}
                </div>

                <div className="space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={centrsudOk} onChange={e => setCentrsudOk(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-[#002B5C]" />
                    <p className="text-sm font-medium text-slate-800">Зарегистрирован в Центр судебных экспертиз</p>
                  </label>
                  {centrsudOk && (
                    <input type="text" value={centrsudNum} onChange={e => setCentrsudNum(e.target.value)}
                      placeholder="Номер регистрации" className={inputClass("font-mono ml-7")} />
                  )}
                </div>
              </div>

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
