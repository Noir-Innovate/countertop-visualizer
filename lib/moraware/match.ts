/**
 * Matching our leads to Moraware jobs, for the visualizer-note reconcile.
 *
 * Rule (Jeremiah): a Moraware job matches one of our leads if the EMAIL matches
 * OR the ADDRESS matches — deliberately broad, either signal is enough. Pure and
 * side-effect free so the rule is unit-testable without Moraware or the DB.
 *
 * Email is matched on the normalised address. Address is matched on a "street
 * key" (house number + street name) rather than the full string, so the two
 * systems formatting the city/state/zip/unit differently doesn't defeat an
 * otherwise-identical address.
 */

export interface MatchableLead {
  id: string;
  email: string | null;
  address: string | null;
}

export interface MatchableJob {
  jobId: string;
  email: string | null;
  address: string | null;
}

export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

// Common US street-suffix variants collapsed to one token, so "St"/"Street" etc.
// don't split an otherwise-identical address.
const SUFFIX: Record<string, string> = {
  street: "st",
  st: "st",
  avenue: "ave",
  ave: "ave",
  av: "ave",
  boulevard: "blvd",
  blvd: "blvd",
  road: "rd",
  rd: "rd",
  drive: "dr",
  dr: "dr",
  lane: "ln",
  ln: "ln",
  court: "ct",
  ct: "ct",
  place: "pl",
  pl: "pl",
  circle: "cir",
  cir: "cir",
  parkway: "pkwy",
  pkwy: "pkwy",
  highway: "hwy",
  hwy: "hwy",
  terrace: "ter",
  trail: "trl",
  way: "way",
  north: "n",
  south: "s",
  east: "e",
  west: "w",
};

/**
 * A comparable key for an address: the leading house number plus the normalised
 * street-name tokens, stopping at the first comma (i.e. ignoring city/state/zip).
 * Returns "" when there's no usable street line (which never matches anything).
 */
export function addressKey(raw: string | null | undefined): string {
  if (!raw) return "";
  // First line only — drop everything from the first comma (city, state, zip).
  const line = raw.split(",")[0];
  const tokens = line
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // punctuation -> space
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => SUFFIX[t] ?? t);

  // Drop a trailing unit token like "apt"/"ste"/"unit"/"#" residue if present.
  const cleaned = tokens.filter(
    (t) => !["apt", "ste", "suite", "unit", "bldg", "fl", "floor"].includes(t),
  );
  if (cleaned.length === 0) return "";
  // Require a leading number to be a real street line; otherwise it's too weak
  // to match on (e.g. a bare city). This keeps the broad rule from over-firing.
  if (!/^\d/.test(cleaned[0])) return "";
  return cleaned.join(" ");
}

export function emailsMatch(a: string | null, b: string | null): boolean {
  const na = normalizeEmail(a);
  const nb = normalizeEmail(b);
  return na !== "" && na === nb;
}

export function addressesMatch(a: string | null, b: string | null): boolean {
  const ka = addressKey(a);
  const kb = addressKey(b);
  return ka !== "" && ka === kb;
}

/** Broad rule: email match OR address match. */
export function leadMatchesJob(lead: MatchableLead, job: MatchableJob): boolean {
  return (
    emailsMatch(lead.email, job.email) ||
    addressesMatch(lead.address, job.address)
  );
}

/**
 * Index our leads by their email key and address key so a page of Moraware jobs
 * can be matched in one pass. Returns the lead(s) matching a job.
 */
export class LeadIndex {
  private byEmail = new Map<string, MatchableLead[]>();
  private byAddress = new Map<string, MatchableLead[]>();

  constructor(leads: MatchableLead[]) {
    for (const lead of leads) {
      const e = normalizeEmail(lead.email);
      if (e) push(this.byEmail, e, lead);
      const a = addressKey(lead.address);
      if (a) push(this.byAddress, a, lead);
    }
  }

  /** Leads matching this job by email or address, de-duplicated by lead id. */
  matches(job: MatchableJob): MatchableLead[] {
    const found = new Map<string, MatchableLead>();
    const e = normalizeEmail(job.email);
    if (e) for (const l of this.byEmail.get(e) ?? []) found.set(l.id, l);
    const a = addressKey(job.address);
    if (a) for (const l of this.byAddress.get(a) ?? []) found.set(l.id, l);
    return Array.from(found.values());
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}
