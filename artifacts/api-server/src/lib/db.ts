import pg from "pg";
import { logger } from "./logger";

const { Pool } = pg;

const connectionString = process.env["PALATA_DATABASE_URL"] ?? "";

if (!connectionString) {
  logger.warn("PALATA_DATABASE_URL is not set — matching scheduler will be disabled");
}

export const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 5,
    })
  : null;
