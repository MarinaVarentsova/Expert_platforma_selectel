import { getToken } from "@/lib/authClient";
import { runMatching } from "./matching";

const DECLINE_LABEL_RU: Record<string, string> = {
  busy:          "Занят",
  not_competent: "Вне компетенции",
  location:      "Регион не подходит",
  conflict:      "Конфликт интересов",
  conditions:    "Условия не подходят",
  other:         "Другое",
};
// Keep export so existing callers can reference it if needed
export { DECLINE_LABEL_RU };

export interface DeclineRequestParams {
  requestId: string;
  expertId: string;
  reason: string;
  note: string;
  /** Match row id — if provided, skips the SELECT lookup */
  matchId?: string | null;
  /** Customer user id — if provided, skips the request SELECT */
  customerId?: string | null;
  /** Expert display name for the customer notification */
  expertName?: string | null;
  /** Request title for the customer notification */
  requestTitle?: string | null;
  /** Action item id to mark resolved after decline (dashboard only) */
  actionItemId?: string | null;
  /** Whether to trigger re-matching if all experts declined (default true) */
  runRematch?: boolean;
}

export async function declineRequest(
  params: DeclineRequestParams,
): Promise<{ error: string | null }> {
  const {
    requestId,
    reason,
    note,
    matchId = null,
    customerId = null,
    expertName = null,
    requestTitle = null,
    actionItemId = null,
    runRematch = true,
  } = params;

  try {
    const res = await fetch(`/api/palata/requests/${requestId}/decline`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken() ?? ""}`,
      },
      body: JSON.stringify({
        reason,
        note: note || null,
        matchId,
        customerId,
        expertName,
        requestTitle,
        actionItemId,
      }),
    }).then(r => r.json()).catch(() => ({ success: false, error: "FETCH_FAILED" }));

    if (!res.success) {
      return { error: res.error ?? "Ошибка отказа" };
    }

    // runMatching after COMMIT — same as before, non-fatal
    if (runRematch && res.allDeclined && res.requestData) {
      try {
        const rd = res.requestData as {
          expertise_direction_id: string | null;
          region_id: string | null;
          requires_travel: boolean;
          customer_id: string | null;
        };
        await runMatching({
          requestId,
          expertiseDirectionId: rd.expertise_direction_id ?? null,
          regionIds: rd.region_id ? [rd.region_id] : [],
          requiresTravel: rd.requires_travel ?? false,
          customerId: rd.customer_id ?? undefined,
        });
      } catch {
        // non-fatal
      }
    }

    return { error: null };
  } catch (e: unknown) {
    return { error: (e as Error)?.message ?? "Ошибка отказа" };
  }
}
