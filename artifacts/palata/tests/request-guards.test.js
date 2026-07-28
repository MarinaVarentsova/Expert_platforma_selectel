/**
 * Unit tests for lib/request-guards.js
 *
 * Run with: node --test tests/request-guards.test.js
 * (Node.js 18+ built-in test runner — no extra deps needed)
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  guardDecline,
  guardTakeWork,
  guardExpertProposeDate,
  guardDeclineStartDate,
  guardCompleteWork,
  guardCustomerComplete,
  guardCustomerCancel,
} from "../lib/request-guards.js";

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 — accepted_work match + in_work request → decline must be blocked
// ─────────────────────────────────────────────────────────────────────────────
describe("guardDecline", () => {
  test("blocks when request is in_work (match any status)", () => {
    const g = guardDecline("in_work", "accepted_work");
    assert.ok(g, "expected a guard conflict");
    assert.equal(g.code, "REQUEST_STATUS_CONFLICT");
    assert.equal(g.error, "Заказ уже в работе");
    assert.equal(g.freshStatus, "in_work");
  });

  test("blocks when request is completed", () => {
    const g = guardDecline("completed", "can_start_from");
    assert.ok(g);
    assert.equal(g.code, "REQUEST_STATUS_CONFLICT");
  });

  test("blocks when request is cancelled", () => {
    const g = guardDecline("cancelled", "can_start_from");
    assert.ok(g);
    assert.equal(g.code, "REQUEST_STATUS_CONFLICT");
  });

  test("blocks when match is accepted_work (core bug scenario)", () => {
    const g = guardDecline("expert_selection", "accepted_work");
    assert.ok(g, "accepted_work → declined must be prevented");
    assert.equal(g.code, "MATCH_ALREADY_RESOLVED");
  });

  test("blocks when match is completed", () => {
    const g = guardDecline("expert_selection", "completed");
    assert.ok(g);
    assert.equal(g.code, "MATCH_ALREADY_RESOLVED");
  });

  test("blocks when match is closed_by_other_expert", () => {
    const g = guardDecline("expert_selection", "closed_by_other_expert");
    assert.ok(g);
    assert.equal(g.code, "MATCH_ALREADY_RESOLVED");
  });

  test("blocks when match is already declined", () => {
    const g = guardDecline("expert_selection", "declined");
    assert.ok(g);
    assert.equal(g.code, "MATCH_ALREADY_RESOLVED");
  });

  test("PASSES for normal decline before work starts (can_start_from match)", () => {
    const g = guardDecline("expert_selection", "can_start_from");
    assert.equal(g, null, "normal pre-work decline must be allowed");
  });

  test("PASSES for normal decline (selected_by_customer match)", () => {
    const g = guardDecline("expert_selection", "selected_by_customer");
    assert.equal(g, null);
  });

  test("PASSES when request is matching status", () => {
    const g = guardDecline("matching", "can_start_from");
    assert.equal(g, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 — take-work / can-start / complete on completed request → 409
// ─────────────────────────────────────────────────────────────────────────────
describe("guardTakeWork", () => {
  test("blocks when request is in_work", () => {
    const g = guardTakeWork("in_work", "can_start_from");
    assert.ok(g);
    assert.equal(g.code, "REQUEST_STATUS_CONFLICT");
    assert.equal(g.error, "Заказ уже в работе");
  });

  test("blocks when request is completed", () => {
    const g = guardTakeWork("completed", "can_start_from");
    assert.ok(g);
    assert.equal(g.code, "REQUEST_STATUS_CONFLICT");
  });

  test("blocks when request is cancelled", () => {
    const g = guardTakeWork("cancelled", "can_start_from");
    assert.ok(g);
    assert.equal(g.code, "REQUEST_STATUS_CONFLICT");
  });

  test("blocks when match status is not allowed (accepted_work)", () => {
    const g = guardTakeWork("expert_selection", "accepted_work");
    assert.ok(g);
    assert.equal(g.code, "MATCH_STATUS_CONFLICT");
  });

  test("blocks when no match found", () => {
    const g = guardTakeWork("expert_selection", null);
    assert.ok(g);
    assert.equal(g.code, "MATCH_STATUS_CONFLICT");
  });

  test("PASSES for can_start_from match + expert_selection request", () => {
    const g = guardTakeWork("expert_selection", "can_start_from");
    assert.equal(g, null);
  });

  test("PASSES for selected_by_customer match + expert_selection request", () => {
    const g = guardTakeWork("expert_selection", "selected_by_customer");
    assert.equal(g, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 — approve/decline start date when request is in_work → 409
// ─────────────────────────────────────────────────────────────────────────────
describe("guardDeclineStartDate", () => {
  test("blocks when request is in_work", () => {
    const g = guardDeclineStartDate("in_work");
    assert.ok(g);
    assert.equal(g.code, "REQUEST_STATUS_CONFLICT");
    assert.equal(g.error, "Заказ уже в работе");
  });

  test("blocks when request is completed", () => {
    const g = guardDeclineStartDate("completed");
    assert.ok(g);
    assert.equal(g.code, "REQUEST_STATUS_CONFLICT");
  });

  test("blocks when request is cancelled", () => {
    const g = guardDeclineStartDate("cancelled");
    assert.ok(g);
    assert.equal(g.code, "REQUEST_STATUS_CONFLICT");
  });

  test("PASSES when request is expert_selection", () => {
    const g = guardDeclineStartDate("expert_selection");
    assert.equal(g, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 — customer cancel when in_work → 409
// ─────────────────────────────────────────────────────────────────────────────
describe("guardCustomerCancel", () => {
  test("blocks when request is in_work", () => {
    const g = guardCustomerCancel("in_work");
    assert.ok(g);
    assert.equal(g.code, "REQUEST_STATUS_CONFLICT");
    assert.equal(g.error, "Заказ уже в работе");
    assert.equal(g.idempotent, undefined);
  });

  test("blocks when request is completed", () => {
    const g = guardCustomerCancel("completed");
    assert.ok(g);
    assert.equal(g.code, "REQUEST_STATUS_CONFLICT");
  });

  test("returns idempotent=true when already cancelled", () => {
    const g = guardCustomerCancel("cancelled");
    assert.ok(g);
    assert.equal(g.idempotent, true);
  });

  test("PASSES when request is in expert_selection", () => {
    const g = guardCustomerCancel("expert_selection");
    assert.equal(g, null);
  });

  test("PASSES when request is matching", () => {
    const g = guardCustomerCancel("matching");
    assert.equal(g, null);
  });

  test("PASSES when request is pending", () => {
    const g = guardCustomerCancel("pending");
    assert.equal(g, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 (cont.) — take-work / can-start on completed request → 409
// ─────────────────────────────────────────────────────────────────────────────
describe("guardExpertProposeDate", () => {
  test("blocks when request is in_work", () => {
    const g = guardExpertProposeDate("in_work");
    assert.ok(g);
    assert.equal(g.code, "REQUEST_STATUS_CONFLICT");
    assert.equal(g.error, "Заказ уже в работе");
  });

  test("blocks when request is completed", () => {
    const g = guardExpertProposeDate("completed");
    assert.ok(g);
    assert.equal(g.code, "REQUEST_STATUS_CONFLICT");
  });

  test("blocks when request is cancelled", () => {
    const g = guardExpertProposeDate("cancelled");
    assert.ok(g);
    assert.equal(g.code, "REQUEST_STATUS_CONFLICT");
  });

  test("PASSES when request is expert_selection", () => {
    const g = guardExpertProposeDate("expert_selection");
    assert.equal(g, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// guardCompleteWork
// ─────────────────────────────────────────────────────────────────────────────
describe("guardCompleteWork", () => {
  test("blocks when request is already completed", () => {
    const g = guardCompleteWork("completed", "expert-1", "expert-1", "accepted_work");
    assert.ok(g);
    assert.equal(g.code, "REQUEST_STATUS_CONFLICT");
  });

  test("blocks when request is cancelled", () => {
    const g = guardCompleteWork("cancelled", "expert-1", "expert-1", "accepted_work");
    assert.ok(g);
    assert.equal(g.code, "REQUEST_STATUS_CONFLICT");
  });

  test("blocks when caller is not the assigned expert", () => {
    const g = guardCompleteWork("in_work", "expert-2", "expert-1", "accepted_work");
    assert.ok(g);
    assert.equal(g.code, "NOT_ASSIGNED_EXPERT");
    assert.equal(g.httpStatus, 403);
  });

  test("blocks when match status is not accepted_work", () => {
    const g = guardCompleteWork("in_work", "expert-1", "expert-1", "can_start_from");
    assert.ok(g);
    assert.equal(g.code, "MATCH_STATUS_CONFLICT");
  });

  test("blocks when no match", () => {
    const g = guardCompleteWork("in_work", "expert-1", "expert-1", null);
    assert.ok(g);
    assert.equal(g.code, "MATCH_STATUS_CONFLICT");
  });

  test("PASSES for assigned expert with accepted_work match in in_work request", () => {
    const g = guardCompleteWork("in_work", "expert-1", "expert-1", "accepted_work");
    assert.equal(g, null);
  });

  test("PASSES when assigned_expert_id is null (legacy data)", () => {
    // assigned_expert_id may be null in edge cases — don't block
    const g = guardCompleteWork("in_work", null, "expert-1", "accepted_work");
    assert.equal(g, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// guardCustomerComplete
// ─────────────────────────────────────────────────────────────────────────────
describe("guardCustomerComplete", () => {
  test("returns idempotent=true when already completed", () => {
    const g = guardCustomerComplete("completed");
    assert.ok(g);
    assert.equal(g.idempotent, true);
  });

  test("blocks when request is cancelled", () => {
    const g = guardCustomerComplete("cancelled");
    assert.ok(g);
    assert.equal(g.code, "REQUEST_STATUS_CONFLICT");
    assert.equal(g.idempotent, undefined);
  });

  test("blocks when request is expert_selection", () => {
    const g = guardCustomerComplete("expert_selection");
    assert.ok(g);
    assert.equal(g.code, "REQUEST_STATUS_CONFLICT");
  });

  test("PASSES when request is in_work", () => {
    const g = guardCustomerComplete("in_work");
    assert.equal(g, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5 — normal flow: propose date → approve → take work
// ─────────────────────────────────────────────────────────────────────────────
describe("Normal scenario: propose date → approve → take work", () => {
  test("step 1: expert proposes date — guardExpertProposeDate passes on expert_selection", () => {
    assert.equal(guardExpertProposeDate("expert_selection"), null);
  });

  test("step 2: customer approves — guardDeclineStartDate passes (not called in approve, just sanity)", () => {
    // approve has its own soft guard; decline guard should also pass here
    assert.equal(guardDeclineStartDate("expert_selection"), null);
  });

  test("step 3: expert takes work — guardTakeWork passes on can_start_from match", () => {
    assert.equal(guardTakeWork("expert_selection", "can_start_from"), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6 — normal decline before in_work is allowed
// ─────────────────────────────────────────────────────────────────────────────
describe("Normal scenario: expert declines before work starts", () => {
  test("decline passes for can_start_from match in expert_selection request", () => {
    assert.equal(guardDecline("expert_selection", "can_start_from"), null);
  });

  test("decline passes for selected_by_customer match", () => {
    assert.equal(guardDecline("expert_selection", "selected_by_customer"), null);
  });

  test("decline is blocked once a different expert took the work (in_work)", () => {
    const g = guardDecline("in_work", "can_start_from");
    assert.ok(g);
    assert.equal(g.code, "REQUEST_STATUS_CONFLICT");
  });
});
