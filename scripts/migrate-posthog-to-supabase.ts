/**
 * One-off migration: copy manually captured analytics events from PostHog into Supabase.
 *
 * Run from project root:
 *   npx tsx scripts/migrate-posthog-to-supabase.ts [--dry-run] [--since=YYYY-MM-DD]
 *
 * Requires:
 *   - .env.local (or env) with POSTHOG_API_KEY, POSTHOG_PROJECT_ID (or we fetch it),
 *     NEXT_PUBLIC_POSTHOG_HOST, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

// ---------- Env ----------
function loadEnvLocal(): void {
  const p = path.resolve(process.cwd(), ".env.local");
  try {
    const content = fs.readFileSync(p, "utf8");
    content.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eq = trimmed.indexOf("=");
        if (eq > 0) {
          const key = trimmed.slice(0, eq).trim();
          let val = trimmed.slice(eq + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          )
            val = val.slice(1, -1);
          process.env[key] = val;
        }
      }
    });
  } catch {
    // .env.local optional
  }
}

// ---------- Event names we care about (manually captured in app) ----------
const EVENT_NAMES = [
  "page_view",
  "slab_selected",
  "generation_started",
  "quote_submitted",
  "lead_form_submitted",
  "lead_submission_successful",
  "lead_submission_failed",
  "back_pressed",
  "view_mode_changed",
  "saw_it",
  "material_viewed",
  "countertop_shared",
  "image_uploaded",
  "image_selected",
  "verification_code_requested",
  "verification_code_submitted",
  "verification_successful",
  "verification_failed",
  "generation_error",
];

const PAGE_SIZE = 1000;
const INSERT_BATCH_SIZE = 500;

// ---------- PostHog project ID ----------
let cachedProjectId: string | null = null;

async function getPostHogProjectId(): Promise<string | null> {
  if (cachedProjectId) return cachedProjectId;
  const envId = process.env.POSTHOG_PROJECT_ID;
  if (envId && !envId.startsWith("phc_") && !envId.startsWith("phx_")) {
    cachedProjectId = envId;
    return envId;
  }
  const apiKey = process.env.POSTHOG_API_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";
  if (!apiKey) return null;
  try {
    const res = await fetch(`${host}/api/projects/`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const projects = data.results ?? (Array.isArray(data) ? data : []);
    const project = projects[0];
    if (!project) return null;
    const id =
      project.id?.toString() ?? project.uuid ?? project.project_id?.toString();
    if (id) cachedProjectId = id;
    return id ?? null;
  } catch {
    return null;
  }
}

// ---------- Fetch one page of events from PostHog ----------
interface PostHogRow {
  event: string;
  timestamp: string;
  properties: Record<string, unknown>;
  distinct_id: string;
}

async function fetchPostHogEvents(
  offset: number,
  sinceIso?: string,
): Promise<PostHogRow[]> {
  const apiKey = process.env.POSTHOG_API_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";
  const projectId = await getPostHogProjectId();
  if (!apiKey || !projectId) return [];

  const escaped = EVENT_NAMES.map((e) => `'${e.replace(/'/g, "''")}'`).join(
    ", ",
  );
  let where = `event IN (${escaped})`;
  if (sinceIso) {
    const dt = sinceIso.replace("T", " ").replace("Z", "");
    where += ` AND timestamp >= toDateTime('${dt}')`;
  }
  const query = `SELECT event, timestamp, properties, distinct_id FROM events WHERE ${where} ORDER BY timestamp ASC LIMIT ${PAGE_SIZE} OFFSET ${offset}`;

  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: { kind: "HogQLQuery", query },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog query failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    results?: unknown[];
    columns?: string[];
  };
  const results = data.results ?? [];
  const columns = data.columns ?? [
    "event",
    "timestamp",
    "properties",
    "distinct_id",
  ];

  return results.map((row: unknown) => {
    if (Array.isArray(row)) {
      const r = row as unknown[];
      const ts = r[1];
      const props = r[2];
      return {
        event: String(r[0] ?? ""),
        timestamp:
          ts != null
            ? typeof ts === "string"
              ? ts
              : new Date(ts as number).toISOString()
            : "",
        properties:
          typeof props === "string"
            ? JSON.parse(props)
            : ((props as Record<string, unknown>) ?? {}),
        distinct_id: String(r[3] ?? ""),
      };
    }
    const o = row as Record<string, unknown>;
    return {
      event: String(o.event ?? ""),
      timestamp: String(o.timestamp ?? ""),
      properties:
        (typeof o.properties === "string"
          ? JSON.parse(o.properties as string)
          : o.properties) ?? {},
      distinct_id: String(o.distinct_id ?? ""),
    };
  }) as PostHogRow[];
}

// ---------- Map PostHog row to analytics_events insert ----------
function toSupabaseRow(row: PostHogRow): Record<string, unknown> {
  const p = row.properties as Record<string, unknown>;
  const get = (key: string, alt?: string) =>
    (p[key] ?? (alt ? p[alt] : null)) as string | null | undefined;
  const uuid = (v: unknown) =>
    typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null;

  const metadata = { ...p };
  const utmKeys = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "referrer",
  ];
  const tags =
    p.tags && typeof p.tags === "object" && !Array.isArray(p.tags)
      ? (p.tags as Record<string, unknown>)
      : {};

  let created_at = row.timestamp;
  if (created_at && !/^\d{4}-\d{2}-\d{2}T/.test(created_at)) {
    try {
      const d = new Date(created_at);
      if (!Number.isNaN(d.getTime())) created_at = d.toISOString();
    } catch {
      created_at = new Date().toISOString();
    }
  }
  if (!created_at) created_at = new Date().toISOString();

  return {
    event_type: row.event,
    created_at,
    session_id: row.distinct_id || null,
    material_line_id: uuid(get("materialLineId", "material_line_id")) ?? null,
    organization_id: uuid(get("organizationId", "organization_id")) ?? null,
    metadata: Object.keys(metadata).length ? metadata : {},
    utm_source: get("utm_source") ?? null,
    utm_medium: get("utm_medium") ?? null,
    utm_campaign: get("utm_campaign") ?? null,
    utm_term: get("utm_term") ?? null,
    utm_content: get("utm_content") ?? null,
    referrer: get("referrer") ?? null,
    tags: Object.keys(tags).length ? tags : {},
  };
}

// ---------- Main ----------
async function main() {
  loadEnvLocal();

  const dryRun = process.argv.includes("--dry-run");
  const sinceArg = process.argv.find((a) => a.startsWith("--since="));
  const since = sinceArg?.slice("--since=".length)?.trim();
  const sinceIso = since
    ? new Date(since).toISOString().replace("T", " ").replace(/Z$/, "")
    : undefined;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!dryRun && (!supabaseUrl || !supabaseKey)) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Use --dry-run to only read from PostHog.",
    );
    process.exit(1);
  }

  const projectId = await getPostHogProjectId();
  if (!projectId) {
    console.error(
      "Could not get PostHog project ID. Set POSTHOG_PROJECT_ID or ensure POSTHOG_API_KEY can list projects.",
    );
    process.exit(1);
  }

  console.log("PostHog project:", projectId);
  console.log("Events:", EVENT_NAMES.join(", "));
  if (sinceIso) console.log("Since:", sinceIso);
  console.log(dryRun ? "DRY RUN (no Supabase inserts)\n" : "");

  const supabase =
    !dryRun && supabaseUrl && supabaseKey
      ? createClient(supabaseUrl, supabaseKey)
      : null;

  // Fetch valid FKs from local DB so we don't insert events that reference missing lines/orgs
  let validMaterialLineIds = new Set<string>();
  let validOrganizationIds = new Set<string>();
  if (supabase) {
    const [linesRes, orgsRes] = await Promise.all([
      supabase.from("material_lines").select("id"),
      supabase.from("organizations").select("id"),
    ]);
    if (linesRes.data)
      linesRes.data.forEach((r) => validMaterialLineIds.add(r.id));
    if (orgsRes.data)
      orgsRes.data.forEach((r) => validOrganizationIds.add(r.id));
    console.log(
      `Local DB: ${validMaterialLineIds.size} material lines, ${validOrganizationIds.size} organizations (events with other IDs will have context nulled).\n`,
    );
  }

  const sanitize = (row: Record<string, unknown>) => {
    const out = { ...row };
    if (
      out.material_line_id != null &&
      !validMaterialLineIds.has(out.material_line_id as string)
    ) {
      out.material_line_id = null;
    }
    if (
      out.organization_id != null &&
      !validOrganizationIds.has(out.organization_id as string)
    ) {
      out.organization_id = null;
    }
    return out;
  };

  let totalFetched = 0;
  let totalInserted = 0;
  let offset = 0;
  const eventCounts = new Map<string, number>();

  while (true) {
    const rows = await fetchPostHogEvents(offset, sinceIso);
    if (rows.length === 0) break;

    totalFetched += rows.length;
    const mapped = rows.map(toSupabaseRow).map(sanitize);

    if (dryRun) {
      for (const row of rows) {
        eventCounts.set(row.event, (eventCounts.get(row.event) ?? 0) + 1);
      }
      if (totalFetched === rows.length && mapped[0]) {
        console.log("Sample row:", JSON.stringify(mapped[0], null, 2));
      }
      console.log(`Fetched page: ${rows.length} (total ${totalFetched})`);
    } else if (supabase) {
      for (let i = 0; i < mapped.length; i += INSERT_BATCH_SIZE) {
        const batch = mapped.slice(i, i + INSERT_BATCH_SIZE);
        const { error } = await supabase.from("analytics_events").insert(batch);
        if (error) {
          console.error("Insert error:", error.message);
          process.exit(1);
        }
        totalInserted += batch.length;
      }
      console.log(`Inserted ${mapped.length} (total ${totalInserted})`);
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log("\nDone.");
  console.log("Total fetched from PostHog:", totalFetched);
  if (!dryRun) {
    console.log("Total inserted into Supabase:", totalInserted);
  } else if (eventCounts.size > 0) {
    const sorted = [...eventCounts.entries()].sort((a, b) => b[1] - a[1]);
    const maxName = Math.max(28, ...sorted.map(([e]) => e.length));
    const namePad = (s: string) => s.padEnd(maxName);
    console.log("\nEvents and counts:");
    console.log("  " + namePad("event") + "  count");
    console.log("  " + "-".repeat(maxName) + "  -----");
    for (const [event, count] of sorted) {
      console.log("  " + namePad(event) + "  " + count);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
