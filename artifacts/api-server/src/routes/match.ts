import { Router } from "express";
import { supabase } from "../lib/supabase";
import { runAllPendingMatching } from "../lib/matcher";
import { logger } from "../lib/logger";

const router = Router();

router.post("/match/run-all", async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Supabase not configured" });
    return;
  }
  try {
    const result = await runAllPendingMatching(supabase);
    req.log.info(result, "Manual match/run-all triggered");
    res.json({ ok: true, ...result });
  } catch (e: unknown) {
    logger.error({ err: (e as Error).message }, "match/run-all failed");
    res.status(500).json({ error: "Matching failed" });
  }
});

export default router;
