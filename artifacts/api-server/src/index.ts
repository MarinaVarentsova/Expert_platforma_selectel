import app from "./app";
import { logger } from "./lib/logger";
import { supabase } from "./lib/supabase";
import { initScheduler } from "./lib/scheduler";

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
    initScheduler(supabase).catch(e => {
      logger.warn({ err: (e as Error).message }, "Scheduler init error");
    });
  } else {
    logger.warn("Matching scheduler disabled — Supabase not configured");
  }
});
