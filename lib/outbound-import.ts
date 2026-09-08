import { normalizeEmail } from "@/lib/email-suppression";

/**
 * OD-3 import classification — PURE logic, no DB. The route supplies the
 * suppression + existing-prospect lookups as sets; this decides each row's
 * outcome and produces the rows to insert. Keeping it pure makes the rules
 * (provenance required, dedupe vs prospects AND suppression, idempotent) unit
 * testable without a database.
 */

export type ImportOutcome =
  | "imported"
  | "duplicate"
  | "suppressed"
  | "rejected_no_provenance"
  | "rejected_invalid_email";

export interface ImportRowResult {
  row: number; // 1-based data row (excludes header)
  email: string;
  outcome: ImportOutcome;
  reason?: string;
}

export interface NewProspectRow {
  email: string; // normalised
  company: string | null;
  contact_name: string | null;
  role: string | null;
  website: string | null;
  tier: "A" | "B" | "C" | null;
  segment: "warm" | "cold" | null;
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

function coerceTier(raw: string): "A" | "B" | "C" | null {
  const t = raw.trim().toUpperCase();
  return t === "A" || t === "B" || t === "C" ? t : null;
}

function coerceSegment(raw: string): "warm" | "cold" | null {
  const s = raw.trim().toLowerCase();
  return s === "warm" || s === "cold" ? s : null;
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

    if (!looksLikeEmail(email)) {
      results.push({
        row: rowNum,
        email,
        outcome: "rejected_invalid_email",
        reason: email ? "not a valid email address" : "missing email",
      });
      return;
    }

    const sourceUrl = pick(row, "source_url", "source", "sourceurl");
    const sourcedAtIso = parseSourcedAt(pick(row, "sourced_at", "sourcedat"));
    if (!sourceUrl || !sourcedAtIso) {
      results.push({
        row: rowNum,
        email,
        outcome: "rejected_no_provenance",
        reason: !sourceUrl
          ? "missing source_url"
          : "missing or unparseable sourced_at",
      });
      return;
    }

    if (ctx.suppressed.has(email)) {
      results.push({
        row: rowNum,
        email,
        outcome: "suppressed",
        reason: "on global suppression list",
      });
      return;
    }

    if (ctx.existing.has(email) || seenInFile.has(email)) {
      results.push({
        row: rowNum,
        email,
        outcome: "duplicate",
        reason: seenInFile.has(email)
          ? "duplicate within file"
          : "already a prospect in this org",
      });
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
      segment: coerceSegment(pick(row, "segment")),
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
    rejected_no_provenance: 0,
    rejected_invalid_email: 0,
  };
  for (const r of results) summary[r.outcome]++;
  return summary;
}
