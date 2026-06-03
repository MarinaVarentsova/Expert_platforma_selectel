import { supabase } from "./supabaseClient";
import { createActionItem } from "./actionItems";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExpertForMatching = {
  user_id: string;
  business_trip_ready: boolean;
  avg_customer_rating: number | null;
  completed_orders_count: number;
  decline_rate: number | null;
  palata_registry_verified: boolean;
  centrsudexpert_verified: boolean;
};

export type MatchingInput = {
  requestId: string;
  /** null = no direction on the request → Scenario 3, early exit */
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
// Primary sort key: avg_customer_rating (null → 0), scaled to 0-50 pts.
// Tiebreakers: verification status, completed orders, low decline rate.

function scoreExpert(expert: ExpertForMatching): number {
  const rating = expert.avg_customer_rating ?? 0;
  let score = rating * 10;

  if (expert.palata_registry_verified)  score += 2;
  if (expert.centrsudexpert_verified)   score += 2;
  score += Math.min(expert.completed_orders_count, 10) * 0.1;
  if (expert.decline_rate != null) score -= expert.decline_rate * 5;

  return Math.round(score * 100) / 100;
}

// ─── Main matching function ───────────────────────────────────────────────────

export async function runMatching(input: MatchingInput): Promise<MatchingResult> {
  const { requestId, expertiseDirectionId, regionIds, requiresTravel } = input;

  // ── Scenario 3: no direction → cannot match ───────────────────────────────
  if (!expertiseDirectionId) {
    const { data: prevM } = await supabase
      .from("palata_request_matches")
      .select("matching_round")
      .eq("request_id", requestId);
    const rounds = (prevM ?? []).map(m => m.matching_round as number);
    const nextRound = rounds.length > 0 ? Math.max(...rounds) + 1 : 1;
    await _handleNoExperts(requestId, nextRound, input, "no_direction");
    return { matched: 0, round: nextRound, experts: [] };
  }

  // ── Scenario 5: travel but no region → cannot match ──────────────────────
  if (requiresTravel && regionIds.length === 0) {
    const { data: prevM } = await supabase
      .from("palata_request_matches")
      .select("matching_round")
      .eq("request_id", requestId);
    const rounds = (prevM ?? []).map(m => m.matching_round as number);
    const nextRound = rounds.length > 0 ? Math.max(...rounds) + 1 : 1;
    await _handleNoExperts(requestId, nextRound, input, "no_region_for_travel");
    return { matched: 0, round: nextRound, experts: [] };
  }

  // 1. Previous matches (skip declined / already proposed experts)
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

  // 2. Find experts with a valid, non-expired verified certificate
  //    that explicitly covers the requested expertise direction.
  //      • status = 'verified'
  //      • cert_valid_to >= today   (no expired certs; no cert = no access)
  //      • cert_direction_ids ∋ expertiseDirectionId
  //    RLS policy "Authenticated can read verified certs" (migration 029) must be
  //    applied in Supabase for this query to return rows for other experts.
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { data: certRows, error: certErr } = await supabase
    .from("palata_expert_certificates")
    .select("expert_id, cert_direction_ids, cert_valid_to")
    .eq("status", "verified")
    .gte("cert_valid_to", today)
    .contains("cert_direction_ids", [expertiseDirectionId]);

  console.log("[matching] DIAG step2 certRows:", certRows, "| certErr:", certErr?.message ?? "none",
    "| today:", today, "| directionId:", expertiseDirectionId);

  const qualifiedExpertIds = new Set(
    (certRows ?? []).map(r => r.expert_id as string),
  );

  const qualifiedIdList = [...qualifiedExpertIds].filter(
    id => !declinedIds.has(id) && !activelyProposedIds.has(id),
  );

  console.log("[matching] DIAG qualifiedIdList:", qualifiedIdList,
    "| declined:", [...declinedIds], "| proposed:", [...activelyProposedIds]);

  if (qualifiedIdList.length === 0) {
    await _handleNoExperts(requestId, nextRound, input, "no_valid_cert_for_direction");
    return { matched: 0, round: nextRound, experts: [] };
  }

  // 3. Fetch expert profiles — only those accepting requests
  const { data: experts, error: profileErr } = await supabase
    .from("palata_expert_profiles")
    .select([
      "user_id", "business_trip_ready",
      "avg_customer_rating", "completed_orders_count", "decline_rate",
      "palata_registry_verified", "centrsudexpert_verified", "accepts_requests",
    ].join(", "))
    .eq("accepts_requests", true)
    .in("user_id", qualifiedIdList);

  console.log("[matching] DIAG step3 profiles:", experts?.map(e => {
    const p = e as unknown as ExpertForMatching & { accepts_requests: boolean };
    return { id: p.user_id, trip: p.business_trip_ready, accepts: p.accepts_requests };
  }), "| profileErr:", profileErr?.message ?? "none");

  if (profileErr || !experts) {
    throw new Error(profileErr?.message ?? "Failed to fetch expert profiles");
  }

  // 4. For travel orders: build region map.
  //    For remote orders: skip — region is not a filter criterion.
  const expertRegionMap = new Map<string, Set<string>>();
  if (requiresTravel && experts.length > 0) {
    const expertIdList = (experts as unknown as ExpertForMatching[]).map(e => e.user_id);
    const { data: expertRegRows, error: regErr } = await supabase
      .from("palata_expert_regions")
      .select("expert_id, region_id")
      .in("expert_id", expertIdList);

    console.log("[matching] DIAG step4 expertRegRows:", expertRegRows,
      "| regErr:", regErr?.message ?? "none",
      "| request regionIds:", regionIds);

    for (const row of expertRegRows ?? []) {
      if (!expertRegionMap.has(row.expert_id)) {
        expertRegionMap.set(row.expert_id, new Set());
      }
      expertRegionMap.get(row.expert_id)!.add(row.region_id);
    }
  }

  // 5. Filter + score
  //    Scenario 1 (travel): must cover request region AND business_trip_ready = true
  //    Scenario 2 / 4 (remote): no region restriction
  const requestRegionSet = new Set(regionIds);
  const candidates: Array<{ expertId: string; score: number }> = [];

  for (const e of experts as unknown as ExpertForMatching[]) {
    if (requiresTravel) {
      if (!e.business_trip_ready) {
        console.log("[matching] DIAG filter: skip", e.user_id, "— business_trip_ready=false");
        continue;
      }
      const expertRegions = expertRegionMap.get(e.user_id) ?? new Set<string>();
      let regionMatch = false;
      for (const rid of requestRegionSet) {
        if (expertRegions.has(rid)) { regionMatch = true; break; }
      }
      console.log("[matching] DIAG filter:", e.user_id,
        "expertRegions:", [...expertRegions], "requestRegion:", [...requestRegionSet], "match:", regionMatch);
      if (!regionMatch) continue;
    }

    candidates.push({ expertId: e.user_id, score: scoreExpert(e) });
  }

  if (candidates.length === 0) {
    await _handleNoExperts(requestId, nextRound, input, "no_candidates_after_filter");
    return { matched: 0, round: nextRound, experts: [] };
  }

  // 6. Sort by score desc, take top 5
  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates.slice(0, 5);

  // 7. Persist matches (DB unique constraint prevents duplicates)
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
  | "no_valid_cert_for_direction"
  | "no_candidates_after_filter";

async function _handleNoExperts(
  requestId: string,
  nextRound: number,
  input: MatchingInput,
  reason: NoExpertsReason,
) {
  const noteMap: Record<NoExpertsReason, string> = {
    no_direction:
      "Автоподбор: у заказа не указано направление экспертизы — подбор невозможен",
    no_region_for_travel:
      "Автоподбор: заказ с выездом, но регион не указан — подбор невозможен",
    no_valid_cert_for_direction:
      "Автоподбор: нет экспертов с действующим сертификатом по этому направлению",
    no_candidates_after_filter:
      "Автоподбор: подходящие эксперты не найдены после фильтрации (регион/выезд)",
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
        description:
          "По вашему заказу не удалось подобрать экспертов. Администратор займётся подбором вручную.",
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
