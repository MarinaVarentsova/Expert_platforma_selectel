/**
 * Tests for the AI Gateway response adapter in lib/ai-detect/src/index.js
 *
 * Covers:
 *  1. snake_case response (Yandex direct format) → detected=true, allowed
 *  2. camelCase response (alternate gateway format) → same result
 *  3. detected=false → not_detected
 *  4. Unknown direction_name → safe no_match fallback
 *  5. OpenAI-wrapper format (choices[0].message.content) → still works
 */

import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONSTRUCTION_DIR = {
  id: "11111111-0000-0000-0000-000000000001",
  name: "Строительно-техническая экспертиза",
};
const AVAILABLE_DIRS = [CONSTRUCTION_DIR];
const TOKEN = "test-token";

/**
 * Build a mock fetch that returns the given gateway body.
 * Two formats are exercised:
 *   direct  – { detected, direction_name, ... }   (Yandex provider)
 *   choices – { choices: [{ message: { content: "..." } }] }  (OpenAI-compat)
 */
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

// ── Import the module under test ──────────────────────────────────────────────

// Because detectDirection uses the global `fetch`, we replace it before each test.
const { detectDirection, CONFIDENCE_THRESHOLD } = await import("../../../lib/ai-detect/src/index.js");

// ─────────────────────────────────────────────────────────────────────────────

describe("AI Gateway adapter — response format normalization", () => {

  // 1. snake_case, direct format (Yandex)
  it("snake_case direct format → detected=true, correct direction", async () => {
    const gatewayBody = {
      detected: true,
      direction_name: "Строительно-техническая экспертиза",
      confidence: 0.95,
      reason: "Дефекты ремонта",
      matched_markers: ["отваливается плитка"],
    };

    global.fetch = mockFetch(gatewayBody);

    const result = await detectDirection(
      "После ремонта отваливается плитка от стены",
      AVAILABLE_DIRS,
      TOKEN,
    );

    assert.equal(result.status, "detected", `expected status=detected, got ${result.status}`);
    assert.equal(result.detected, true);
    assert.equal(result.direction_id, CONSTRUCTION_DIR.id);
    assert.equal(result.direction_name, CONSTRUCTION_DIR.name);
    assert.ok(result.confidence >= CONFIDENCE_THRESHOLD);
    assert.ok(Array.isArray(result.matched_markers) && result.matched_markers.length > 0);
  });

  // 2. camelCase, direct format
  it("camelCase direct format → same result as snake_case", async () => {
    const gatewayBody = {
      detected: true,
      directionName: "Строительно-техническая экспертиза",
      confidence: 0.95,
      reason: "Дефекты ремонта",
      matchedMarkers: ["отваливается плитка"],
    };

    global.fetch = mockFetch(gatewayBody);

    const result = await detectDirection(
      "После ремонта отваливается плитка от стены",
      AVAILABLE_DIRS,
      TOKEN,
    );

    assert.equal(result.status, "detected");
    assert.equal(result.detected, true);
    assert.equal(result.direction_id, CONSTRUCTION_DIR.id);
    assert.equal(result.direction_name, CONSTRUCTION_DIR.name);
    assert.ok(result.confidence >= CONFIDENCE_THRESHOLD);
    assert.ok(Array.isArray(result.matched_markers) && result.matched_markers.length > 0);
  });

  // 3. detected=false → not_detected
  it("detected=false → status=not_detected", async () => {
    const gatewayBody = {
      detected: false,
      direction_name: null,
      confidence: 0.1,
      reason: "Не строительная экспертиза",
      matched_markers: [],
    };

    global.fetch = mockFetch(gatewayBody);

    const result = await detectDirection(
      "Хочу узнать стоимость мебели",
      AVAILABLE_DIRS,
      TOKEN,
    );

    assert.equal(result.status, "not_detected");
    assert.equal(result.detected, false);
    assert.equal(result.direction_id, null);
  });

  // 4. Unknown direction_name → no_match (safe fallback)
  it("unknown direction_name → status=no_match, no crash", async () => {
    const gatewayBody = {
      detected: true,
      direction_name: "Почерковедческая экспертиза",
      confidence: 0.9,
      reason: "Спор о подписи",
      matched_markers: ["подпись"],
    };

    global.fetch = mockFetch(gatewayBody);

    const result = await detectDirection(
      "Нужна экспертиза подписи на документе",
      AVAILABLE_DIRS,
      TOKEN,
    );

    assert.equal(result.status, "no_match");
    assert.equal(result.detected, false);
    assert.equal(result.direction_id, null);
  });

  // 5. OpenAI-wrapper format still works
  it("OpenAI choices wrapper format → detected=true", async () => {
    const contentObj = {
      detected: true,
      direction_name: "Строительно-техническая экспертиза",
      confidence: 0.88,
      reason: "Залив",
      matched_markers: ["залив"],
    };
    const gatewayBody = {
      choices: [
        { message: { content: JSON.stringify(contentObj) } },
      ],
    };

    global.fetch = mockFetch(gatewayBody);

    const result = await detectDirection(
      "Соседи залили квартиру",
      AVAILABLE_DIRS,
      TOKEN,
    );

    assert.equal(result.status, "detected");
    assert.equal(result.detected, true);
    assert.equal(result.direction_id, CONSTRUCTION_DIR.id);
  });

  // 6. confidence below threshold → not_detected
  it("low confidence → not_detected", async () => {
    const gatewayBody = {
      detected: true,
      direction_name: "Строительно-техническая экспертиза",
      confidence: 0.3,
      reason: "Слабый сигнал",
      matched_markers: ["ремонт"],
    };

    global.fetch = mockFetch(gatewayBody);

    const result = await detectDirection(
      "Ремонт",
      AVAILABLE_DIRS,
      TOKEN,
    );

    assert.equal(result.status, "not_detected");
    assert.equal(result.detected, false);
  });

});
