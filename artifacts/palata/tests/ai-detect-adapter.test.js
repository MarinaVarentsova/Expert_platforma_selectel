/**
 * Tests for the AI Gateway response adapter in lib/ai-detect/src/index.js
 *
 * Section 1 — Format normalization:
 *  1. snake_case response (Yandex direct format) → detected=true, allowed
 *  2. camelCase response (alternate gateway format) → same result
 *  3. detected=false → not_detected
 *  4. Unknown direction_name → safe no_match fallback
 *  5. OpenAI-wrapper format (choices[0].message.content) → still works
 *  6. low confidence → not_detected
 *
 * Section 2 — Alias normalization (resolveDirectionName):
 *  A. "Некачественный ремонт" → "Строительно-техническая экспертиза"
 *  B. "Дефекты отделки" → same
 *  C. "Строительно-техническая экспертиза" (exact) → unchanged
 *  D. Unknown alias → no_match, no crash
 *  E. detected=false, direction_name=null → stays rejected
 */

import { describe, it } from "node:test";
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
const { detectDirection, resolveDirectionName, DIRECTION_ALIASES, CONFIDENCE_THRESHOLD } = await import("../../../lib/ai-detect/src/index.js");

// All tests in this file use mocked fetch. Set AI_GATEWAY_URL so detectDirection
// does not return AI_GATEWAY_URL_MISSING before reaching the mock.
process.env.AI_GATEWAY_URL = "http://test-gateway.local/api/chat";

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

  // 7. Russian field names from Yandex gateway → detected=true works
  it("Russian field names (обнаружено/уверенность) → detected=true, correct direction", async () => {
    // Yandex sometimes returns mixed-language keys: detected/confidence in Russian
    const gatewayBody = {
      "обнаружено": true,
      direction_name: "Строительно-техническая экспертиза",
      "уверенность": 0.9,
      "причина": "Залив квартиры",
      matched_markers: ["залив", "протечка"],
    };

    global.fetch = mockFetch(gatewayBody);

    const result = await detectDirection(
      "Соседи залили квартиру, затопило весь паркет",
      AVAILABLE_DIRS,
      TOKEN,
    );

    assert.equal(result.status, "detected", `expected detected, got ${result.status}`);
    assert.equal(result.detected, true);
    assert.equal(result.direction_id, CONSTRUCTION_DIR.id);
    assert.equal(result.direction_name, CONSTRUCTION_DIR.name);
    assert.ok(result.confidence >= CONFIDENCE_THRESHOLD);
  });

  // 8. Russian detected=false (ложно) → correctly rejected
  it("Russian обнаружено=false (ложно) → not_detected", async () => {
    const gatewayBody = {
      "обнаружено": false,
      direction_name: null,
      "уверенность": 0,
      "причина": "Стоп-фактор: очаг возгорания",
      matched_markers: ["пожар", "очаг возгорания"],
    };

    global.fetch = mockFetch(gatewayBody);

    const result = await detectDirection(
      "Нужно установить очаг возгорания после пожара",
      AVAILABLE_DIRS,
      TOKEN,
    );

    assert.equal(result.status, "not_detected");
    assert.equal(result.detected, false);
    assert.equal(result.direction_id, null);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Alias normalization (resolveDirectionName + detectDirection)
// ─────────────────────────────────────────────────────────────────────────────

describe("Alias normalization — resolveDirectionName unit tests", () => {

  it("A. 'Некачественный ремонт' → 'Строительно-техническая экспертиза'", () => {
    const resolved = resolveDirectionName("Некачественный ремонт", AVAILABLE_DIRS);
    assert.equal(resolved, CONSTRUCTION_DIR.name);
  });

  it("B. 'Дефекты отделки' → 'Строительно-техническая экспертиза'", () => {
    const resolved = resolveDirectionName("Дефекты отделки", AVAILABLE_DIRS);
    assert.equal(resolved, CONSTRUCTION_DIR.name);
  });

  it("C. Exact official name → returned unchanged", () => {
    const resolved = resolveDirectionName("Строительно-техническая экспертиза", AVAILABLE_DIRS);
    assert.equal(resolved, CONSTRUCTION_DIR.name);
  });

  it("D. Unknown alias → input returned (no crash, no wrong assignment)", () => {
    const input = "Какая-то неизвестная категория";
    const resolved = resolveDirectionName(input, AVAILABLE_DIRS);
    assert.equal(resolved, input, "unknown alias must be returned as-is");
  });

  it("All aliases in DIRECTION_ALIASES map to a name present in AVAILABLE_DIRS", () => {
    for (const [alias, canonicalName] of DIRECTION_ALIASES) {
      const found = AVAILABLE_DIRS.some(d => d.name === canonicalName);
      assert.ok(
        found,
        `Alias '${alias}' maps to '${canonicalName}', which is NOT in AVAILABLE_DIRS`,
      );
    }
  });

});

describe("Alias normalization — end-to-end via detectDirection", () => {

  // A. Gateway returns "Некачественный ремонт" → server maps to official name → detected=true
  it("A. 'Некачественный ремонт' from gateway → detected=true, official direction", async () => {
    const gatewayBody = {
      detected: true,
      direction_name: "Некачественный ремонт",
      confidence: 0.95,
      reason: "Плитка отваливается",
      matched_markers: ["плитка отваливается"],
    };

    global.fetch = mockFetch(gatewayBody);

    const result = await detectDirection(
      "После ремонта отваливается плитка от стены",
      AVAILABLE_DIRS,
      TOKEN,
    );

    assert.equal(result.status, "detected", `expected detected, got ${result.status}`);
    assert.equal(result.detected, true);
    assert.equal(result.direction_id, CONSTRUCTION_DIR.id);
    assert.equal(result.direction_name, CONSTRUCTION_DIR.name);
  });

  // B. Gateway returns "Дефекты отделки" → same result
  it("B. 'Дефекты отделки' from gateway → detected=true, official direction", async () => {
    const gatewayBody = {
      detected: true,
      direction_name: "Дефекты отделки",
      confidence: 0.9,
      reason: "Дефекты ремонта",
      matched_markers: ["неровные стены"],
    };

    global.fetch = mockFetch(gatewayBody);

    const result = await detectDirection(
      "Рабочие плохо выровняли стены",
      AVAILABLE_DIRS,
      TOKEN,
    );

    assert.equal(result.status, "detected");
    assert.equal(result.detected, true);
    assert.equal(result.direction_id, CONSTRUCTION_DIR.id);
    assert.equal(result.direction_name, CONSTRUCTION_DIR.name);
  });

  // C. Gateway returns exact official name → still works
  it("C. Exact official name from gateway → detected=true", async () => {
    const gatewayBody = {
      detected: true,
      direction_name: "Строительно-техническая экспертиза",
      confidence: 0.92,
      reason: "Залив",
      matched_markers: ["залив"],
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

  // D. Truly unknown value → no_match (safe fallback, no crash)
  it("D. Completely unknown direction → no_match, no crash", async () => {
    const gatewayBody = {
      detected: true,
      direction_name: "Абсолютно неизвестная категория экспертизы",
      confidence: 0.88,
      reason: "Что-то",
      matched_markers: ["маркер"],
    };

    global.fetch = mockFetch(gatewayBody);

    const result = await detectDirection(
      "Неизвестный запрос",
      AVAILABLE_DIRS,
      TOKEN,
    );

    assert.equal(result.status, "no_match");
    assert.equal(result.detected, false);
    assert.equal(result.direction_id, null);
    assert.equal(result.direction_name, null);
  });

  // E. detected=false, direction_name=null → stays rejected regardless of aliases
  it("E. detected=false + direction_name=null → not_detected", async () => {
    const gatewayBody = {
      detected: false,
      direction_name: null,
      confidence: 0,
      reason: "Не строительная экспертиза",
      matched_markers: [],
    };

    global.fetch = mockFetch(gatewayBody);

    const result = await detectDirection(
      "Оцените стоимость дивана",
      AVAILABLE_DIRS,
      TOKEN,
    );

    assert.equal(result.status, "not_detected");
    assert.equal(result.detected, false);
    assert.equal(result.direction_id, null);
  });

});
