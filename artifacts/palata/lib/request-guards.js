/**
 * Pure guard functions for request / match state-machine transitions.
 *
 * Each function receives the CURRENT status values (read from DB with FOR UPDATE)
 * and returns either null (guard passes) or an object describing the conflict.
 *
 * Keeping these as pure functions makes them trivially testable without any DB
 * or HTTP infrastructure.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared error shapes
// ─────────────────────────────────────────────────────────────────────────────

const ERR_IN_WORK = {
  code: "REQUEST_STATUS_CONFLICT",
  error: "Заказ уже в работе",
};

const ERR_TERMINAL = {
  code: "REQUEST_STATUS_CONFLICT",
  error: "Действие больше недоступно, статус заказа изменился. Обновите страницу",
};

const ERR_MATCH_RESOLVED = {
  code: "MATCH_ALREADY_RESOLVED",
  error: "Действие больше недоступно, статус заказа изменился. Обновите страницу",
};

const ERR_MATCH_STATUS = {
  code: "MATCH_STATUS_CONFLICT",
  error: "Действие больше недоступно, статус заказа изменился. Обновите страницу",
};

// ─────────────────────────────────────────────────────────────────────────────
// A. handleDeclineRequest — expert declines a match
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string} requestStatus
 * @param {string} matchStatus
 * @returns {{ code: string, error: string } | null}
 */
export function guardDecline(requestStatus, matchStatus) {
  if (requestStatus === "in_work") return { ...ERR_IN_WORK, freshStatus: requestStatus };
  if (requestStatus === "completed" || requestStatus === "cancelled") {
    return { ...ERR_TERMINAL, freshStatus: requestStatus };
  }
  const BLOCKED_MATCH = ["accepted_work", "completed", "closed_by_other_expert", "declined"];
  if (BLOCKED_MATCH.includes(matchStatus)) {
    return { ...ERR_MATCH_RESOLVED, freshStatus: matchStatus };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// B. handleTakeWork — expert accepts work
// ─────────────────────────────────────────────────────────────────────────────

const TAKE_WORK_ALLOWED_MATCH = ["can_start_from", "selected_by_customer"];

/**
 * @param {string} requestStatus
 * @param {string|null} matchStatus  null means no match found
 * @returns {{ code: string, error: string } | null}
 */
export function guardTakeWork(requestStatus, matchStatus) {
  if (requestStatus === "in_work") return { ...ERR_IN_WORK, freshStatus: requestStatus };
  if (requestStatus === "completed" || requestStatus === "cancelled") {
    return { ...ERR_TERMINAL, freshStatus: requestStatus };
  }
  if (!matchStatus || !TAKE_WORK_ALLOWED_MATCH.includes(matchStatus)) {
    return { ...ERR_MATCH_STATUS, freshStatus: matchStatus };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// C/D. handleExpertCanStart / handleApplyMarket — expert proposes date
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string} requestStatus
 * @returns {{ code: string, error: string } | null}
 */
export function guardExpertProposeDate(requestStatus) {
  if (requestStatus === "in_work") return { ...ERR_IN_WORK, freshStatus: requestStatus };
  if (requestStatus === "completed" || requestStatus === "cancelled") {
    return { ...ERR_TERMINAL, freshStatus: requestStatus };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// F. handleDeclineStartDate — customer declines expert's proposed date
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string} requestStatus
 * @returns {{ code: string, error: string } | null}
 */
export function guardDeclineStartDate(requestStatus) {
  if (requestStatus === "in_work") return { ...ERR_IN_WORK, freshStatus: requestStatus };
  if (requestStatus === "completed" || requestStatus === "cancelled") {
    return { ...ERR_TERMINAL, freshStatus: requestStatus };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// G. handleCompleteWork — expert marks work done
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string}      requestStatus
 * @param {string|null} assignedExpertId   assigned_expert_id from DB
 * @param {string}      callerId           authenticated expert id
 * @param {string|null} matchStatus        null = no match found
 * @returns {{ code: string, error: string, httpStatus?: number } | null}
 */
export function guardCompleteWork(requestStatus, assignedExpertId, callerId, matchStatus) {
  if (requestStatus === "completed") {
    return { ...ERR_TERMINAL, freshStatus: "completed", code: "REQUEST_STATUS_CONFLICT" };
  }
  if (requestStatus !== "in_work") {
    return { ...ERR_TERMINAL, freshStatus: requestStatus };
  }
  if (assignedExpertId && assignedExpertId !== callerId) {
    return { code: "NOT_ASSIGNED_EXPERT", error: "Вы не являетесь назначенным исполнителем этого заказа", httpStatus: 403 };
  }
  if (!matchStatus || matchStatus !== "accepted_work") {
    return { ...ERR_MATCH_STATUS, freshStatus: matchStatus };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// H. handleCustomerComplete — customer confirms completion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns "idempotent" when status is already completed (caller should return 200).
 * @param {string} requestStatus
 * @returns {{ code: string, error: string, idempotent?: boolean } | null}
 */
export function guardCustomerComplete(requestStatus) {
  if (requestStatus === "completed") {
    return { code: "ALREADY_COMPLETED", error: "Заказ уже завершён", idempotent: true };
  }
  if (requestStatus !== "in_work") {
    return { ...ERR_TERMINAL, freshStatus: requestStatus };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// I. handleCustomerCancel — customer cancels order
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns "idempotent" when already cancelled (caller should return 200).
 * @param {string} requestStatus
 * @returns {{ code: string, error: string, idempotent?: boolean } | null}
 */
export function guardCustomerCancel(requestStatus) {
  if (requestStatus === "cancelled") {
    return { code: "ALREADY_CANCELLED", error: "Заказ уже отменён", idempotent: true };
  }
  if (requestStatus === "in_work") {
    return { ...ERR_IN_WORK, freshStatus: "in_work" };
  }
  if (requestStatus === "completed") {
    return { ...ERR_TERMINAL, freshStatus: "completed" };
  }
  return null;
}
