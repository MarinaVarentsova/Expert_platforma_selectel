import type { SupabaseClient } from "@supabase/supabase-js";
import { runAllPendingMatching } from "./matcher";
import { checkExpiringCerts } from "./cert-checker";
import { logger } from "./logger";

const DEFAULT_INTERVAL_MINUTES = 10;
const SETTING_KEY = "matching_interval_minutes";

// Moscow time = UTC+3
const CERT_CHECK_HOUR_MSK = 9;
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

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

/** Schedule a daily task at a fixed clock hour in Moscow time (UTC+3). */
function scheduleDailyCertCheck(db: SupabaseClient) {
  function msUntilNextRun(): number {
    const now = Date.now();
    const nowMsk = new Date(now + MSK_OFFSET_MS);

    const nextRun = new Date(nowMsk);
    nextRun.setUTCHours(CERT_CHECK_HOUR_MSK, 0, 0, 0);

    if (nextRun.getTime() <= nowMsk.getTime()) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }

    return nextRun.getTime() - nowMsk.getTime();
  }

  function schedule() {
    const delay = msUntilNextRun();
    const runAtMsk = new Date(Date.now() + MSK_OFFSET_MS + delay);
    logger.info(
      { nextRunMsk: runAtMsk.toISOString().replace("T", " ").slice(0, 16) },
      "cert-checker: next run scheduled",
    );

    setTimeout(() => {
      checkExpiringCerts(db).catch(e => {
        logger.warn({ err: (e as Error).message }, "cert-checker error");
      });
      schedule();
    }, delay);
  }

  schedule();
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

  scheduleDailyCertCheck(db);
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
