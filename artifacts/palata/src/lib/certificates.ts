import { supabase } from "./supabaseClient";

export type CertStatus =
  | "idle"
  | "verifying"
  | "verified"
  | "not_found"
  | "expired"
  | "no_name"
  | "name_mismatch";

export interface CertResult {
  number: string;
  raw: string;
  status: CertStatus;
  validTo: string | null;
  directionIds: string[];
  directionNames: string[];
  expertName: string | null;
}

export function normalizeCertNumber(raw: string): string {
  return raw.replace(/^[№#]\s*/, "").replace(/\s+/g, " ").trim();
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Extract the numeric suffix used for DB lookup.
 * "PS 003755" → "003755"
 * "№ PS 003755" → "003755"
 * "PS003755" → "003755"
 * "003755" → "003755"
 */
function extractNumericId(raw: string): string {
  const compact = raw.replace(/\s+/g, "");
  const match = compact.match(/(\d+)$/);
  if (match) return match[1];
  return compact.replace(/\D/g, "");
}

export async function verifyCertificate(
  raw: string,
  allDirections: Array<{ id: string; name: string }>,
  fullName?: string,
): Promise<CertResult> {
  const normalized = normalizeCertNumber(raw);
  const base: CertResult = {
    number: normalized,
    raw,
    status: "idle",
    validTo: null,
    directionIds: [],
    directionNames: [],
    expertName: null,
  };

  if (!normalized) return base;

  // If no name provided at all — ask user to fill in the name field first
  if (!fullName || !fullName.trim()) {
    return { ...base, status: "no_name" };
  }

  const certId = extractNumericId(raw);
  if (!certId) return { ...base, status: "not_found" };

  type CertRow = {
    certificate_number: string;
    expert_full_name: string | null;
    specialty_code: string | null;
    valid_to: string | null;
    is_active: boolean;
  };

  const certsRes = await fetch(`/api/palata/certificates?cert_id=${encodeURIComponent(certId)}`)
    .then(r => r.json())
    .catch(() => ({ success: false, rows: [] as CertRow[] }));
  const certs: CertRow[] | null = certsRes.rows ?? null;

  if (!certs || certs.length === 0) {
    return { ...base, status: "not_found" };
  }

  const today = new Date().toISOString().slice(0, 10);

  const rows = certs;

  // Prefer active cert with valid_to >= today
  const cert =
    rows.find((c) => c.is_active && (!c.valid_to || c.valid_to >= today)) ??
    rows[0];

  if (!cert.is_active) {
    return { ...base, status: "not_found", expertName: cert.expert_full_name };
  }

  if (cert.valid_to && cert.valid_to < today) {
    return {
      ...base,
      status: "expired",
      validTo: cert.valid_to,
      expertName: cert.expert_full_name,
    };
  }

  // Check full name match
  if (
    cert.expert_full_name &&
    normalizeName(fullName.trim()) !== normalizeName(cert.expert_full_name)
  ) {
    return {
      ...base,
      status: "name_mismatch",
      expertName: cert.expert_full_name,
    };
  }

  const rawCodes: string[] = (cert.specialty_code ?? "")
    .split(/[,;]/)
    .map((s: string) => s.trim())
    .filter(Boolean);

  let directionIds: string[] = [];

  if (rawCodes.length > 0) {
    const { data: scodes, error: scodesError } = await supabase
      .from("palata_specialty_codes")
      .select("code, expertise_direction_id")
      .in("code", rawCodes);

    if (scodesError) {
      console.warn("[certificates] palata_specialty_codes lookup failed:", scodesError.message, "codes:", rawCodes);
    }

    directionIds = [
      ...new Set(
        (scodes ?? [])
          .map((s: { expertise_direction_id: string }) => s.expertise_direction_id)
          .filter(Boolean),
      ),
    ];
  }

  if (directionIds.length === 0) {
    const fallback = allDirections.find((d) =>
      d.name.toLowerCase().includes("другие"),
    );
    if (fallback) directionIds = [fallback.id];
  }

  const directionNames = directionIds.map(
    (id) => allDirections.find((d) => d.id === id)?.name ?? id,
  );

  return {
    number: cert.certificate_number,
    raw,
    status: "verified",
    validTo: cert.valid_to,
    directionIds,
    directionNames,
    expertName: cert.expert_full_name,
  };
}

export function mergeDirectionIds(results: CertResult[]): string[] {
  return [...new Set(results.flatMap((r) => r.directionIds))];
}
