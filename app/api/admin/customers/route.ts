import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type BillingAccount = {
  organization_id: string;
  stripe_customer_id: string | null;
  internal_plan_status: string;
  internal_plan_subscription_id: string | null;
  internal_plan_current_period_end: string | null;
  internal_plan_cancel_at_period_end: boolean;
};

export async function GET(req: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const days = Math.max(
    1,
    Math.min(365, Number(req.nextUrl.searchParams.get("days") ?? 30)),
  );
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = await createServiceClient();

  const [
    orgsRes,
    linesRes,
    membersRes,
    billingRes,
    leadsAllRes,
    leadsPeriodRes,
    generationsRes,
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, created_at")
      .order("name"),
    supabase.from("material_lines").select("organization_id, line_kind"),
    supabase.from("organization_members").select("organization_id"),
    supabase
      .from("organization_billing_accounts")
      .select(
        "organization_id, stripe_customer_id, internal_plan_status, internal_plan_subscription_id, internal_plan_current_period_end, internal_plan_cancel_at_period_end",
      ),
    supabase
      .from("leads")
      .select("organization_id, created_at")
      .order("created_at", { ascending: false })
      .range(0, 49999),
    supabase
      .from("leads")
      .select("organization_id")
      .gte("created_at", cutoff)
      .range(0, 49999),
    supabase
      .from("analytics_events")
      .select("organization_id")
      .eq("event_type", "generation_started")
      .gte("created_at", cutoff)
      .range(0, 99999),
  ]);

  const firstError =
    orgsRes.error ||
    linesRes.error ||
    membersRes.error ||
    billingRes.error ||
    leadsAllRes.error ||
    leadsPeriodRes.error ||
    generationsRes.error;
  if (firstError) {
    return NextResponse.json(
      { error: "Failed to fetch customers", detail: firstError.message },
      { status: 500 },
    );
  }

  const linesByOrg = new Map<string, { internal: number; external: number }>();
  for (const row of linesRes.data ?? []) {
    const orgId = row.organization_id as string;
    const kind = (row.line_kind as string) === "internal" ? "internal" : "external";
    const cur = linesByOrg.get(orgId) ?? { internal: 0, external: 0 };
    cur[kind] += 1;
    linesByOrg.set(orgId, cur);
  }

  const memberCounts = new Map<string, number>();
  for (const row of membersRes.data ?? []) {
    const orgId = row.organization_id as string;
    memberCounts.set(orgId, (memberCounts.get(orgId) ?? 0) + 1);
  }

  const billingByOrg = new Map<string, BillingAccount>();
  for (const row of (billingRes.data ?? []) as BillingAccount[]) {
    billingByOrg.set(row.organization_id, row);
  }

  const leadsPeriodCounts = new Map<string, number>();
  for (const row of leadsPeriodRes.data ?? []) {
    const orgId = row.organization_id as string | null;
    if (!orgId) continue;
    leadsPeriodCounts.set(orgId, (leadsPeriodCounts.get(orgId) ?? 0) + 1);
  }

  const leadsTotal = new Map<string, number>();
  const lastLeadAt = new Map<string, string>();
  for (const row of leadsAllRes.data ?? []) {
    const orgId = row.organization_id as string | null;
    if (!orgId) continue;
    leadsTotal.set(orgId, (leadsTotal.get(orgId) ?? 0) + 1);
    if (!lastLeadAt.has(orgId)) {
      lastLeadAt.set(orgId, row.created_at as string);
    }
  }

  const generationCounts = new Map<string, number>();
  for (const row of generationsRes.data ?? []) {
    const orgId = row.organization_id as string | null;
    if (!orgId) continue;
    generationCounts.set(orgId, (generationCounts.get(orgId) ?? 0) + 1);
  }

  const customers = (orgsRes.data ?? []).map((org) => {
    const counts = linesByOrg.get(org.id) ?? { internal: 0, external: 0 };
    const billing = billingByOrg.get(org.id);
    return {
      id: org.id,
      name: org.name,
      created_at: org.created_at,
      material_lines_external: counts.external,
      material_lines_internal: counts.internal,
      member_count: memberCounts.get(org.id) ?? 0,
      plan_status: billing?.internal_plan_status ?? null,
      plan_subscription_id: billing?.internal_plan_subscription_id ?? null,
      plan_current_period_end: billing?.internal_plan_current_period_end ?? null,
      plan_cancel_at_period_end: billing?.internal_plan_cancel_at_period_end ?? false,
      stripe_customer_id: billing?.stripe_customer_id ?? null,
      leads_in_period: leadsPeriodCounts.get(org.id) ?? 0,
      leads_total: leadsTotal.get(org.id) ?? 0,
      generations_in_period: generationCounts.get(org.id) ?? 0,
      last_lead_at: lastLeadAt.get(org.id) ?? null,
    };
  });

  return NextResponse.json({ days, customers });
}
