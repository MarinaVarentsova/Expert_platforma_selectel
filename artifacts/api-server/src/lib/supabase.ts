import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";

const rawUrl = process.env["VITE_SUPABASE_URL"] ?? "";
const anonKey = process.env["VITE_SUPABASE_ANON_KEY"] ?? "";

if (!rawUrl || !anonKey) {
  logger.warn("VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set — matching scheduler will be disabled");
}

const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");

export const supabase = rawUrl && anonKey
  ? createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
