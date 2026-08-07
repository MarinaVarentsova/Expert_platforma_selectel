import { Router } from "express";
import { pool } from "../lib/db";
import { runAllPendingMatching } from "../lib/matcher";
import { logger } from "../lib/logger";

const router = Router();

router.post("/match/run-all", async (req, res) => {
  if (!pool) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  try {
    const result = await runAllPendingMatching(pool);
    req.log.info(result, "Manual match/run-all triggered");
    res.json({ ok: true, ...result });
  } catch (e: unknown) {
    logger.error({ err: (e as Error).message }, "match/run-all failed");
    res.status(500).json({ error: "Matching failed" });
  }
});

export default router;
