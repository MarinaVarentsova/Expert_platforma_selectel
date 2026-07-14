import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getToken } from "@/lib/authClient";
import AdminLayout from "@/components/AdminLayout";
import { useRequireRole } from "@/lib/useRequireRole";
import {
  User, Star, CheckCircle2, XCircle, Search,
  ChevronRight, Phone, Mail, Briefcase, MapPin, Save, X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExpertRow = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  avg_customer_rating: number | null;
  completed_orders_count: number;
  experience_years: number | null;
  bio: string | null;
  accepts_requests: boolean;
  business_trip_ready: boolean;
  palata_registry_verified: boolean;
  palata_registry_number: string | null;
  centrsudexpert_verified: boolean;
  centrsudexpert_registry_number: string | null;
  profile_status: string | null;
  directions: string[];
  regions: string[];
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminExperts() {
  const guard = useRequireRole("admin");
  const [experts, setExperts] = useState<ExpertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ExpertRow | null>(null);

  async function loadExperts() {
    setLoading(true);
    const { data: users } = await supabase
      .from("palata_users")
      .select("id, full_name, email, phone")
      .eq("role", "expert")
      .order("full_name");

    if (!users || users.length === 0) { setLoading(false); return; }

    const ids = (users as { id: string }[]).map(u => u.id);

    const [{ data: profiles }, { data: expDirs }, { data: expRegs }] = await Promise.all([
      fetch(`/api/palata/expert-profile?user_ids=${encodeURIComponent(ids.join(","))}`)
        .then(r => r.json())
        .then(b => ({ data: (b.rows ?? []) as PRow[] }))
        .catch(() => ({ data: [] as PRow[] })),
      fetch(`/api/palata/expert-directions?expert_ids=${encodeURIComponent(ids.join(","))}`)
        .then(r => r.json())
        .then(b => ({
          data: (b.rows ?? []).map((r: { expert_id: string; expertise_direction_id: string; direction_name: string | null }) => ({
            expert_id: r.expert_id,
            palata_expertise_directions: r.direction_name ? [{ name: r.direction_name }] : [],
          })) as DRow[],
        }))
        .catch(() => ({ data: [] as DRow[] })),
      fetch(`/api/palata/expert-regions?expert_ids=${encodeURIComponent(ids.join(","))}`)
        .then(r => r.json())
        .then(b => ({
          data: (b.rows ?? []).map((r: { expert_id: string; region_id: string; region_name: string | null }) => ({
            expert_id: r.expert_id,
            palata_regions: r.region_name ? { name: r.region_name } : null,
          })) as RRow[],
        }))
        .catch(() => ({ data: [] as RRow[] })),
    ]);

    type PRow = {
      user_id: string; experience_years: number | null; bio: string | null;
      accepts_requests: boolean; business_trip_ready: boolean;
      palata_registry_verified: boolean; palata_registry_number: string | null;
      centrsudexpert_verified: boolean; centrsudexpert_registry_number: string | null;
      avg_customer_rating: number | null; completed_orders_count: number; status: string | null;
    };
    type DRow = { expert_id: string; palata_expertise_directions: { name: string }[] };
    type RRow = { expert_id: string; palata_regions: { name: string }[] };

    const pMap: Record<string, PRow> = {};
    for (const p of (profiles ?? []) as PRow[]) pMap[p.user_id] = p;

    const dirMap: Record<string, string[]> = {};
    for (const d of (expDirs ?? []) as unknown as DRow[]) {
      if (!dirMap[d.expert_id]) dirMap[d.expert_id] = [];
      const dirs = Array.isArray(d.palata_expertise_directions)
        ? d.palata_expertise_directions
        : d.palata_expertise_directions ? [d.palata_expertise_directions] : [];
      for (const dir of dirs) if (dir?.name) dirMap[d.expert_id].push(dir.name);
    }

    const regMap: Record<string, string[]> = {};
    for (const r of (expRegs ?? []) as unknown as RRow[]) {
      if (!regMap[r.expert_id]) regMap[r.expert_id] = [];
      const regs = Array.isArray(r.palata_regions)
        ? r.palata_regions
        : r.palata_regions ? [r.palata_regions] : [];
      for (const reg of regs) if (reg?.name) regMap[r.expert_id].push(reg.name);
    }

    const rows: ExpertRow[] = (users as { id: string; full_name: string | null; email: string; phone: string | null }[]).map(u => {
      const p = pMap[u.id];
      return {
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        phone: u.phone,
        avg_customer_rating: p?.avg_customer_rating ?? null,
        completed_orders_count: p?.completed_orders_count ?? 0,
        experience_years: p?.experience_years ?? null,
        bio: p?.bio ?? null,
        accepts_requests: p?.accepts_requests ?? false,
        business_trip_ready: p?.business_trip_ready ?? false,
        palata_registry_verified: p?.palata_registry_verified ?? false,
        palata_registry_number: p?.palata_registry_number ?? null,
        centrsudexpert_verified: p?.centrsudexpert_verified ?? false,
        centrsudexpert_registry_number: p?.centrsudexpert_registry_number ?? null,
        profile_status: p?.status ?? null,
        directions: dirMap[u.id] ?? [],
        regions: regMap[u.id] ?? [],
      };
    });

    setExperts(rows);
    setLoading(false);
  }

  useEffect(() => {
    if (guard.status !== "ok") return;
    loadExperts();
  }, [guard.status]);

  if (guard.status === "loading" || guard.status === "redirecting") {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="h-5 w-5 rounded-full border-2 border-[#D0D0D0] border-t-[#002B5C] animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  const filtered = experts.filter(e => {
    const q = search.toLowerCase();
    return (
      !q ||
      e.full_name?.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      e.directions.some(d => d.toLowerCase().includes(q))
    );
  });

  return (
    <AdminLayout>
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-screen-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-900">Эксперты</h1>
          <p className="text-xs text-slate-400 mt-0.5">Управление профилями и верификацией экспертов</p>
        </div>

        <div className="flex gap-6">
          {/* ── List ───────────────────────────────── */}
          <div className={`flex flex-col ${selected ? "w-80 shrink-0" : "flex-1"}`}>
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск по имени, email, направлению…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/20 focus:border-[#0F4C9A]"
              />
            </div>

            {loading ? (
              <div className="flex items-center gap-2 py-10 text-sm text-slate-400">
                <div className="h-4 w-4 rounded-full border-2 border-[#D0D0D0] border-t-[#002B5C] animate-spin" />
                Загрузка…
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm">Эксперты не найдены</div>
            ) : (
              <div className="space-y-2">
                {filtered.map(e => (
                  <ExpertListRow
                    key={e.id}
                    expert={e}
                    active={selected?.id === e.id}
                    compact={!!selected}
                    onClick={() => setSelected(prev => prev?.id === e.id ? null : e)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Detail panel ───────────────────────── */}
          {selected && (
            <div className="flex-1 min-w-0">
              <ExpertDetailPanel
                expert={selected}
                onClose={() => setSelected(null)}
                onSaved={async (updated) => {
                  await loadExperts();
                  setSelected(updated);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

// ─── List row ────────────────────────────────────────────────────────────────

function ExpertListRow({ expert: e, active, compact, onClick }: {
  expert: ExpertRow;
  active: boolean;
  compact: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-3.5 transition-all group ${
        active
          ? "border-[#0F4C9A] bg-[#F0F4FF] shadow-sm"
          : "border-slate-100 bg-white hover:border-[#D0D0D0] hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* Name */}
          <p className="text-sm font-semibold text-slate-800 truncate">
            {e.full_name ?? <span className="text-slate-400 italic">Без имени</span>}
          </p>
          {/* Email */}
          <p className="text-xs text-slate-400 truncate mt-0.5">{e.email}</p>

          {!compact && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {/* Rating */}
              {e.avg_customer_rating != null && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">
                  <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                  {Number(e.avg_customer_rating).toFixed(1)}
                </span>
              )}
              {/* Verified badges */}
              {e.palata_registry_verified && (
                <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">Палата ✓</span>
              )}
              {e.centrsudexpert_verified && (
                <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">ЦСЭ ✓</span>
              )}
              {/* Directions */}
              {e.directions.slice(0, 2).map(d => (
                <span key={d} className="text-[10px] text-slate-500 bg-[#F4F4F4] px-1.5 py-0.5 rounded-full truncate max-w-[140px]">{d}</span>
              ))}
            </div>
          )}

          {compact && e.avg_customer_rating != null && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 mt-1">
              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
              {Number(e.avg_customer_rating).toFixed(1)}
            </span>
          )}
        </div>
        <ChevronRight className={`w-4 h-4 shrink-0 mt-0.5 transition-transform ${active ? "rotate-90 text-[#0F4C9A]" : "text-slate-300 group-hover:text-slate-400"}`} />
      </div>
    </button>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function ExpertDetailPanel({ expert: e, onClose, onSaved }: {
  expert: ExpertRow;
  onClose: () => void;
  onSaved: (updated: ExpertRow) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  // Editable fields
  const [fullName, setFullName]     = useState(e.full_name ?? "");
  const [phone, setPhone]           = useState(e.phone ?? "");
  const [bio, setBio]               = useState(e.bio ?? "");
  const [expYears, setExpYears]     = useState(e.experience_years?.toString() ?? "");
  const [tripReady, setTripReady]   = useState(e.business_trip_ready);
  const [accepts, setAccepts]       = useState(e.accepts_requests);
  const [palataOk, setPalataOk]     = useState(e.palata_registry_verified);
  const [palataNum, setPalataNum]   = useState(e.palata_registry_number ?? "");
  const [centrsudOk, setCentrsudOk] = useState(e.centrsudexpert_verified);
  const [centrsudNum, setCentrsudNum] = useState(e.centrsudexpert_registry_number ?? "");
  const [completedCount, setCompletedCount] = useState(e.completed_orders_count.toString());
  const [saving, setSaving]         = useState(false);
  const [saveErr, setSaveErr]       = useState<string | null>(null);
  const [savedOk, setSavedOk]       = useState(false);

  // Reset when expert changes
  useEffect(() => {
    setEditing(false);
    setFullName(e.full_name ?? "");
    setPhone(e.phone ?? "");
    setBio(e.bio ?? "");
    setExpYears(e.experience_years?.toString() ?? "");
    setTripReady(e.business_trip_ready);
    setAccepts(e.accepts_requests);
    setPalataOk(e.palata_registry_verified);
    setPalataNum(e.palata_registry_number ?? "");
    setCentrsudOk(e.centrsudexpert_verified);
    setCentrsudNum(e.centrsudexpert_registry_number ?? "");
    setCompletedCount(e.completed_orders_count.toString());
    setSaveErr(null);
    setSavedOk(false);
  }, [e.id]);

  async function handleSave() {
    setSaving(true);
    setSaveErr(null);
    const [r1, r2] = await Promise.all([
      fetch(`/api/palata/admin/users/${encodeURIComponent(e.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ full_name: fullName.trim() || null, phone: phone.trim() || null }),
      }).then(r => r.json()).then((b: { success: boolean; error?: string }) => ({
        error: b.success ? null : { message: b.error ?? "user update failed" },
      })).catch((e: unknown) => ({ error: { message: String(e) } })),
      fetch("/api/palata/expert-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id:                        e.id,
          bio:                            bio.trim() || null,
          experience_years:               expYears ? parseInt(expYears) : null,
          business_trip_ready:            tripReady,
          accepts_requests:               accepts,
          palata_registry_verified:       palataOk,
          palata_registry_number:         palataOk ? palataNum.trim() || null : null,
          centrsudexpert_verified:        centrsudOk,
          centrsudexpert_registry_number: centrsudOk ? centrsudNum.trim() || null : null,
          completed_orders_count:         parseInt(completedCount) || 0,
        }),
      })
        .then(r => r.json())
        .then(b => ({ error: b.success ? null : { message: b.message ?? "Expert profile upsert failed" } }))
        .catch((e: unknown) => ({ error: { message: String(e) } })),
    ]);
    if (r1.error || r2.error) {
      setSaveErr((r1.error ?? r2.error)!.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    setEditing(false);
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 3000);
    const updated: ExpertRow = {
      ...e,
      full_name: fullName.trim() || null,
      phone: phone.trim() || null,
      bio: bio.trim() || null,
      experience_years: expYears ? parseInt(expYears) : null,
      business_trip_ready: tripReady,
      accepts_requests: accepts,
      palata_registry_verified: palataOk,
      palata_registry_number: palataOk ? palataNum.trim() || null : null,
      centrsudexpert_verified: centrsudOk,
      centrsudexpert_registry_number: centrsudOk ? centrsudNum.trim() || null : null,
      completed_orders_count: parseInt(completedCount) || 0,
    };
    await onSaved(updated);
  }

  const ic = "w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/20 focus:border-[#0F4C9A] bg-white";

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-slate-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-9 h-9 rounded-full bg-[#0F4C9A] flex items-center justify-center flex-shrink-0">
              <User className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-900 leading-tight">
                {e.full_name ?? <span className="italic text-slate-400">Без имени</span>}
              </p>
              <p className="text-xs text-slate-400">{e.email}</p>
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex flex-wrap gap-2 mt-3">
            {e.avg_customer_rating != null && (
              <Chip icon={<Star className="w-3 h-3 fill-amber-400 text-amber-400" />} text={`${Number(e.avg_customer_rating).toFixed(1)} рейтинг`} cls="text-amber-700 bg-amber-50 border-amber-100" />
            )}
            {e.experience_years != null && (
              <Chip icon={<Briefcase className="w-3 h-3" />} text={`${e.experience_years} лет опыта`} cls="text-slate-600 bg-[#F4F4F4] border-slate-200" />
            )}
            {e.completed_orders_count > 0 && (
              <Chip icon={<CheckCircle2 className="w-3 h-3 text-emerald-500" />} text={`${e.completed_orders_count} заказов`} cls="text-emerald-700 bg-emerald-50 border-emerald-100" />
            )}
            {e.phone && (
              <Chip icon={<Phone className="w-3 h-3" />} text={e.phone} cls="text-slate-600 bg-[#F4F4F4] border-slate-200" />
            )}
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-[#F4F4F4] rounded-lg transition-colors flex-shrink-0 ml-2">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="p-5 space-y-5">

        {/* Verification */}
        <Section title="Верификация">
          {editing ? (
            <div className="space-y-3">
              <Toggle checked={palataOk} onChange={setPalataOk} label="Реестр Палаты судебных экспертов" />
              {palataOk && (
                <input value={palataNum} onChange={e => setPalataNum(e.target.value)} placeholder="Номер в реестре" className={ic} />
              )}
              <Toggle checked={centrsudOk} onChange={setCentrsudOk} label="Реестр ЦСЭ" />
              {centrsudOk && (
                <input value={centrsudNum} onChange={e => setCentrsudNum(e.target.value)} placeholder="Номер в реестре ЦСЭ" className={ic} />
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <VerifBadge ok={e.palata_registry_verified} label="Палата" num={e.palata_registry_number} />
              <VerifBadge ok={e.centrsudexpert_verified} label="ЦСЭ" num={e.centrsudexpert_registry_number} />
            </div>
          )}
        </Section>

        {/* Directions */}
        {e.directions.length > 0 && (
          <Section title="Направления экспертизы">
            <div className="flex flex-wrap gap-1.5">
              {e.directions.map(d => (
                <span key={d} className="text-xs bg-[#F4F4F4] text-slate-600 px-2.5 py-1 rounded-full border border-slate-200">{d}</span>
              ))}
            </div>
          </Section>
        )}

        {/* Regions */}
        {e.regions.length > 0 && (
          <Section title="Регионы работы">
            <div className="flex flex-wrap gap-1.5">
              {e.regions.map(r => (
                <span key={r} className="inline-flex items-center gap-1 text-xs text-slate-600 bg-[#F4F4F4] px-2.5 py-1 rounded-full border border-slate-200">
                  <MapPin className="w-2.5 h-2.5 text-slate-400" />{r}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Profile data */}
        <Section title="Профиль">
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">ФИО</label>
                <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Полное имя" className={ic} />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Телефон</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7..." className={ic} />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">О себе</label>
                <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} placeholder="Описание профиля" className={ic + " resize-none"} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Опыт (лет)</label>
                  <input type="number" min={0} value={expYears} onChange={e => setExpYears(e.target.value)} placeholder="0" className={ic} />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Завершено заказов</label>
                  <input type="number" min={0} value={completedCount} onChange={e => setCompletedCount(e.target.value)} className={ic} />
                </div>
              </div>
              <Toggle checked={tripReady} onChange={setTripReady} label="Готов к командировкам" />
              <Toggle checked={accepts} onChange={setAccepts} label="Принимает заявки" />
            </div>
          ) : (
            <dl className="space-y-2">
              {e.phone && <Row label="Телефон" icon={<Phone className="w-3 h-3" />}>{e.phone}</Row>}
              {e.bio && <Row label="О себе" icon={<Mail className="w-3 h-3" />}>{e.bio}</Row>}
              {e.experience_years != null && <Row label="Опыт">{e.experience_years} лет</Row>}
              <Row label="Командировки">{e.business_trip_ready ? "Готов" : "Нет"}</Row>
              <Row label="Принимает заявки">{e.accepts_requests ? "Да" : "Нет"}</Row>
            </dl>
          )}
        </Section>

        {/* Save error */}
        {saveErr && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{saveErr}</div>
        )}
        {savedOk && (
          <div className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Сохранено
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0F4C9A] text-white rounded-xl hover:bg-[#002B5C] transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? "Сохранение…" : "Сохранить"}
              </button>
              <button
                onClick={() => { setEditing(false); setSaveErr(null); }}
                className="px-4 py-2 text-xs font-semibold border border-slate-200 rounded-xl text-slate-600 hover:bg-[#F4F4F4] transition-colors"
              >
                Отмена
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0F4C9A] text-white rounded-xl hover:bg-[#002B5C] transition-colors"
            >
              Редактировать профиль
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-xs text-slate-400 shrink-0 w-28">{label}</span>
      {icon && <span className="text-slate-300 mt-0.5">{icon}</span>}
      <span className="text-xs text-slate-700">{children}</span>
    </div>
  );
}

function Chip({ icon, text, cls }: { icon: React.ReactNode; text: string; cls: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      {icon}{text}
    </span>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        className={`relative w-8 h-4.5 rounded-full transition-colors ${checked ? "bg-[#0F4C9A]" : "bg-slate-200"}`}
        style={{ height: "1.125rem" }}
        onClick={() => onChange(!checked)}
      >
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${checked ? "left-4" : "left-0.5"}`} />
      </div>
      <span className="text-xs text-slate-600">{label}</span>
    </label>
  );
}

function VerifBadge({ ok, label, num }: { ok: boolean; label: string; num: string | null }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
      <CheckCircle2 className="w-3 h-3" />{label}{num ? ` #${num}` : ""}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-slate-400 bg-[#F4F4F4] border border-slate-200 px-2.5 py-1 rounded-full">
      <XCircle className="w-3 h-3" />{label}
    </span>
  );
}
