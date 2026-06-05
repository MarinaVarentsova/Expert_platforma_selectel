import type { SupabaseClient } from "@supabase/supabase-js";
import { runAllPendingMatching } from "./matcher";
import { logger } from "./logger";

const DEFAULT_INTERVAL_MINUTES = 10;
const SETTING_KEY = "matching_interval_minutes";

let _intervalMinutes = DEFAULT_INTERVAL_MINUTES;
let _timerId: ReturnType<typeof setInterval> | null = null;
let _dbRef: SupabaseClient | null = null;

function runScheduled() {
  if (!_dbRef) return;
  runAllPendingMatching(_dbRef).then(result => {
    if (result.processed > 0) {
      logger.info(result, "Scheduled matching complete");
    }
  }).catch(e => {
    logger.warn({ err: (e as Error).message }, "Scheduled matching error");
  });
}

function applyTimer(isInitial: boolean) {
  if (_timerId !== null) clearInterval(_timerId);
  const ms = _intervalMinutes * 60 * 1000;
  if (isInitial) setTimeout(runScheduled, 30_000);
  _timerId = setInterval(runScheduled, ms);
}

export async function initScheduler(db: SupabaseClient): Promise<void> {
  _dbRef = db;

  try {
    const { data } = await db
      .from("palata_settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle();
    if (data?.value) {
      const parsed = parseInt(data.value as string, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 120) {
        _intervalMinutes = parsed;
      }
    }
  } catch {
    // palata_settings may not exist yet — use default
  }

  applyTimer(true);
  logger.info({ intervalMinutes: _intervalMinutes }, "Matching scheduler started");
}

export function getIntervalMinutes(): number {
  return _intervalMinutes;
}

export async function setIntervalMinutes(db: SupabaseClient, minutes: number): Promise<void> {
  _intervalMinutes = minutes;
  applyTimer(false);

  try {
    await db.from("palata_settings").upsert(
      { key: SETTING_KEY, value: String(minutes) },
      { onConflict: "key" },
    );
  } catch {
    // non-fatal: in-memory change already applied
  }

  logger.info({ intervalMinutes: _intervalMinutes }, "Matching scheduler interval updated");
}
