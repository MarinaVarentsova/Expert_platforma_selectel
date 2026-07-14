import { getToken } from "@/lib/authClient";

export type RequestRow = {
  id: string;
  title: string | null;
  status: string;
  customer_id: string | null;
  assigned_expert_id: string | null;
};

/**
 * Fetch one or more palata_requests rows by their IDs from the backend API.
 * Requires an authenticated session (getToken must return a non-null value).
 * Returns only the rows the caller is authorised to see (server enforces access).
 */
export async function fetchRequests(ids: string[]): Promise<RequestRow[]> {
  if (ids.length === 0) return [];
  const res = await fetch(
    `/api/palata/requests?ids=${encodeURIComponent(ids.join(","))}`,
    { headers: { Authorization: `Bearer ${getToken() ?? ""}` } },
  );
  const body = await res.json().catch(() => null);
  return (body?.rows ?? []) as RequestRow[];
}
