import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { MorawareClient } from "@/lib/moraware/client";
import {
  reconcileVisualizerNotes,
  type ReconcileSummary,
} from "@/lib/moraware/reconcile";
import type { MatchableLead } from "@/lib/moraware/match";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Moraware can be slow on wide queries

// Daily reconcile: for every organization that has an enabled Moraware
// integration, stamp the visualizer marker onto Moraware jobs matching that
// org's leads. Config is per-org (crm_integrations), not env. Secured like the
// billing cron (x-cron-secret or Authorization: Bearer CRON_SECRET).

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

async function loadOrgLeads(
  service: SupabaseClient,
  organizationId: string,
): Promise<MatchableLead[]> {
  const leads: MatchableLead[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await service
      .from("leads")
      .select("id, email, address")
      .eq("organization_id", organizationId)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`lead load failed: ${error.message}`);
    const rows = data ?? [];
    for (const r of rows) {
      if (r.email || r.address) {
        leads.push({ id: r.id, email: r.email, address: r.address });
      }
    }
    if (rows.length < PAGE) break;
  }
  return leads;
}

export async function GET(request: NextRequest) {
  if (!assertCronAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const { data: integrations, error } = await service
    .from("crm_integrations")
    .select("organization_id, tenant, username, api_token")
    .eq("provider", "moraware")
    .eq("enabled", true);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Write nothing until the activityCreate grammar is verified against a live
  // tenant AND writing is explicitly enabled. Until then every org runs dry.
  const dryRun = process.env.MORAWARE_WRITE_ENABLED !== "true";

  const results: Array<
    { organizationId: string } & (
      | ({ ok: true; leadsIndexed: number } & ReconcileSummary)
      | { ok: false; error: string }
    )
  > = [];

  for (const integ of integrations ?? []) {
    const organizationId = integ.organization_id as string;
    if (!integ.tenant || !integ.username) {
      results.push({ organizationId, ok: false, error: "incomplete config" });
      continue;
    }
    const client = new MorawareClient({
      tenant: integ.tenant,
      userName: integ.username,
      password: decryptSecret(integ.api_token),
    });
    try {
      const leads = await loadOrgLeads(service, organizationId);
      await client.login();
      const summary = await reconcileVisualizerNotes(client, leads, { dryRun });
      results.push({ organizationId, ok: true, leadsIndexed: leads.length, ...summary });
    } catch (e) {
      results.push({
        organizationId,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  return NextResponse.json({ dryRun, organizations: results.length, results });
}
