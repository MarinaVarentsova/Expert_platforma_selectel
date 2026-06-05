import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger";

type ExpertForMatching = {
  user_id: string;
  business_trip_ready: boolean;
  avg_customer_rating: number | null;
  completed_orders_count: number;
  decline_rate: number | null;
  palata_registry_verified: boolean;
  centrsudexpert_verified: boolean;
};

function scoreExpert(e: ExpertForMatching): number {
  const rating = e.avg_customer_rating ?? 0;
  let score = rating * 10;
  if (e.palata_registry_verified) score += 2;
  if (e.centrsudexpert_verified)  score += 2;
  score += Math.min(e.completed_orders_count, 10) * 0.1;
  if (e.decline_rate != null) score -= e.decline_rate * 5;
  return Math.round(score * 100) / 100;
}

export async function runMatchingForRequest(
  db: SupabaseClient,
  requestId: string,
  expertiseDirectionId: string | null,
  regionId: string | null,
  requiresTravel: boolean,
  customerId: string | null,
): Promise<{ matched: number }> {
  if (!expertiseDirectionId) return { matched: 0 };
  if (requiresTravel && !regionId) return { matched: 0 };

  const today = new Date().toISOString().slice(0, 10);

  const { data: prevMatches } = await db
    .from("palata_request_matches")
    .select("expert_id, status, matching_round")
    .eq("request_id", requestId);

  type PrevMatch = { expert_id: string; status: string; matching_round: number | null };

  const declinedIds = new Set(
    (prevMatches ?? [] as PrevMatch[]).filter(m => ["declined", "withdrawn"].includes(m.status)).map(m => m.expert_id),
  );
  const activeIds = new Set(
    (prevMatches ?? [] as PrevMatch[]).filter(m => !["declined", "withdrawn", "closed_by_other_expert"].includes(m.status)).map(m => m.expert_id),
  );

  const rounds = (prevMatches ?? [] as PrevMatch[]).map(m => m.matching_round).filter((n): n is number => n != null);
  const nextRound = rounds.length > 0 ? Math.max(...rounds) + 1 : 1;

  const { data: certRows } = await db
    .from("palata_expert_certificates")
    .select("expert_id")
    .eq("status", "verified")
    .gte("cert_valid_to", today)
    .contains("cert_direction_ids", [expertiseDirectionId]);

  const qualifiedIds = (certRows ?? [])
    .map(r => r.expert_id as string)
    .filter(id => !declinedIds.has(id) && !activeIds.has(id));

  if (qualifiedIds.length === 0) return { matched: 0 };

  const { data: experts } = await db
    .from("palata_expert_profiles")
    .select("user_id, business_trip_ready, avg_customer_rating, completed_orders_count, decline_rate, palata_registry_verified, centrsudexpert_verified")
    .eq("accepts_requests", true)
    .in("user_id", qualifiedIds);

  if (!experts || experts.length === 0) return { matched: 0 };

  // Для выездных заказов: эксперты без business_trip_ready
  // подходят только если их регион совпадает с регионом заказа.
  const expertRegionMap = new Map<string, Set<string>>();
  if (requiresTravel) {
    const nonTripReadyIds = (experts as ExpertForMatching[])
      .filter(e => !e.business_trip_ready)
      .map(e => e.user_id);
    if (nonTripReadyIds.length > 0) {
      const { data: regData } = await db
        .from("palata_expert_regions")
        .select("expert_id, region_id")
        .in("expert_id", nonTripReadyIds);
      for (const row of regData ?? []) {
        if (!expertRegionMap.has(row.expert_id)) expertRegionMap.set(row.expert_id, new Set());
        expertRegionMap.get(row.expert_id)!.add(row.region_id);
      }
    }
  }

  const candidates: Array<{ expertId: string; score: number }> = [];
  for (const e of experts as ExpertForMatching[]) {
    if (requiresTravel && !e.business_trip_ready) {
      const eRegs = expertRegionMap.get(e.user_id) ?? new Set<string>();
      if (regionId && !eRegs.has(regionId)) continue;
    }
    candidates.push({ expertId: e.user_id, score: scoreExpert(e) });
  }

  if (candidates.length === 0) return { matched: 0 };

  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates.slice(0, 5);

  const { error: insertErr } = await db.from("palata_request_matches").insert(
    selected.map(s => ({
      request_id: requestId,
      expert_id: s.expertId,
      matching_round: nextRound,
      status: "pending_customer",
    })),
  );
  if (insertErr) {
    logger.warn({ requestId, err: insertErr.message }, "Failed to insert matches");
    return { matched: 0 };
  }

  await db.from("palata_requests").update({ status: "expert_selection", matching_round: nextRound }).eq("id", requestId);
  await db.from("palata_status_events").insert({
    entity_type: "request", entity_id: requestId,
    old_status: "matching", new_status: "expert_selection",
    actor_id: null,
    note: `Автоподбор (планировщик) раунд ${nextRound}: ${selected.length} эксперт(ов) предложено`,
  });

  if (customerId) {
    const n = selected.length;
    const suffix = n === 1 ? "" : n < 5 ? "а" : "ов";
    await db.from("palata_action_items").insert({
      request_id: requestId,
      expert_id: null,
      customer_id: customerId,
      assigned_to_user_id: customerId,
      assigned_role: "customer",
      action_type: "experts_matched",
      status: "open",
      is_resolved: false,
      title: "Подобраны эксперты для вашего заказа",
      description: `Система подобрала ${n} эксперт${suffix}. Ознакомьтесь с профилями и выберите подходящего специалиста.`,
      payload: { request_id: requestId, matched_experts_count: n, expert_ids: selected.map(s => s.expertId), round: nextRound },
    });
  }

  return { matched: selected.length };
}

export async function runAllPendingMatching(db: SupabaseClient): Promise<{ processed: number; matched: number }> {
  const { data: orders, error } = await db
    .from("palata_requests")
    .select("id, expertise_direction_id, region_id, requires_travel, customer_id")
    .eq("status", "matching");

  if (error) {
    logger.warn({ err: error.message }, "Failed to fetch pending orders for matching");
    return { processed: 0, matched: 0 };
  }

  let processed = 0;
  let matched = 0;

  for (const order of orders ?? []) {
    try {
      const result = await runMatchingForRequest(
        db,
        order.id,
        order.expertise_direction_id,
        order.region_id,
        order.requires_travel ?? false,
        order.customer_id,
      );
      matched += result.matched;
      processed++;
    } catch (e: unknown) {
      logger.warn({ requestId: order.id, err: (e as Error).message }, "Matching failed for request");
    }
  }

  return { processed, matched };
}
