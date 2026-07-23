import { Router, type Request, type Response } from "express";
import pg from "pg";

const { Pool } = pg;
const router = Router();

router.post("/admin/delete-palata-user", async (req: Request, res: Response) => {
  const { user_id, secret } = req.body as { user_id?: string; secret?: string };

  if (secret !== "palata-temp-delete-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  if (!user_id || !/^[0-9a-f-]{36}$/i.test(user_id)) {
    res.status(400).json({ error: "invalid user_id" });
    return;
  }

  const url = process.env["PALATA_DATABASE_URL"];
  if (!url) {
    res.status(503).json({ error: "PALATA_DATABASE_URL not set" });
    return;
  }

  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const log: string[] = [];

  try {
    await client.query("BEGIN");

    const steps: [string, string][] = [
      ["palata_action_items",       "customer_id"],
      ["palata_action_items",       "assigned_to_user_id"],
      ["palata_customer_ratings",   "customer_id"],
      ["palata_expert_ratings",     "customer_id"],
      ["palata_email_events",       "recipient_id"],
      ["palata_request_files",      "uploader_id"],
      ["palata_status_events",      "actor_id"],
      ["palata_requests",           "customer_id"],
      ["palata_customer_profiles",  "user_id"],
      ["palata_expert_regions",     "user_id"],
      ["palata_expert_directions",  "user_id"],
      ["palata_expert_certificates","user_id"],
      ["palata_expert_profiles",    "user_id"],
      ["palata_users",              "id"],
    ];

    for (const [table, col] of steps) {
      try {
        const r = await client.query(
          `DELETE FROM ${table} WHERE ${col} = $1`,
          [user_id],
        );
        log.push(`✓ ${table}.${col} → ${r.rowCount} deleted`);
      } catch (e) {
        log.push(`⚠ SKIP ${table}.${col}: ${(e as Error).message}`);
      }
    }

    await client.query("COMMIT");

    const check = await client.query(
      "SELECT COUNT(*)::int AS n FROM palata_users WHERE id = $1",
      [user_id],
    );
    const remaining = check.rows[0]?.n ?? "?";
    log.push(`CHECK palata_users remaining: ${remaining}`);

    res.json({ ok: true, remaining, log });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(500).json({ ok: false, error: (e as Error).message, log });
  } finally {
    client.release();
    await pool.end();
  }
});

export default router;
