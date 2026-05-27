import { supabase } from "./supabaseClient";
import { createActionItem } from "./actionItems";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExpertForMatching = {
  user_id: string;
  specializations: string[];
  regions: string[];
  business_trip_ready: boolean;
  palata_registry_verified: boolean;
  palata_registry_number: string | null;
  centrsudexpert_verified: boolean;
  centrsudexpert_registry_number: string | null;
  avg_customer_rating: number | null;
  completed_orders_count: number;
  decline_rate: number | null;
};

export type MatchingInput = {
  requestId: string;
  expertiseType: string;
  region: string;
  requiresTravel: boolean;
  customerId?: string;
};

export type MatchingResult = {
  matched: number;
  round: number;
  experts: Array<{ expertId: string; score: number }>;
};

// ─── Expertise mapping: Russian display → DB transliterated values ────────────

const EXPERTISE_ALIASES: Record<string, string[]> = {
  "Строительно-техническая": ["stroitelno-tehnicheskaya"],
  "Оценочная": ["ocenochnaya"],
  "Почерковедческая": ["pocherkovedcheskaya", "pocherkovedcheskaya"],
  "Авторедческая (документов)": ["avtorovedcheskaya"],
  "Автотехническая": ["avtotechnicheskaya"],
  "Трасологическая": ["trasologicheskaya"],
  "Бухгалтерская": ["buhgalterskaya"],
  "Финансово-экономическая": ["finansovo-ekonomicheskaya"],
  "Пожарно-техническая": ["pozharno-tehnicheskaya"],
  "Электротехническая": ["elektrotehnicheskaya"],
  "Психологическая": ["psihologicheskaya"],
  "Психиатрическая": ["psihiatricheskaya"],
  "Землеустроительная": ["zemleustroitelnaya"],
  "Экологическая": ["ekologicheskaya"],
  "Товароведческая": ["tovarovedcheskaya"],
  "Компьютерно-техническая": ["kompyuterno-tehnicheskaya", "komp-yuterno-tehnicheskaya"],
  "Медицинская": ["medicinskaya"],
};

// ─── Region mapping: Russian display → DB values ──────────────────────────────

const REGION_ALIASES: Record<string, string[]> = {
  "Москва": ["Moskva"],
  "Московская область": ["Moskovskaya oblast"],
  "Санкт-Петербург": ["Sankt-Peterburg"],
  "Ленинградская область": ["Leningradskaya oblast"],
  "Краснодарский край": ["Krasnodar", "Krasnodarskij kraj"],
  "Новосибирская область": ["Novosibirskaya oblast"],
  "Свердловская область": ["Sverdlovskaya oblast"],
  "Республика Татарстан": ["Tatarstan"],
  "Нижегородская область": ["Nizhegorodskaya oblast"],
  "Ростовская область": ["Rostovskaya oblast"],
  "Челябинская область": ["Chelyabinskaya oblast"],
  "Самарская область": ["Samarskaya oblast"],
  "Республика Башкортостан": ["Ufa", "Bashkortostan"],
  "Омская область": ["Omskaya oblast"],
  "Красноярский край": ["Krasnoyarskij kraj"],
  "Воронежская область": ["Voronezhskaya oblast"],
  "Пермский край": ["Permskij kraj"],
  "Волгоградская область": ["Volgogradskaya oblast"],
  "Саратовская область": ["Saratovskaya oblast"],
  "Тверская область": ["Tverskaya oblast"],
  "Калужская область": ["Kaluzhskaya oblast"],
  "Ивановская область": ["Ivanovskaya oblast"],
  "Иваново": ["Ivanovo"],
};

// ─── Matching helpers ─────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/ё/g, "е");
}

function expertiseMatches(requestType: string, specializations: string[]): boolean {
  const rn = norm(requestType);
  for (const s of specializations) {
    if (norm(s) === rn) return true;
  }
  const aliases = EXPERTISE_ALIASES[requestType] ?? [];
  for (const s of specializations) {
    if (aliases.some(a => norm(a) === norm(s))) return true;
  }
  // Fuzzy fallback: substring or shared tokens
  const rTokens = rn.split(/[\s\-]+/);
  for (const s of specializations) {
    const sn = norm(s);
    if (rn.includes(sn) || sn.includes(rn)) return true;
    const sTokens = sn.split(/[\s\-]+/);
    const shared = rTokens.filter(t => t.length > 3 && sTokens.some(st => st.includes(t) || t.includes(st)));
    if (shared.length > 0) return true;
  }
  return false;
}

function regionMatches(requestRegion: string, expertRegions: string[]): boolean {
  const rn = norm(requestRegion);
  for (const r of expertRegions) {
    if (norm(r) === rn) return true;
  }
  const aliases = REGION_ALIASES[requestRegion] ?? [];
  for (const r of expertRegions) {
    if (aliases.some(a => norm(a) === norm(r))) return true;
  }
  // Fuzzy fallback
  for (const r of expertRegions) {
    const rNorm = norm(r);
    if (rn.includes(rNorm) || rNorm.includes(rn)) return true;
  }
  return false;
}

function scoreExpert(
  expert: ExpertForMatching,
  regionMatch: boolean,
  requiresTravel: boolean,
): number {
  let score = 0;

  // ── Geography (highest weight) ────────────────────────────────────────────
  if (regionMatch) {
    score += 100; // In-region: top priority
  } else if (!requiresTravel) {
    // Remote-ok: any expert regardless of travel readiness can participate
    score += 0;
  } else if (expert.business_trip_ready) {
    score += 20; // Travel required, expert can travel
  }
  // else: travel required, expert can't → filtered out before scoring

  // ── Professional verification ─────────────────────────────────────────────
  if (expert.palata_registry_verified) score += 30;
  if (expert.palata_registry_number)   score += 10;
  if (expert.centrsudexpert_verified)  score += 20;
  if (expert.centrsudexpert_registry_number) score += 10;

  // ── Rating (1–5 scale → 0–50 pts) ────────────────────────────────────────
  if (expert.avg_customer_rating != null) {
    score += expert.avg_customer_rating * 10;
  }

  // ── Completed orders (up to 20 pts) ──────────────────────────────────────
  score += Math.min(expert.completed_orders_count, 10) * 2;

  // ── Decline-rate penalty (0–1 → 0–30 penalty pts) ────────────────────────
  if (expert.decline_rate != null) {
    score -= expert.decline_rate * 30;
  }

  return Math.round(score);
}

// ─── Main matching function ───────────────────────────────────────────────────

export async function runMatching(input: MatchingInput): Promise<MatchingResult> {
  const { requestId, expertiseType, region, requiresTravel } = input;

  // 1. Experts already declined or withdrawn from this request
  const { data: prevMatches } = await supabase
    .from("palata_request_matches")
    .select("expert_id, matching_round, status")
    .eq("request_id", requestId);

  const declinedIds = new Set(
    (prevMatches ?? [])
      .filter(m => m.status === "declined" || m.status === "withdrawn")
      .map(m => m.expert_id as string),
  );

  // Already proposed in any round (don't re-propose until they respond or decline)
  const activelyProposedIds = new Set(
    (prevMatches ?? [])
      .filter(m => !["declined", "withdrawn", "closed_by_other_expert"].includes(m.status))
      .map(m => m.expert_id as string),
  );

  // Compute next round
  const rounds = (prevMatches ?? []).map(m => m.matching_round as number);
  const nextRound = rounds.length > 0 ? Math.max(...rounds) + 1 : 1;

  // 2. Fetch active experts
  const { data: experts, error } = await supabase
    .from("palata_expert_profiles")
    .select([
      "user_id", "specializations", "regions", "business_trip_ready",
      "palata_registry_verified", "palata_registry_number",
      "centrsudexpert_verified", "centrsudexpert_registry_number",
      "avg_customer_rating", "completed_orders_count", "decline_rate",
    ].join(", "))
    .eq("status", "active")
    .eq("accepts_requests", true);

  if (error || !experts) throw new Error(error?.message ?? "Failed to fetch experts");

  // 3. Filter + score
  const candidates: Array<{ expertId: string; score: number }> = [];

  for (const e of experts as unknown as ExpertForMatching[]) {
    // Skip if already proposed and awaiting response
    if (activelyProposedIds.has(e.user_id)) continue;
    // Skip if previously declined
    if (declinedIds.has(e.user_id)) continue;
    // Expertise must match (hard filter)
    if (!expertiseMatches(expertiseType, e.specializations)) continue;

    const regMatch = regionMatches(region, e.regions);

    // Geography hard filter only when travel is required
    if (requiresTravel && !regMatch && !e.business_trip_ready) continue;

    const score = scoreExpert(e, regMatch, requiresTravel);
    candidates.push({ expertId: e.user_id, score });
  }

  // 4. Sort by score descending, take top 5
  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates.slice(0, 5);

  // 5. Persist results
  if (selected.length === 0) {
    // No experts found → status = matching (visible as problematic in admin)
    await supabase.from("palata_requests")
      .update({ status: "matching" })
      .eq("id", requestId);

    // Status transition event
    await supabase.from("palata_status_events").insert({
      entity_type: "request", entity_id: requestId,
      old_status: "new", new_status: "matching",
      actor_id: null,
      note: "Автоподбор: подходящие эксперты не найдены — требуется ручной подбор",
    });

    // no_experts_found event (separate event type per spec)
    await supabase.from("palata_status_events").insert({
      entity_type: "request", entity_id: requestId,
      old_status: "matching", new_status: "matching",
      actor_id: null,
      note: `no_experts_found: раунд ${nextRound}, кандидатов после фильтрации: 0`,
    });

    // Action item → customer: inform them matching failed
    if (input.customerId) {
      try {
        await createActionItem({
          request_id: requestId,
          expert_id: null,
          customer_id: input.customerId,
          assigned_to_user_id: input.customerId,
          assigned_role: "customer",
          action_type: "manual_matching_required",
          title: "Эксперты не найдены автоматически",
          description: "По вашему заказу не удалось подобрать экспертов. Администратор займётся подбором вручную.",
          payload: { round: nextRound },
        });
      } catch { /* non-fatal */ }
    }

    // Action item → admin: manual matching required
    try {
      const { data: admins } = await supabase
        .from("palata_users")
        .select("id")
        .eq("role", "admin")
        .eq("is_active", true);

      for (const admin of admins ?? []) {
        await createActionItem({
          request_id: requestId,
          expert_id: null,
          customer_id: input.customerId ?? null,
          assigned_to_user_id: admin.id,
          assigned_role: "admin",
          action_type: "manual_matching_required",
          title: "Требуется ручной подбор эксперта",
          description: `Автоподбор не нашёл кандидатов (раунд ${nextRound}). Назначьте эксперта вручную.`,
          payload: { round: nextRound, request_id: requestId },
        });
      }
    } catch { /* non-fatal */ }

    return { matched: 0, round: nextRound, experts: [] };
  }

  // Insert match records
  const { error: insertErr } = await supabase.from("palata_request_matches").insert(
    selected.map(s => ({
      request_id: requestId,
      expert_id: s.expertId,
      matching_round: nextRound,
      status: "proposed",
    })),
  );
  if (insertErr) throw new Error(insertErr.message);

  // Update request: status → expert_selection, matching_round → nextRound
  await supabase.from("palata_requests")
    .update({ status: "expert_selection", matching_round: nextRound })
    .eq("id", requestId);

  await supabase.from("palata_status_events").insert({
    entity_type: "request", entity_id: requestId,
    old_status: "new", new_status: "expert_selection",
    actor_id: null,
    note: `Автоподбор раунд ${nextRound}: ${selected.length} эксперт(ов) предложено`,
  });

  // Notify customer that experts have been found
  if (input.customerId) {
    const n = selected.length;
    const suffix = n === 1 ? "а" : n < 5 ? "а" : "ов";
    try {
      await createActionItem({
        request_id: requestId,
        expert_id: null,
        customer_id: input.customerId,
        assigned_to_user_id: input.customerId,
        assigned_role: "customer",
        action_type: "experts_matched",
        title: `Подобраны эксперты для вашего заказа`,
        description: `Система подобрала ${n} эксперт${suffix}. Ознакомьтесь с профилями и выберите подходящего специалиста.`,
        payload: { matched_count: n, round: nextRound },
      });
    } catch { /* non-fatal */ }
  }

  return { matched: selected.length, round: nextRound, experts: selected };
}
