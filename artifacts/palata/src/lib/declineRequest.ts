import { supabase } from "./supabaseClient";
import {
  createActionItem,
  resolveActionItem,
  logStatusEvent,
} from "./actionItems";
import { runMatching } from "./matching";

const DECLINE_LABEL_RU: Record<string, string> = {
  busy:          "Занят",
  not_competent: "Вне компетенции",
  location:      "Регион не подходит",
  conflict:      "Конфликт интересов",
  conditions:    "Условия не подходят",
  other:         "Другое",
};

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
    expertId,
    reason,
    note,
    expertName = null,
    requestTitle = null,
    actionItemId = null,
    runRematch = true,
  } = params;

  let { matchId = null, customerId = null } = params;
  const now = new Date().toISOString();

  try {
    // 1. Resolve match id if not provided
    if (!matchId) {
      const { data: mRow } = await supabase
        .from("palata_request_matches")
        .select("id")
        .eq("request_id", requestId)
        .eq("expert_id", expertId)
        .maybeSingle();
      matchId = (mRow as { id: string } | null)?.id ?? null;
    }
    if (!matchId) return { error: "Match record not found" };

    // 2. Update match → declined
    const { error: matchErr } = await supabase
      .from("palata_request_matches")
      .update({
        status: "declined",
        decline_reason: reason,
        decline_note: note || null,
        responded_at: now,
      })
      .eq("id", matchId);
    if (matchErr) {
      return { error: matchErr.message };
    }

    // 3. Resolve customer id if not provided
    if (!customerId) {
      const { data: reqRow } = await supabase
        .from("palata_requests")
        .select("customer_id")
        .eq("id", requestId)
        .maybeSingle();
      customerId =
        (reqRow as { customer_id: string } | null)?.customer_id ?? null;
    }

    // 4. Resolve action item (dashboard only)
    if (actionItemId) {
      await resolveActionItem(actionItemId);
    }

    // 5. Notify customer via action item
    if (customerId) {
      const declineLabel = DECLINE_LABEL_RU[reason] ?? reason;
      const orderRef = requestTitle
        ? `вашем заказе «${requestTitle}»`
        : "вашем заказе";
      await createActionItem({
        request_id: requestId,
        expert_id: expertId,
        customer_id: customerId,
        assigned_to_user_id: customerId,
        assigned_role: "customer",
        action_type: "expert_declined",
        title: "Эксперт отказался от заказа",
        description: expertName
          ? `Эксперт ${expertName} отказался от участия в ${orderRef}.`
          : `Эксперт отказался от участия в ${orderRef}.`,
        payload: {
          request_id: requestId,
          expert_id: expertId,
          expert_name: expertName,
          decline_reason: declineLabel,
          decline_note: note || null,
        },
      });
    }

    // 6. Log request-level status event
    await logStatusEvent(requestId, "expert_selection", "matching", "expert_declined");

    // 7. Re-matching if every active expert has now declined
    if (runRematch) {
      try {
        const { data: allMatches } = await supabase
          .from("palata_request_matches")
          .select("id, status")
          .eq("request_id", requestId)
          .not("status", "in", "(closed_by_other_expert,withdrawn)");

        const allDeclined =
          Array.isArray(allMatches) &&
          allMatches.length > 0 &&
          allMatches.every(
            (m: { status: string }) =>
              m.status === "declined" || m.status === "withdrawn",
          );

        if (allDeclined) {
          const { data: reqData } = await supabase
            .from("palata_requests")
            .select("expertise_direction_id, region_id, requires_travel, customer_id")
            .eq("id", requestId)
            .maybeSingle();
          const rd = reqData as {
            expertise_direction_id: string | null;
            region_id: string | null;
            requires_travel: boolean | null;
            customer_id: string | null;
          } | null;
          if (rd) {
            await runMatching({
              requestId,
              expertiseDirectionId: rd.expertise_direction_id ?? null,
              regionIds: rd.region_id ? [rd.region_id] : [],
              requiresTravel: rd.requires_travel ?? false,
              customerId: rd.customer_id ?? undefined,
            });
          }
        }
      } catch {
        // non-fatal
      }
    }

    return { error: null };
  } catch (e: unknown) {
    return { error: (e as Error)?.message ?? "Ошибка отказа" };
  }
}
