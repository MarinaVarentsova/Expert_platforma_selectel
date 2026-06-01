import { supabase } from "./supabaseClient";
import { createActionItem } from "./actionItems";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExpertForMatching = {
  user_id: string;
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
  expertiseDirectionId: string;
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

function scoreExpert(
  expert: ExpertForMatching,
  regionMatch: boolean,
  requiresTravel: boolean,
): number {
  let score = 0;

  if (regionMatch) {
    score += 100;
  } else if (!requiresTravel) {
    score += 0;
  } else if (expert.business_trip_ready) {
    score += 20;
  }

  if (expert.palata_registry_verified) score += 30;
  if (expert.palata_registry_number)   score += 10;
  if (expert.centrsudexpert_verified)  score += 20;
  if (expert.centrsudexpert_registry_number) score += 10;

  if (expert.avg_customer_rating != null) {
    score += expert.avg_customer_rating * 10;
  }

  score += Math.min(expert.completed_orders_count, 10) * 2;

  if (expert.decline_rate != null) {
    score -= expert.decline_rate * 30;
  }

  return Math.round(score);
}

// ─── Main matching function ───────────────────────────────────────────────────

export async function runMatching(input: MatchingInput): Promise<MatchingResult> {
  const { requestId, expertiseDirectionId, regionIds, requiresTravel } = input;

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

  const activelyProposedIds = new Set(
    (prevMatches ?? [])
      .filter(m => !["declined", "withdrawn", "closed_by_other_expert"].includes(m.status))
      .map(m => m.expert_id as string),
  );

  const rounds = (prevMatches ?? []).map(m => m.matching_round as number);
  const nextRound = rounds.length > 0 ? Math.max(...rounds) + 1 : 1;

  // 2. Experts with the required expertise direction
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
    await _handleNoExperts(requestId, nextRound, input);
    return { matched: 0, round: nextRound, experts: [] };
  }

  // 3. Fetch expert profiles
  const { data: experts, error } = await supabase
    .from("palata_expert_profiles")
    .select([
      "user_id", "business_trip_ready",
      "palata_registry_verified", "palata_registry_number",
      "centrsudexpert_verified", "centrsudexpert_registry_number",
      "avg_customer_rating", "completed_orders_count", "decline_rate",
    ].join(", "))
    .eq("status", "active")
    .eq("accepts_requests", true)
    .in("user_id", qualifiedIdList);

  if (error || !experts) throw new Error(error?.message ?? "Failed to fetch experts");

  // 4. Fetch expert regions from palata_expert_regions
  //    Build a map: expert_id → Set<region_id>
  const expertRegionMap = new Map<string, Set<string>>();
  if (qualifiedIdList.length > 0) {
    const { data: expertRegRows } = await supabase
      .from("palata_expert_regions")
      .select("expert_id, region_id")
      .in("expert_id", qualifiedIdList);

    for (const row of expertRegRows ?? []) {
      if (!expertRegionMap.has(row.expert_id)) {
        expertRegionMap.set(row.expert_id, new Set());
      }
      expertRegionMap.get(row.expert_id)!.add(row.region_id);
    }
  }

  // 5. Filter + score
  const requestRegionSet = new Set(regionIds);
  const candidates: Array<{ expertId: string; score: number }> = [];

  for (const e of experts as unknown as ExpertForMatching[]) {
    const expertRegionIds = expertRegionMap.get(e.user_id) ?? new Set<string>();

    // Region match: any of the request's regions matches any of the expert's regions
    let regionMatch = false;
    if (requestRegionSet.size === 0) {
      // No region filter on request → don't penalise
      regionMatch = true;
    } else {
      for (const rid of requestRegionSet) {
        if (expertRegionIds.has(rid)) { regionMatch = true; break; }
      }
    }

    if (!regionMatch && requiresTravel && !e.business_trip_ready) continue;
    const score = scoreExpert(e, regionMatch, requiresTravel);
    candidates.push({ expertId: e.user_id, score });
  }

  if (candidates.length === 0) {
    await _handleNoExperts(requestId, nextRound, input);
    return { matched: 0, round: nextRound, experts: [] };
  }

  // 6. Sort, take top 5, persist
  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates.slice(0, 5);

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

async function _handleNoExperts(requestId: string, nextRound: number, input: MatchingInput) {
  await supabase.from("palata_requests")
    .update({ status: "matching" })
    .eq("id", requestId);

  await supabase.from("palata_status_events").insert({
    entity_type: "request", entity_id: requestId,
    old_status: "new", new_status: "matching",
    actor_id: null,
    note: "Автоподбор: подходящие эксперты не найдены — требуется ручной подбор",
  });

  await supabase.from("palata_status_events").insert({
    entity_type: "request", entity_id: requestId,
    old_status: "matching", new_status: "matching",
    actor_id: null,
    note: `no_experts_found: раунд ${nextRound}, кандидатов после фильтрации: 0`,
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
        payload: { round: nextRound },
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
        description: `Автоподбор не нашёл кандидатов (раунд ${nextRound}). Назначьте эксперта вручную.`,
        payload: { round: nextRound, request_id: requestId },
      });
    }
  } catch { /* non-fatal */ }
}
