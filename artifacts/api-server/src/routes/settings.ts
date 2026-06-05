import { Router } from "express";
import { supabase } from "../lib/supabase";
import { getIntervalMinutes, setIntervalMinutes } from "../lib/scheduler";

const router = Router();

router.get("/settings/matching-interval", (_req, res) => {
  res.json({ intervalMinutes: getIntervalMinutes() });
});

router.put("/settings/matching-interval", async (req, res) => {
  const body = req.body as { intervalMinutes?: unknown };
  const minutes = Number(body.intervalMinutes);

  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
    res.status(400).json({ error: "intervalMinutes должно быть целым числом от 1 до 120" });
    return;
  }
  if (!supabase) {
    res.status(503).json({ error: "Supabase not configured" });
    return;
  }

  await setIntervalMinutes(supabase, minutes);
  req.log.info({ minutes }, "Matching interval updated via API");
  res.json({ ok: true, intervalMinutes: minutes });
});

export default router;
