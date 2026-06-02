import { supabase } from "./supabaseClient";
import { createActionItem } from "./actionItems";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExpertForMatching = {
  user_id: string;
  business_trip_ready: boolean;
  palata_registry_verified: boolean;
  centrsudexpert_verified: boolean;
  avg_customer_rating: number | null;
  completed_orders_count: number;
  decline_rate: number | null;
};

export type MatchingInput = {
  requestId: string;
  expertiseDirectionId: string | null;
  regionIds: string[];
  requiresTravel: boolean;
  customerId?: string;
};

export type MatchingResult = {
  matched: number;
  round: number;
  experts: Array<{ expertId: string; score: number }>;
};

// ─── Scoring ──────────────────────────────────────────────────────────────────
// Primary sort: avg_customer_rating (null → 0).
// Tiebreakers: verification status, completed orders, low decline rate.

function scoreExpert(expert: ExpertForMatching): number {
  const rating = expert.avg_customer_rating ?? 0;
  let score = rating * 10; // 0-50 pts for rating 0-5

  if (expert.palata_registry_verified)  score += 2;
  if (expert.centrsudexpert_verified)   score += 2;
  score += Math.min(expert.completed_orders_count, 10) * 0.1;
  if (expert.decline_rate != null) score -= expert.decline_rate * 5;

  return Math.round(score * 100) / 100;
}

// ─── Main matching function ───────────────────────────────────────────────────

export async function runMatching(input: MatchingInput): Promise<MatchingResult> {
  const { requestId, expertiseDirectionId, regionIds, requiresTravel } = input;

  // 1. Previous matches for this request (to skip declined/proposed experts)
  const { data: prevMatches } = await supabase
    .from("palata_request_matches")
    .select("expert_id, matching_round, status")
    .eq("request_id", requestId);

  const declinedIds = new Set(
    (prevMatches ?? [])
      .filter(m => m.status === "declined" || m.status === "withdrawn")
      .map(m => m.expert_id as string),
  );

  const activelyProposedIds = new Set(
    (prevMatches ?? [])
      .filter(m => !["declined", "withdrawn", "closed_by_other_expert"].includes(m.status))
      .map(m => m.expert_id as string),
  );

  const rounds = (prevMatches ?? []).map(m => m.matching_round as number);
  const nextRound = rounds.length > 0 ? Math.max(...rounds) + 1 : 1;

  // ── Scenario 3: no direction → cannot match ───────────────────────────────
  if (!expertiseDirectionId) {
    await _handleNoExperts(requestId, nextRound, input, "no_direction");
    return { matched: 0, round: nextRound, experts: [] };
  }

  // ── Scenario 5: travel requested but no region → cannot match ─────────────
  if (requiresTravel && regionIds.length === 0) {
    await _handleNoExperts(requestId, nextRound, input, "no_region_for_travel");
    return { matched: 0, round: nextRound, experts: [] };
  }

  // 2. Experts that have the required expertise direction
  const { data: expertDirs } = await supabase
    .from("palata_expert_directions")
    .select("expert_id")
    .eq("expertise_direction_id", expertiseDirectionId);

  const qualifiedExpertIds = new Set(
    (expertDirs ?? []).map(d => d.expert_id as string),
  );

  const qualifiedIdList = [...qualifiedExpertIds].filter(
    id => !declinedIds.has(id) && !activelyProposedIds.has(id),
  );

  if (qualifiedIdList.length === 0) {
    await _handleNoExperts(requestId, nextRound, input, "no_direction_match");
    return { matched: 0, round: nextRound, experts: [] };
  }

  // 3. Fetch expert profiles.
  //    Only include experts with accepts_requests = true AND at least one
  //    verified certificate (palata_registry_verified OR centrsudexpert_verified).
  //    NOTE: do NOT filter by status='active' — registered experts default to
  //    'draft' and the spec uses accepts_requests + certificate as the gate.
  const { data: experts, error } = await supabase
    .from("palata_expert_profiles")
    .select([
      "user_id", "business_trip_ready",
      "palata_registry_verified", "centrsudexpert_verified",
      "avg_customer_rating", "completed_orders_count", "decline_rate",
    ].join(", "))
    .eq("accepts_requests", true)
    .or("palata_registry_verified.eq.true,centrsudexpert_verified.eq.true")
    .in("user_id", qualifiedIdList);

  if (error || !experts) throw new Error(error?.message ?? "Failed to fetch experts");

  // 4. For travel orders: fetch expert regions and build a lookup map.
  //    For remote orders: skip region filtering entirely.
  const expertRegionMap = new Map<string, Set<string>>();
  if (requiresTravel && experts.length > 0) {
    const expertIdList = (experts as unknown as ExpertForMatching[]).map(e => e.user_id);
    const { data: expertRegRows } = await supabase
      .from("palata_expert_regions")
      .select("expert_id, region_id")
      .in("expert_id", expertIdList);

    for (const row of expertRegRows ?? []) {
      if (!expertRegionMap.has(row.expert_id)) {
        expertRegionMap.set(row.expert_id, new Set());
      }
      expertRegionMap.get(row.expert_id)!.add(row.region_id);
    }
  }

  // 5. Filter + score
  //    Scenario 1 (travel): expert must match region AND have business_trip_ready=true
  //    Scenario 2/4 (remote): no region filter, all direction-matched experts eligible
  const requestRegionSet = new Set(regionIds);
  const candidates: Array<{ expertId: string; score: number }> = [];

  for (const e of experts as unknown as ExpertForMatching[]) {
    if (requiresTravel) {
      // Must be willing to travel
      if (!e.business_trip_ready) continue;

      // Must cover the request's region
      const expertRegionIds = expertRegionMap.get(e.user_id) ?? new Set<string>();
      let regionMatch = false;
      for (const rid of requestRegionSet) {
        if (expertRegionIds.has(rid)) { regionMatch = true; break; }
      }
      if (!regionMatch) continue;
    }
    // For remote work (Scenario 2, 4): no region check

    candidates.push({ expertId: e.user_id, score: scoreExpert(e) });
  }

  if (candidates.length === 0) {
    await _handleNoExperts(requestId, nextRound, input, "no_candidates_after_filter");
    return { matched: 0, round: nextRound, experts: [] };
  }

  // 6. Sort by score descending (primary: rating, tiebreakers: verification etc.)
  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates.slice(0, 5);

  // 7. Persist matches (unique per request_id + expert_id via DB constraint)
  const { error: insertErr } = await supabase.from("palata_request_matches").insert(
    selected.map(s => ({
      request_id: requestId,
      expert_id: s.expertId,
      matching_round: nextRound,
      status: "proposed",
    })),
  );
  if (insertErr) throw new Error(insertErr.message);

  await supabase.from("palata_requests")
    .update({ status: "expert_selection", matching_round: nextRound })
    .eq("id", requestId);

  await supabase.from("palata_status_events").insert({
    entity_type: "request", entity_id: requestId,
    old_status: "new", new_status: "expert_selection",
    actor_id: null,
    note: `Автоподбор раунд ${nextRound}: ${selected.length} эксперт(ов) предложено`,
  });

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
        payload: {
          request_id: requestId,
          matched_experts_count: n,
          expert_ids: selected.map(s => s.expertId),
          round: nextRound,
        },
      });
    } catch { /* non-fatal */ }
  }

  return { matched: selected.length, round: nextRound, experts: selected };
}

// ─── Helper: no experts found ─────────────────────────────────────────────────

type NoExpertsReason =
  | "no_direction"
  | "no_region_for_travel"
  | "no_direction_match"
  | "no_candidates_after_filter";

async function _handleNoExperts(
  requestId: string,
  nextRound: number,
  input: MatchingInput,
  reason: NoExpertsReason,
) {
  const noteMap: Record<NoExpertsReason, string> = {
    no_direction:              "Автоподбор: у заказа не указано направление экспертизы — подбор невозможен",
    no_region_for_travel:      "Автоподбор: заказ с выездом, но регион не указан — подбор невозможен",
    no_direction_match:        "Автоподбор: нет экспертов по указанному направлению",
    no_candidates_after_filter:"Автоподбор: подходящие эксперты не найдены после фильтрации",
  };

  await supabase.from("palata_requests")
    .update({ status: "matching" })
    .eq("id", requestId);

  await supabase.from("palata_status_events").insert({
    entity_type: "request", entity_id: requestId,
    old_status: "new", new_status: "matching",
    actor_id: null,
    note: noteMap[reason],
  });

  await supabase.from("palata_status_events").insert({
    entity_type: "request", entity_id: requestId,
    old_status: "matching", new_status: "matching",
    actor_id: null,
    note: `no_experts_found: раунд ${nextRound}, причина: ${reason}`,
  });

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
        payload: { round: nextRound, reason },
      });
    } catch { /* non-fatal */ }
  }

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
        description: `Автоподбор не нашёл кандидатов (раунд ${nextRound}, причина: ${reason}). Назначьте эксперта вручную.`,
        payload: { round: nextRound, request_id: requestId, reason },
      });
    }
  } catch { /* non-fatal */ }
}
