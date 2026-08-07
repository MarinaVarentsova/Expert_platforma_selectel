import type { Pool } from "pg";
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
  db: Pool,
  requestId: string,
  expertiseDirectionId: string | null,
  regionId: string | null,
  requiresTravel: boolean,
  customerId: string | null,
): Promise<{ matched: number }> {
  if (!expertiseDirectionId) return { matched: 0 };
  if (requiresTravel && !regionId) return { matched: 0 };

  const today = new Date().toISOString().slice(0, 10);

  const prevMatchesRes = await db.query<{ expert_id: string; status: string; matching_round: number | null }>(
    `SELECT expert_id, status, matching_round FROM public.palata_request_matches WHERE request_id = $1`,
    [requestId],
  );
  const prevMatches = prevMatchesRes.rows;

  const declinedIds = new Set(
    prevMatches.filter(m => ["declined", "withdrawn"].includes(m.status)).map(m => m.expert_id),
  );
  const activeIds = new Set(
    prevMatches.filter(m => !["declined", "withdrawn", "closed_by_other_expert"].includes(m.status)).map(m => m.expert_id),
  );

  const rounds = prevMatches.map(m => m.matching_round).filter((n): n is number => n != null);
  const nextRound = rounds.length > 0 ? Math.max(...rounds) + 1 : 1;

  const certRes = await db.query<{ expert_id: string }>(
    `SELECT expert_id
       FROM public.palata_expert_certificates
      WHERE status = 'verified'
        AND cert_valid_to >= $1
        AND cert_direction_ids @> ARRAY[$2]::uuid[]`,
    [today, expertiseDirectionId],
  );

  const qualifiedIds = certRes.rows
    .map(r => r.expert_id)
    .filter(id => !declinedIds.has(id) && !activeIds.has(id));

  if (qualifiedIds.length === 0) return { matched: 0 };

  const expertRes = await db.query<ExpertForMatching>(
    `SELECT user_id, business_trip_ready, avg_customer_rating, completed_orders_count,
            decline_rate, palata_registry_verified, centrsudexpert_verified
       FROM public.palata_expert_profiles
      WHERE accepts_requests = true
        AND user_id = ANY($1)`,
    [qualifiedIds],
  );
  const experts = expertRes.rows;

  if (experts.length === 0) return { matched: 0 };

  const expertRegionMap = new Map<string, Set<string>>();
  if (requiresTravel) {
    const nonTripReadyIds = experts.filter(e => !e.business_trip_ready).map(e => e.user_id);
    if (nonTripReadyIds.length > 0) {
      const regRes = await db.query<{ expert_id: string; region_id: string }>(
        `SELECT expert_id, region_id FROM public.palata_expert_regions WHERE expert_id = ANY($1)`,
        [nonTripReadyIds],
      );
      for (const row of regRes.rows) {
        if (!expertRegionMap.has(row.expert_id)) expertRegionMap.set(row.expert_id, new Set());
        expertRegionMap.get(row.expert_id)!.add(row.region_id);
      }
    }
  }

  const candidates: Array<{ expertId: string; score: number }> = [];
  for (const e of experts) {
    if (requiresTravel && !e.business_trip_ready) {
      const eRegs = expertRegionMap.get(e.user_id) ?? new Set<string>();
      if (regionId && !eRegs.has(regionId)) continue;
    }
    candidates.push({ expertId: e.user_id, score: scoreExpert(e) });
  }

  if (candidates.length === 0) return { matched: 0 };

  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates.slice(0, 5);

  // Build multi-row INSERT
  const insertValues = selected.map((s, i) => {
    const base = i * 4;
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
  }).join(", ");
  const insertParams = selected.flatMap(s => [requestId, s.expertId, nextRound, "proposed"]);

  try {
    await db.query(
      `INSERT INTO public.palata_request_matches
         (request_id, expert_id, matching_round, status)
       VALUES ${insertValues}`,
      insertParams,
    );
  } catch (err: unknown) {
    logger.warn({ requestId, err: (err as Error).message }, "Failed to insert matches");
    return { matched: 0 };
  }

  await db.query(
    `UPDATE public.palata_requests SET status = $1, matching_round = $2 WHERE id = $3`,
    ["expert_selection", nextRound, requestId],
  );
  await db.query(
    `INSERT INTO public.palata_status_events
       (entity_type, entity_id, old_status, new_status, actor_id, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      "request", requestId,
      "matching", "expert_selection",
      null,
      `Автоподбор (планировщик) раунд ${nextRound}: ${selected.length} эксперт(ов) предложено`,
    ],
  );

  if (customerId) {
    const n = selected.length;
    const suffix = n === 1 ? "" : n < 5 ? "а" : "ов";
    await db.query(
      `INSERT INTO public.palata_action_items
         (request_id, expert_id, customer_id, assigned_to_user_id, assigned_role,
          action_type, status, is_resolved, title, description, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        requestId, null, customerId, customerId, "customer",
        "experts_matched", "open", false,
        "Подобраны эксперты для вашего заказа",
        `Система подобрала ${n} эксперт${suffix}. Ознакомьтесь с профилями и выберите подходящего специалиста.`,
        JSON.stringify({ request_id: requestId, matched_experts_count: n, expert_ids: selected.map(s => s.expertId), round: nextRound }),
      ],
    );
  }

  return { matched: selected.length };
}

export async function runAllPendingMatching(db: Pool): Promise<{ processed: number; matched: number }> {
  const ordersRes = await db.query<{
    id: string;
    expertise_direction_id: string | null;
    region_id: string | null;
    requires_travel: boolean | null;
    customer_id: string | null;
  }>(
    `SELECT id, expertise_direction_id, region_id, requires_travel, customer_id
       FROM public.palata_requests
      WHERE status = 'matching'`,
  );

  if (ordersRes.rowCount === 0) return { processed: 0, matched: 0 };

  let processed = 0;
  let matched = 0;

  for (const order of ordersRes.rows) {
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
