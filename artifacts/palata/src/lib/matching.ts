import { getToken, palataFetch } from "@/lib/authClient";

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

  const rawRes = await palataFetch(`/api/palata/requests/${requestId}/matching/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken() ?? ""}`,
    },
    body: JSON.stringify({}),
  });
  const res = await rawRes.json().catch(() => ({ success: false, error: "FETCH_FAILED" }));

  if (!res.success) {
    throw new Error(res.error ?? "Ошибка при подборе экспертов");
  }

  return {
    matched: res.matched ?? 0,
    round: res.round ?? 1,
    experts: (res.experts ?? []) as Array<{ expertId: string; score: number }>,
  };
}

// ─── Run matching for all pending orders ──────────────────────────────────────
// The server-side scheduler handles periodic matching. This is a best-effort
// trigger called after expert registration; failures are non-fatal.
export async function runAllPendingMatching(): Promise<void> {
  try {
    const token = getToken();
    if (!token) return;
    // Calls the Palata server's own matching trigger endpoint, which handles all pending requests
    // using the same PostgreSQL pool as the rest of the server (no cross-service HTTP dependency).
    await palataFetch("/api/palata/match/trigger-all", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // non-fatal: server scheduler will handle it within the next interval
  }
}
