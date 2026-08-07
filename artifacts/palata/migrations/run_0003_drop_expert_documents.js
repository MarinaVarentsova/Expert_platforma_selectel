#!/usr/bin/env node
/**
 * One-shot migration runner: drop palata_expert_documents from production.
 *
 * Prerequisites:
 *   - Node.js 18+
 *   - PALATA_DATABASE_URL set in environment
 *
 * Usage (from the repo root or this directory):
 *   PALATA_DATABASE_URL="postgres://..." node artifacts/palata/migrations/run_0003_drop_expert_documents.js
 *
 * The script refuses to proceed if the table contains any rows.
 */

import pg from "pg";

const connectionString = process.env.PALATA_DATABASE_URL;
if (!connectionString) {
  console.error("❌  PALATA_DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

async function run() {
  const client = await pool.connect();
  try {
    // Step 1: Verify the table exists
    const existsResult = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'palata_expert_documents'
      ) AS "exists";
    `);
    const tableExists = existsResult.rows[0].exists;

    if (!tableExists) {
      console.log("ℹ️  Table public.palata_expert_documents does not exist — nothing to do.");
      return;
    }

    // Step 2: Check row count
    const countResult = await client.query(
      "SELECT COUNT(*) AS cnt FROM public.palata_expert_documents;"
    );
    const count = parseInt(countResult.rows[0].cnt, 10);
    console.log(`📊  Row count in palata_expert_documents: ${count}`);

    if (count !== 0) {
      console.error(
        `❌  Table contains ${count} row(s). Aborting — inspect the data before dropping.`
      );
      process.exit(1);
    }

    // Step 3: Drop the table
    await client.query("DROP TABLE IF EXISTS public.palata_expert_documents;");
    console.log("✅  DROP TABLE public.palata_expert_documents executed successfully.");
    console.log(`    Executed at: ${new Date().toISOString()}`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("❌  Unexpected error:", err.message);
  process.exit(1);
});
