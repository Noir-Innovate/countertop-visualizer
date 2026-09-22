import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { MorawareClient } from "@/lib/moraware/client";
import {
  reconcileVisualizerNotes,
  type ReconcileSummary,
} from "@/lib/moraware/reconcile";
import type { MatchableLead } from "@/lib/moraware/match";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Moraware can be slow on wide queries

// Daily reconcile: stamp the visualizer marker onto matching Moraware jobs.
// Secured like the billing cron (x-cron-secret or Authorization: Bearer CRON_SECRET).

function assertCronAccess(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected && process.env.NODE_ENV !== "production") return true;
  const bearer = request.headers.get("authorization");
  const bearerToken = bearer?.startsWith("Bearer ") ? bearer.slice(7) : null;
  return Boolean(
    expected &&
      (request.headers.get("x-cron-secret") === expected ||
        bearerToken === expected),
  );
}

export async function GET(request: NextRequest) {
  if (!assertCronAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = process.env.MORAWARE_TENANT;
  const userName = process.env.MORAWARE_USER;
  const password = process.env.MORAWARE_PASSWORD;
  if (!tenant || !userName || !password) {
    return NextResponse.json({
      skipped: true,
      reason: "Moraware credentials not configured (MORAWARE_TENANT/USER/PASSWORD)",
    });
  }

  // Load our leads that carry an email or address to match on. (A lead worked by
  // a salesperson is just a lead with salesperson_id — same match source.)
  const supabase = await createServiceClient();
  const leads: MatchableLead[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("leads")
      .select("id, email, address")
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json(
        { error: `lead load failed: ${error.message}` },
        { status: 500 },
      );
    }
    const rows = data ?? [];
    for (const r of rows) {
      if (r.email || r.address) {
        leads.push({ id: r.id, email: r.email, address: r.address });
      }
    }
    if (rows.length < PAGE) break;
  }

  // DRY RUN unless the write grammar is verified AND writing is explicitly on.
  const dryRun = process.env.MORAWARE_WRITE_ENABLED !== "true";

  const client = new MorawareClient({ tenant, userName, password });
  let summary: ReconcileSummary;
  try {
    await client.login();
    summary = await reconcileVisualizerNotes(client, leads, { dryRun });
  } catch (e) {
    return NextResponse.json(
      { error: `reconcile failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  } finally {
    await client.logout().catch(() => undefined);
  }

  return NextResponse.json({ leadsIndexed: leads.length, ...summary });
}
