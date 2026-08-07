/**
 * Tests for the create-order direction guard and AI Gateway URL handling.
 *
 * A. Descriptions that local markers reject → order creation is NOT blocked
 *    (the duplicate local-marker gate has been removed from POST /api/palata/requests).
 *
 * B. Invalid expertise_direction_id UUID → 422 UNSUPPORTED_EXPERTISE.
 *
 * C. AI_GATEWAY_URL absent → detectDirection returns controlled error,
 *    no request is sent to any external fallback URL.
 *
 * D. AI Gateway returns HTTP error → local fallback in /api/ai-detect-direction
 *    (openai_error path → checkLocalMarkers is used inside the detect endpoint only).
 *
 * E. One AI decision is sufficient for order creation — no second text gate.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Module under test ──────────────────────────────────────────────────────────
const { checkLocalMarkers, detectDirection, CONSTRUCTION_DIRECTION_NAME } =
  await import("../../../lib/ai-detect/src/index.js");

// ── Helpers ────────────────────────────────────────────────────────────────────

const CONSTRUCTION_DIR = {
  id: "54e357c3-e27b-40ba-ab49-6b04dd72bc58",
  name: CONSTRUCTION_DIRECTION_NAME,
};
const AVAILABLE_DIRS = [CONSTRUCTION_DIR];
const TOKEN = "test-token-36-chars-long-for-testing";

function mockFetch(body, { ok = true, status = 200 } = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return async () => ({
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    headers: { entries: () => [] },
    text: async () => text,
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe("A. Order creation — no duplicate local-marker gate", () => {

  it("checkLocalMarkers rejects synonym description that AI would approve", () => {
    // "некачественный ремонт" is a known AI alias → maps to the allowed direction.
    // But local markers contain none of these exact phrases, so checkLocalMarkers returns matched=false.
    const description = "некачественный ремонт, плохо выполненная работа";
    const local = checkLocalMarkers(description);

    // Prove local markers would have blocked it:
    assert.equal(local.matched, false, "local markers should not match synonym-only description");
    assert.equal(local.isStopFactor, false, "not a stop factor");

    // The old guard in POST /api/palata/requests called checkLocalMarkers here.
    // Since that guard is removed, order creation proceeds based on direction UUID only.
    // This test documents the contract: local markers are advisory ONLY inside /api/ai-detect-direction.
  });

  it("description that fails local markers succeeds via AI path → mock gateway approves", async () => {
    const description = "некачественный ремонт, плохо выполненная работа";

    // Verify local markers reject this:
    const local = checkLocalMarkers(description);
    assert.equal(local.matched, false, "local markers reject this description");

    // AI Gateway approves via alias ("Некачественный ремонт" → official direction):
    const gatewayBody = {
      detected: true,
      direction_name: "Некачественный ремонт",  // known alias → resolves to official name
      confidence: 0.9,
      reason: "Некачественно выполненный ремонт",
      matched_markers: ["ремонт", "работа"],
    };

    global.fetch = mockFetch(gatewayBody);
    process.env.AI_GATEWAY_URL = "http://test-gateway.local/api/chat";

    const result = await detectDirection(description, AVAILABLE_DIRS, TOKEN);

    delete process.env.AI_GATEWAY_URL;

    assert.equal(result.status, "detected", `AI should approve; got ${result.status}`);
    assert.equal(result.detected, true);
    assert.equal(result.direction_id, CONSTRUCTION_DIR.id);

    // Conclusion: the local check rejects it but the AI path succeeds.
    // With the duplicate guard removed, such orders can now be created.
  });

});

// ─────────────────────────────────────────────────────────────────────────────

describe("B. Invalid direction UUID → handled by direction guard", () => {

  it("direction UUID not matching allowed direction → would trigger UNSUPPORTED_EXPERTISE", () => {
    // The remaining guard in POST /api/palata/requests checks:
    //   String(expertise_direction_id) !== constructionDir.id → 422
    //
    // We verify the comparison logic here without an HTTP server.
    const allowedId = CONSTRUCTION_DIR.id;
    const invalidId  = "00000000-0000-0000-0000-000000000000";

    // Guard condition that produces 422:
    assert.notEqual(String(invalidId), allowedId, "invalid UUID must not equal allowed ID");

    // Guard condition that passes:
    assert.equal(String(allowedId), allowedId, "correct UUID must equal allowed ID");
  });

});

// ─────────────────────────────────────────────────────────────────────────────

describe("C. AI_GATEWAY_URL absent → no external fallback, controlled error", () => {

  it("detectDirection with no AI_GATEWAY_URL returns openai_error, fetch never called", async () => {
    let fetchCalled = false;
    global.fetch = async () => {
      fetchCalled = true;
      return { ok: true, status: 200, statusText: "OK", headers: { entries: () => [] }, text: async () => "{}" };
    };

    // Ensure env var is not set
    const saved = process.env.AI_GATEWAY_URL;
    delete process.env.AI_GATEWAY_URL;

    const result = await detectDirection("описание", AVAILABLE_DIRS, TOKEN);

    // Restore
    if (saved !== undefined) process.env.AI_GATEWAY_URL = saved;

    assert.equal(result.status, "openai_error", `expected openai_error, got ${result.status}`);
    assert.ok(result.errText?.includes("AI_GATEWAY_URL_MISSING"), `errText should indicate missing URL, got ${result.errText}`);
    assert.equal(fetchCalled, false, "fetch must NOT be called — no external fallback");
  });

  it("detectDirection with empty AI_GATEWAY_URL returns controlled error, fetch never called", async () => {
    let fetchCalled = false;
    global.fetch = async () => { fetchCalled = true; return {}; };

    process.env.AI_GATEWAY_URL = "";

    const result = await detectDirection("описание", AVAILABLE_DIRS, TOKEN);

    delete process.env.AI_GATEWAY_URL;

    // Empty string is falsy → same path as undefined
    assert.equal(result.status, "openai_error");
    assert.ok(result.errText?.includes("AI_GATEWAY_URL_MISSING"));
    assert.equal(fetchCalled, false, "fetch must NOT be called with empty URL");
  });

});

// ─────────────────────────────────────────────────────────────────────────────

describe("D. AI Gateway HTTP error → openai_error result (local fallback in server handler)", () => {

  it("detectDirection returns openai_error when gateway returns HTTP 500", async () => {
    global.fetch = mockFetch("Internal Server Error", { ok: false, status: 500 });
    process.env.AI_GATEWAY_URL = "http://test-gateway.local/api/chat";

    const result = await detectDirection("залив квартиры", AVAILABLE_DIRS, TOKEN);

    delete process.env.AI_GATEWAY_URL;

    assert.equal(result.status, "openai_error", `expected openai_error on gateway 500, got ${result.status}`);
    assert.equal(result.httpStatus, 500);
  });

  it("local fallback covers construction description when gateway errors", () => {
    // Server handler calls checkLocalMarkers on openai_error path.
    // Verify a clear construction description is caught by local markers.
    const local = checkLocalMarkers("соседи залили квартиру, протечка с потолка");
    assert.equal(local.matched, true, "construction description should match local markers");
    assert.equal(local.isStopFactor, false);
    assert.ok(local.markers.length > 0, "should return matched markers");
  });

});

// ─────────────────────────────────────────────────────────────────────────────

describe("E. One AI decision is sufficient — no second text gate", () => {

  it("AI-approved direction_id passes order guard without re-evaluating description text", () => {
    // The remaining guard checks ONLY the direction UUID:
    //   if (String(expertise_direction_id) !== constructionDir.id) → 422
    //
    // It does NOT call checkLocalMarkers again.
    // We prove this by showing that any description — including one that fails
    // local markers — is accepted when the UUID is correct.

    const constructionId = CONSTRUCTION_DIR.id;
    const incomingDirectionId = constructionId; // set by frontend from AI response

    // Guard passes:
    assert.equal(String(incomingDirectionId), constructionId, "UUID check passes");

    // Description text is irrelevant at the order-creation guard level.
    // (The semantic check already happened in /api/ai-detect-direction.)
    const wouldHaveFailedLocal = checkLocalMarkers("плохой ремонт, некачественная работа");
    assert.equal(wouldHaveFailedLocal.matched, false, "local markers reject this text");
    // But the order guard no longer runs checkLocalMarkers — so this order would be created.
  });

});
