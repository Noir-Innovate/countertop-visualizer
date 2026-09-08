import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { parseCsv } from "@/lib/csv";
import { normalizeEmail } from "@/lib/email-suppression";
import {
  classifyProspectRows,
  summarizeOutcomes,
  type ImportRowResult,
} from "@/lib/outbound-import";

export const dynamic = "force-dynamic";

// OD-3 — CSV prospect import. super_admin only. Dedupes against prospects AND
// suppression, rejects rows with no provenance, reports per-row outcomes, and
// is idempotent (re-importing the same file inserts nothing the second time,
// because every email already exists as a prospect).

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(request: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Accept JSON { csv, organizationId, campaignId? } or a raw CSV body with
  // organizationId/campaignId in the query string.
  let csv = "";
  let organizationId = request.nextUrl.searchParams.get("organizationId") ?? "";
  let campaignId: string | null =
    request.nextUrl.searchParams.get("campaignId") || null;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as {
      csv?: string;
      organizationId?: string;
      campaignId?: string | null;
    };
    csv = body.csv ?? "";
    organizationId = body.organizationId ?? organizationId;
    campaignId = body.campaignId ?? campaignId;
  } else {
    csv = await request.text();
  }

  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId is required" },
      { status: 400 },
    );
  }
  const { rows } = parseCsv(csv);
  if (rows.length === 0) {
    return NextResponse.json({
      summary: summarizeOutcomes([]),
      results: [],
      total: 0,
    });
  }

  const supabase = await createServiceClient();

  // Batch-load suppression + existing prospects for all emails in the file.
  const emails = Array.from(
    new Set(
      rows
        .map((r) => normalizeEmail(r.email ?? r.email_address ?? ""))
        .filter((e) => e !== ""),
    ),
  );

  const suppressed = new Set<string>();
  const existing = new Set<string>();
  for (const batch of chunk(emails, 300)) {
    const [supRes, existRes] = await Promise.all([
      supabase.from("suppression").select("email").in("email", batch),
      supabase
        .from("prospects")
        .select("email")
        .eq("organization_id", organizationId)
        .in("email", batch),
    ]);
    if (supRes.error) {
      return NextResponse.json(
        { error: `suppression lookup failed: ${supRes.error.message}` },
        { status: 500 },
      );
    }
    if (existRes.error) {
      return NextResponse.json(
        { error: `prospect lookup failed: ${existRes.error.message}` },
        { status: 500 },
      );
    }
    for (const r of supRes.data ?? []) suppressed.add(normalizeEmail(r.email));
    for (const r of existRes.data ?? []) existing.add(normalizeEmail(r.email));
  }

  const { results, toInsert } = classifyProspectRows(rows, {
    suppressed,
    existing,
  });

  if (toInsert.length > 0) {
    const payload = toInsert.map((p) => ({
      ...p,
      organization_id: organizationId,
      campaign_id: campaignId,
      created_by: admin.userId,
    }));

    const { error } = await supabase.from("prospects").insert(payload);
    if (error) {
      // Race: another import inserted an overlapping email between our lookup
      // and now. Fall back to per-row so a single conflict doesn't fail the
      // whole batch, and reflect conflicts as duplicates in the report.
      if (error.code === "23505") {
        await insertIndividually(supabase, payload, results);
      } else {
        return NextResponse.json(
          { error: `insert failed: ${error.message}` },
          { status: 500 },
        );
      }
    }
  }

  return NextResponse.json({
    summary: summarizeOutcomes(results),
    results,
    total: results.length,
  });
}

async function insertIndividually(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  payload: Array<{ email: string } & Record<string, unknown>>,
  results: ImportRowResult[],
): Promise<void> {
  for (const row of payload) {
    const { error } = await supabase.from("prospects").insert(row);
    if (error && error.code === "23505") {
      const hit = results.find(
        (r) => r.email === row.email && r.outcome === "imported",
      );
      if (hit) {
        hit.outcome = "duplicate";
        hit.reason = "inserted concurrently by another import";
      }
    }
  }
}
