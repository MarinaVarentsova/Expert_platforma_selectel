import app from "./app";
import { logger } from "./lib/logger";
import { supabase } from "./lib/supabase";
import { runAllPendingMatching } from "./lib/matcher";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  if (supabase) {
    const INTERVAL_MS = 10 * 60 * 1000;

    const db = supabase;
    const runScheduled = () => {
      runAllPendingMatching(db).then(result => {
        if (result.processed > 0) {
          logger.info(result, "Scheduled matching complete");
        }
      }).catch(e => {
        logger.warn({ err: (e as Error).message }, "Scheduled matching error");
      });
    };

    setTimeout(runScheduled, 30_000);
    setInterval(runScheduled, INTERVAL_MS);
    logger.info({ intervalMs: INTERVAL_MS }, "Matching scheduler started");
  } else {
    logger.warn("Matching scheduler disabled — Supabase not configured");
  }
});
