import { getToken } from "@/lib/authClient";

export type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  is_active: boolean | null;
};

/**
 * Fetch one or more palata_users rows by their IDs from the backend API.
 * Requires an authenticated session (getToken must return a non-null value).
 * Returns only the rows the caller is authorised to see (server enforces access).
 */
export async function fetchUsers(ids: string[]): Promise<UserRow[]> {
  if (ids.length === 0) return [];
  const res = await fetch(
    `/api/palata/users?ids=${encodeURIComponent(ids.join(","))}`,
    { headers: { Authorization: `Bearer ${getToken() ?? ""}` } },
  );
  const body = await res.json().catch(() => null);
  return (body?.rows ?? []) as UserRow[];
}
