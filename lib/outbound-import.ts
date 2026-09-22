import { normalizeEmail } from "@/lib/email-suppression";

/**
 * OD-3 + OD-7a import classification — PURE logic, no DB. The route supplies the
 * suppression + existing-prospect lookups as sets; this decides each row's
 * outcome and produces the rows to insert. Keeping it pure makes the rules
 * (provenance required, tier-input fields required, warm requires a
 * relationship note, dedupe vs prospects AND suppression, idempotent) unit
 * testable without a database, and mirrors the DB constraints in migration 074
 * so a row that classifies as "imported" cannot then fail the insert.
 */

export type ImportOutcome =
  | "imported"
  | "duplicate"
  | "suppressed"
  | "rejected_invalid_email"
  | "rejected_no_provenance"
  | "rejected_invalid_business_type"
  | "rejected_missing_rationale"
  | "rejected_warm_no_note";

export interface ImportRowResult {
  row: number; // 1-based data row (excludes header)
  email: string;
  outcome: ImportOutcome;
  reason?: string;
}

export const BUSINESS_TYPES = [
  "fabricator",
  "stone_yard",
  "kb_dealer",
  "design_showroom",
  "remodeler",
  "builder",
  "flooring",
  "other",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export interface NewProspectRow {
  email: string; // normalised
  company: string | null;
  contact_name: string | null;
  role: string | null;
  website: string | null;
  tier: "A" | "B" | "C" | "unknown";
  segment: "warm" | "cold" | null;
  business_type: BusinessType;
  serves_homeowners: boolean | null;
  has_showroom: boolean | null;
  employee_count: number | null;
  city: string | null;
  state: string | null;
  tier_rationale: string;
  relationship_note: string | null;
  source_url: string;
  sourced_at: string; // ISO
}

export interface ClassifyContext {
  /** normalised emails already on the global suppression list */
  suppressed: Set<string>;
  /** normalised emails already present as prospects in this org */
  existing: Set<string>;
}

export interface ClassifyResult {
  results: ImportRowResult[];
  toInsert: NewProspectRow[];
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && v.trim() !== "") return v.trim();
  }
  return "";
}

// Deliberately permissive: reject only clearly non-address values. Real
// deliverability is the mail server's job (OD-4), not the importer's.
function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function coerceTier(raw: string): "A" | "B" | "C" | "unknown" {
  const t = raw.trim().toUpperCase();
  if (t === "A" || t === "B" || t === "C") return t;
  // SM-2: anything we can't qualify is 'unknown', never a guess.
  return "unknown";
}

function coerceSegment(raw: string): "warm" | "cold" | null {
  const s = raw.trim().toLowerCase();
  return s === "warm" || s === "cold" ? s : null;
}

const BUSINESS_TYPE_ALIASES: Record<string, BusinessType> = {
  fabricator: "fabricator",
  fabricators: "fabricator",
  stone_yard: "stone_yard",
  stoneyard: "stone_yard",
  stone_supplier: "stone_yard",
  kb_dealer: "kb_dealer",
  kitchen_and_bath: "kb_dealer",
  kitchen_bath: "kb_dealer",
  kandb: "kb_dealer",
  design_showroom: "design_showroom",
  showroom: "design_showroom",
  remodeler: "remodeler",
  remodeller: "remodeler",
  contractor: "remodeler",
  builder: "builder",
  homebuilder: "builder",
  flooring: "flooring",
  other: "other",
};

function coerceBusinessType(raw: string): BusinessType | null {
  const key = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (!key) return null;
  return BUSINESS_TYPE_ALIASES[key] ?? null;
}

function parseBool(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(v)) return true;
  if (["false", "no", "n", "0"].includes(v)) return false;
  return null;
}

function parseIntOrNull(raw: string): number | null {
  const v = raw.trim();
  if (!/^\d+$/.test(v)) return null;
  const n = Number.parseInt(v, 10);
  return Number.isSafeInteger(n) ? n : null;
}

/** Valid, parseable timestamp → ISO string; otherwise null. */
function parseSourcedAt(raw: string): string | null {
  if (!raw.trim()) return null;
  const ms = Date.parse(raw.trim());
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

export function classifyProspectRows(
  rows: Record<string, string>[],
  ctx: ClassifyContext,
): ClassifyResult {
  const results: ImportRowResult[] = [];
  const toInsert: NewProspectRow[] = [];
  const seenInFile = new Set<string>();

  rows.forEach((row, idx) => {
    const rowNum = idx + 1;
    const email = normalizeEmail(pick(row, "email", "email_address", "e_mail"));

    const reject = (outcome: ImportOutcome, reason: string) =>
      results.push({ row: rowNum, email, outcome, reason });

    // --- data-quality gates (mirror the DB constraints) ---
    if (!looksLikeEmail(email)) {
      reject(
        "rejected_invalid_email",
        email ? "not a valid email address" : "missing email",
      );
      return;
    }

    const sourceUrl = pick(row, "source_url", "source", "sourceurl");
    const sourcedAtIso = parseSourcedAt(pick(row, "sourced_at", "sourcedat"));
    if (!sourceUrl || !sourcedAtIso) {
      reject(
        "rejected_no_provenance",
        !sourceUrl ? "missing source_url" : "missing or unparseable sourced_at",
      );
      return;
    }

    const businessType = coerceBusinessType(
      pick(row, "business_type", "businesstype", "type"),
    );
    if (!businessType) {
      reject(
        "rejected_invalid_business_type",
        "business_type missing or not one of the allowed values",
      );
      return;
    }

    const tierRationale = pick(row, "tier_rationale", "rationale");
    if (!tierRationale) {
      reject("rejected_missing_rationale", "tier_rationale is required");
      return;
    }

    const segment = coerceSegment(pick(row, "segment"));
    const relationshipNote =
      pick(row, "relationship_note", "relationship", "note") || null;
    if (segment === "warm" && !relationshipNote) {
      reject(
        "rejected_warm_no_note",
        "segment=warm requires a relationship_note",
      );
      return;
    }

    // --- policy + dedupe ---
    if (ctx.suppressed.has(email)) {
      reject("suppressed", "on global suppression list");
      return;
    }
    if (ctx.existing.has(email) || seenInFile.has(email)) {
      reject(
        "duplicate",
        seenInFile.has(email)
          ? "duplicate within file"
          : "already a prospect in this org",
      );
      return;
    }

    seenInFile.add(email);
    toInsert.push({
      email,
      company: pick(row, "company", "company_name") || null,
      contact_name: pick(row, "contact_name", "name", "full_name") || null,
      role: pick(row, "role", "title") || null,
      website: pick(row, "website", "url", "domain") || null,
      tier: coerceTier(pick(row, "tier")),
      segment,
      business_type: businessType,
      serves_homeowners: parseBool(pick(row, "serves_homeowners", "homeowners")),
      has_showroom: parseBool(pick(row, "has_showroom", "showroom")),
      employee_count: parseIntOrNull(
        pick(row, "employee_count", "employees", "headcount"),
      ),
      city: pick(row, "city") || null,
      state: pick(row, "state") || null,
      tier_rationale: tierRationale,
      relationship_note: relationshipNote,
      source_url: sourceUrl,
      sourced_at: sourcedAtIso,
    });
    results.push({ row: rowNum, email, outcome: "imported" });
  });

  return { results, toInsert };
}

export function summarizeOutcomes(
  results: ImportRowResult[],
): Record<ImportOutcome, number> {
  const summary: Record<ImportOutcome, number> = {
    imported: 0,
    duplicate: 0,
    suppressed: 0,
    rejected_invalid_email: 0,
    rejected_no_provenance: 0,
    rejected_invalid_business_type: 0,
    rejected_missing_rationale: 0,
    rejected_warm_no_note: 0,
  };
  for (const r of results) summary[r.outcome]++;
  return summary;
}
