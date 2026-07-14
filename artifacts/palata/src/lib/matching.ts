import { supabase } from "./supabaseClient";
import { getToken } from "@/lib/authClient";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Main matching function ───────────────────────────────────────────────────

export async function runMatching(input: MatchingInput): Promise<MatchingResult> {
  const { requestId } = input;

  const res = await fetch(`/api/palata/requests/${requestId}/matching/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken() ?? ""}`,
    },
    body: JSON.stringify({}),
  }).then(r => r.json()).catch(() => ({ success: false, error: "FETCH_FAILED" }));

  if (!res.success) {
    throw new Error(res.error ?? "Matching failed");
  }

  return {
    matched: res.matched ?? 0,
    round: res.round ?? 1,
    experts: (res.experts ?? []) as Array<{ expertId: string; score: number }>,
  };
}

// ─── Run matching for all pending orders ──────────────────────────────────────

export async function runAllPendingMatching(): Promise<void> {
  const { data: orders } = await supabase
    .from("palata_requests")
    .select("id, expertise_direction_id, region_id, requires_travel, customer_id")
    .eq("status", "matching");

  for (const order of orders ?? []) {
    try {
      await runMatching({
        requestId:            order.id,
        expertiseDirectionId: order.expertise_direction_id ?? null,
        regionIds:            order.region_id ? [order.region_id] : [],
        requiresTravel:       order.requires_travel ?? false,
        customerId:           order.customer_id ?? undefined,
      });
    } catch { /* non-fatal: continue with next */ }
  }
}
