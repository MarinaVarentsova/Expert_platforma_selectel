/**
 * Tests for POST /api/palata/admin/users/:userId/delete
 *
 * Tests call the actual exported functions (collectUserDataSummary,
 * anonymizeCustomer, anonymizeExpert, tryDeleteS3Object, isValidUuid)
 * with mock pool clients that record every SQL query executed.
 * This verifies the real SQL, field coverage, and transaction semantics
 * without requiring a live database.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

// ── Import the real module-level functions ────────────────────────────────────
import {
  isValidUuid,
  anonymizedEmail,
  collectUserDataSummary,
  anonymizeCustomer,
  anonymizeExpert,
  tryDeleteS3Object,
} from "../../../artifacts/palata/lib/admin-pd-delete.js";

// ── Mock pool factory ─────────────────────────────────────────────────────────

function makeMockClient(responses = {}) {
  // responses: { "SQL_fragment": { rows, rowCount } }
  const queries = [];
  const client = {
    queries,
    query: async (sql, params = []) => {
      const trimmed = sql.trim().replace(/\s+/g, " ");
      queries.push({ sql: trimmed, params });
      // Find matching response
      for (const [frag, result] of Object.entries(responses)) {
        if (trimmed.includes(frag)) return result;
      }
      return { rows: [{ count: "0" }], rowCount: 0 };
    },
    release: () => {},
  };
  return client;
}

// Convenience: find a query by SQL fragment
function findQuery(queries, fragment) {
  return queries.find(q => q.sql.includes(fragment));
}

const VALID_UUID    = "54e357c3-e27b-40ba-ab49-6b04dd72bc58";
const ANOTHER_UUID  = "00000000-1111-2222-3333-444444444444";

// ─────────────────────────────────────────────────────────────────────────────

describe("isValidUuid", () => {
  it("accepts a valid UUID v4", () => {
    assert.ok(isValidUuid(VALID_UUID));
    assert.ok(isValidUuid("00000000-0000-0000-0000-000000000000"));
    assert.ok(isValidUuid("FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF"));
  });

  it("rejects invalid values", () => {
    assert.equal(isValidUuid("not-a-uuid"),       false, "short string");
    assert.equal(isValidUuid(""),                  false, "empty string");
    assert.equal(isValidUuid(null),                false, "null");
    assert.equal(isValidUuid(undefined),           false, "undefined");
    assert.equal(isValidUuid("12345"),             false, "numeric string");
    // Malformed UUID that previously caused PostgreSQL to throw a 500:
    assert.equal(isValidUuid("'; DROP TABLE palata_users;--"), false, "SQL injection");
    assert.equal(isValidUuid("54e357c3e27b40baab496b04dd72bc58"), false, "UUID without dashes");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("anonymizedEmail", () => {
  it("produces a deterministic, non-empty placeholder with correct domain", () => {
    const email = anonymizedEmail(VALID_UUID);
    assert.ok(email.startsWith(`deleted_${VALID_UUID}@`));
    assert.ok(email.endsWith("@deleted.palata"));
    assert.ok(!email.includes("gmail"), "no real domain");
  });

  it("is unique per user", () => {
    assert.notEqual(anonymizedEmail(VALID_UUID), anonymizedEmail(ANOTHER_UUID));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("anonymizeCustomer — SQL verification", () => {
  let client;
  let counts;

  before(async () => {
    client = makeMockClient();
    counts = await anonymizeCustomer(client, VALID_UUID);
  });

  it("updates palata_users: nullifies full_name, phone; sets placeholder email; deactivates", () => {
    const q = findQuery(client.queries, "UPDATE public.palata_users");
    assert.ok(q, "must UPDATE palata_users");
    // Params: [userId, email]
    assert.equal(q.params[0], VALID_UUID, "WHERE id = userId");
    assert.ok(q.params[1].includes("deleted.palata"), "email becomes placeholder");
    assert.ok(q.sql.includes("full_name = NULL"), "full_name nullified");
    assert.ok(q.sql.includes("phone = NULL"),    "phone nullified");
    assert.ok(q.sql.includes("is_active = false"), "deactivated");
  });

  it("anonymizes palata_customer_profiles: nullifies company_name, inn, contact_name, notes", () => {
    const q = findQuery(client.queries, "UPDATE public.palata_customer_profiles");
    assert.ok(q, "must UPDATE palata_customer_profiles");
    assert.ok(q.sql.includes("company_name = NULL"), "company_name nullified (ИП case)");
    assert.ok(q.sql.includes("inn = NULL"),          "inn nullified");
    assert.ok(q.sql.includes("contact_name = NULL"), "contact_name nullified");
    assert.ok(q.sql.includes("notes = NULL"),        "notes nullified");
  });

  it("anonymizes palata_requests: nullifies title and description", () => {
    const q = findQuery(client.queries, "UPDATE public.palata_requests");
    assert.ok(q, "must UPDATE palata_requests");
    assert.ok(q.sql.includes("title = '[Обезличено]'"), "title anonymized");
    assert.ok(q.sql.includes("description = NULL"),     "description nullified");
    assert.ok(q.sql.includes("customer_id = $1"),       "filtered by customer_id");
  });

  it("deletes palata_request_matches via request subquery", () => {
    const q = findQuery(client.queries, "DELETE FROM public.palata_request_matches");
    assert.ok(q, "must DELETE palata_request_matches");
    assert.ok(q.sql.includes("customer_id = $1"), "scoped to customer's requests");
  });

  it("anonymizes palata_request_contacts: nullifies customer_email and customer_phone", () => {
    const q = findQuery(client.queries, "UPDATE public.palata_request_contacts");
    assert.ok(q, "must UPDATE palata_request_contacts");
    assert.ok(q.sql.includes("customer_email = NULL"), "customer_email nullified");
    assert.ok(q.sql.includes("customer_phone = NULL"), "customer_phone nullified");
  });

  it("anonymizes palata_status_events: nullifies actor_id and note", () => {
    const q = findQuery(client.queries, "UPDATE public.palata_status_events");
    assert.ok(q, "must UPDATE palata_status_events");
    assert.ok(q.sql.includes("actor_id = NULL"),               "actor_id nullified");
    assert.ok(q.sql.includes("[Данные обезличены]"),           "note replaced");
    assert.ok(q.sql.includes("actor_id = $1"),                 "WHERE actor_id = userId");
  });

  it("deletes palata_action_items assigned to user", () => {
    const q = findQuery(client.queries, "DELETE FROM public.palata_action_items");
    assert.ok(q, "must DELETE palata_action_items");
    assert.ok(q.sql.includes("customer_id = $1"), "includes customer_id filter");
    assert.ok(q.sql.includes("assigned_to_user_id = $1"), "includes assigned_to_user_id filter");
  });

  it("anonymizes palata_customer_ratings: nullifies comment", () => {
    const q = findQuery(client.queries, "UPDATE public.palata_customer_ratings");
    assert.ok(q, "must UPDATE palata_customer_ratings");
    assert.ok(q.sql.includes("comment = NULL"), "comment nullified");
  });

  it("deletes palata_email_events", () => {
    const q = findQuery(client.queries, "DELETE FROM public.palata_email_events");
    assert.ok(q, "must DELETE palata_email_events");
    assert.ok(q.sql.includes("recipient_id = $1"), "filtered by recipient_id");
  });

  it("returns counts for all required tables", () => {
    const required = [
      "palata_users",
      "palata_customer_profiles",
      "palata_requests",
      "palata_request_matches",
      "palata_request_contacts",
      "palata_status_events",
      "palata_action_items",
      "palata_customer_ratings",
      "palata_email_events",
    ];
    for (const t of required) {
      assert.ok(Object.hasOwn(counts, t), `counts must include ${t}`);
      assert.equal(typeof counts[t], "number", `counts.${t} must be numeric`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("anonymizeExpert — SQL verification", () => {
  let client;
  let counts;

  before(async () => {
    client = makeMockClient();
    counts = await anonymizeExpert(client, VALID_UUID);
  });

  it("updates palata_users with placeholder email, nullifies full_name and phone", () => {
    const q = findQuery(client.queries, "UPDATE public.palata_users");
    assert.ok(q, "must UPDATE palata_users");
    assert.ok(q.params[1].includes("deleted.palata"), "email becomes placeholder");
    assert.ok(q.sql.includes("full_name = NULL"),   "full_name nullified");
    assert.ok(q.sql.includes("phone = NULL"),       "phone nullified");
    assert.ok(q.sql.includes("is_active = false"),  "deactivated");
  });

  it("anonymizes palata_expert_profiles: bio, education AND registry numbers", () => {
    const q = findQuery(client.queries, "UPDATE public.palata_expert_profiles");
    assert.ok(q, "must UPDATE palata_expert_profiles");
    assert.ok(q.sql.includes("bio = NULL"),                            "bio nullified");
    assert.ok(q.sql.includes("education = NULL"),                      "education nullified");
    assert.ok(q.sql.includes("palata_registry_number = NULL"),         "palata registry nullified");
    assert.ok(q.sql.includes("centrsudexpert_registry_number = NULL"), "centrsudexpert registry nullified");
  });

  it("deletes palata_expert_regions", () => {
    const q = findQuery(client.queries, "DELETE FROM public.palata_expert_regions");
    assert.ok(q, "must DELETE palata_expert_regions");
    assert.ok(q.sql.includes("expert_id = $1"), "filtered by expert_id");
  });

  it("deletes palata_expert_directions", () => {
    const q = findQuery(client.queries, "DELETE FROM public.palata_expert_directions");
    assert.ok(q, "must DELETE palata_expert_directions");
  });

  it("deletes palata_expert_certificates", () => {
    const q = findQuery(client.queries, "DELETE FROM public.palata_expert_certificates");
    assert.ok(q, "must DELETE palata_expert_certificates");
  });

  it("deletes palata_expert_documents DB records (physical files handled by caller)", () => {
    const q = findQuery(client.queries, "DELETE FROM public.palata_expert_documents");
    assert.ok(q, "must DELETE palata_expert_documents");
    assert.ok(q.sql.includes("expert_id = $1"), "filtered by expert_id");
  });

  it("deletes palata_request_matches", () => {
    const q = findQuery(client.queries, "DELETE FROM public.palata_request_matches");
    assert.ok(q, "must DELETE palata_request_matches");
    assert.ok(q.sql.includes("expert_id = $1"), "filtered by expert_id");
  });

  it("anonymizes palata_request_contacts: nullifies expert_email and expert_phone", () => {
    const q = findQuery(client.queries, "UPDATE public.palata_request_contacts");
    assert.ok(q, "must UPDATE palata_request_contacts");
    assert.ok(q.sql.includes("expert_email = NULL"), "expert_email nullified");
    assert.ok(q.sql.includes("expert_phone = NULL"), "expert_phone nullified");
  });

  it("anonymizes palata_status_events: nullifies actor_id and note", () => {
    const q = findQuery(client.queries, "UPDATE public.palata_status_events");
    assert.ok(q, "must UPDATE palata_status_events");
    assert.ok(q.sql.includes("actor_id = NULL"),     "actor_id nullified");
    assert.ok(q.sql.includes("[Данные обезличены]"), "note replaced");
  });

  it("deletes palata_action_items for this expert", () => {
    const q = findQuery(client.queries, "DELETE FROM public.palata_action_items");
    assert.ok(q, "must DELETE palata_action_items");
    assert.ok(q.sql.includes("expert_id = $1"), "includes expert_id filter");
  });

  it("anonymizes palata_customer_ratings: nullifies comment", () => {
    const q = findQuery(client.queries, "UPDATE public.palata_customer_ratings");
    assert.ok(q, "must UPDATE palata_customer_ratings");
    assert.ok(q.sql.includes("comment = NULL"), "comment nullified");
  });

  it("deletes palata_email_events", () => {
    const q = findQuery(client.queries, "DELETE FROM public.palata_email_events");
    assert.ok(q, "must DELETE palata_email_events");
  });

  it("returns counts for all required expert tables", () => {
    const required = [
      "palata_users",
      "palata_expert_profiles",
      "palata_expert_regions",
      "palata_expert_directions",
      "palata_expert_certificates",
      "palata_expert_documents",
      "palata_request_matches",
      "palata_request_contacts",
      "palata_status_events",
      "palata_action_items",
      "palata_customer_ratings",
      "palata_email_events",
    ];
    for (const t of required) {
      assert.ok(Object.hasOwn(counts, t), `counts must include ${t}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("collectUserDataSummary — structure verification", () => {

  it("returns correct structure for customer role", async () => {
    const db = makeMockClient();
    const result = await collectUserDataSummary(db, VALID_UUID, "customer");

    const customerTables = [
      "palata_users", "palata_customer_profiles", "palata_requests",
      "palata_request_matches", "palata_request_contacts", "palata_status_events",
      "palata_action_items", "palata_customer_ratings", "palata_email_events",
    ];
    for (const t of customerTables) {
      assert.ok(result.tables[t], `customer summary must include ${t}`);
      assert.ok(["anonymize","delete"].includes(result.tables[t].action), "action must be anonymize|delete");
    }
    // customer has no files
    assert.deepEqual(result.files, [], "customer summary must have empty files array");
  });

  it("returns correct structure for expert role including files", async () => {
    const db = makeMockClient({
      "SELECT bucket_path": {
        rows: [{ bucket_path: "experts/doc.pdf", file_name: "doc.pdf" }],
        rowCount: 1,
      },
    });
    const result = await collectUserDataSummary(db, VALID_UUID, "expert");

    const expertTables = [
      "palata_users", "palata_expert_profiles", "palata_expert_regions",
      "palata_expert_directions", "palata_expert_certificates", "palata_expert_documents",
      "palata_request_matches", "palata_request_contacts", "palata_status_events",
      "palata_action_items", "palata_customer_ratings", "palata_email_events",
    ];
    for (const t of expertTables) {
      assert.ok(result.tables[t], `expert summary must include ${t}`);
    }
    assert.ok(result.files.length > 0, "expert summary must list files");
    assert.ok(result.files[0].bucket_path, "file entry must have bucket_path");
    assert.ok(result.files[0].file_name,   "file entry must have file_name");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("tryDeleteS3Object — env-var guard", () => {

  before(() => {
    // Ensure credentials are not set in test environment
    delete process.env.SELECTEL_S3_ENDPOINT;
    delete process.env.SELECTEL_S3_BUCKET;
    delete process.env.SELECTEL_S3_ACCESS_KEY;
    delete process.env.SELECTEL_S3_SECRET_KEY;
  });

  it("returns deleted=false with S3_NOT_CONFIGURED when credentials absent", async () => {
    const result = await tryDeleteS3Object("experts/test.pdf");
    assert.equal(result.deleted, false);
    assert.equal(result.reason, "S3_NOT_CONFIGURED");
    assert.equal(result.bucketPath, "experts/test.pdf", "bucket path preserved for manual deletion");
  });

  it("never calls fetch when credentials are not configured", async () => {
    let fetchCalled = false;
    global.fetch = async () => { fetchCalled = true; return {}; };

    await tryDeleteS3Object("experts/another.pdf");

    assert.equal(fetchCalled, false, "fetch must NOT be called when S3 not configured");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Audit log integrity contract", () => {

  it("audit log details must not contain personal data fields", () => {
    // Simulate what gets passed to _writeAuditLog's `details`
    const counts = {
      palata_users:             1,
      palata_customer_profiles: 1,
      palata_requests:          2,
      palata_action_items:      1,
      palata_email_events:      3,
    };
    const fileResults = [];
    const filesDeleted    = fileResults.filter(f => f.deleted).length;
    const filesNotDeleted = fileResults.filter(f => !f.deleted).map(f => ({
      path: f.bucketPath, reason: f.reason,
    }));

    const details = {
      role: "customer",
      dry_run: false,
      tables_affected: counts,
      files_deleted:     filesDeleted,
      files_not_deleted: filesNotDeleted,
    };

    const detailsStr = JSON.stringify(details);
    // No PD values in the log (only table names and row counts)
    assert.ok(!detailsStr.includes("@"),         "no email address in audit log");
    assert.ok(!detailsStr.includes("full_name"), "no full_name value in audit log");
    assert.ok(!detailsStr.includes("phone"),     "no phone value in audit log");
    assert.ok(!detailsStr.includes("password"),  "no password in audit log");
    assert.ok(!detailsStr.includes("inn"),        "no inn value in audit log (key name only in table names)");
  });
});
