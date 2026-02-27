import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { trackLeadBillingUsage } from "@/lib/billing-usage";

interface ToggleExclusionBody {
  organizationId: string;
  materialLineId?: string | null;
  excludedFromBilling: boolean;
  reason?: string;
}

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { leadId } = await params;
    const body = (await request.json()) as ToggleExclusionBody;

    if (!body.organizationId) {
      return NextResponse.json(
        { error: "organizationId is required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const serviceClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_super_admin) {
      return NextResponse.json(
        { error: "Only super admins can change billing exclusion" },
        { status: 403 },
      );
    }

    const { data: lead } = await serviceClient
      .from("leads")
      .select("id, organization_id, material_line_id, created_at")
      .eq("id", leadId)
      .single();

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.organization_id !== body.organizationId) {
      return NextResponse.json(
        { error: "Lead does not belong to this organization" },
        { status: 400 },
      );
    }

    if (body.materialLineId && lead.material_line_id !== body.materialLineId) {
      return NextResponse.json(
        { error: "Lead does not belong to this material line" },
        { status: 400 },
      );
    }

    const nowIso = new Date().toISOString();
    const { data: existingUsage, error: usageLookupError } = await serviceClient
      .from("organization_billing_usage")
      .select("id")
      .eq("lead_id", leadId)
      .eq("organization_id", body.organizationId)
      .maybeSingle();

    if (usageLookupError) {
      return NextResponse.json(
        {
          error: `Failed to load billing usage row: ${usageLookupError.message}`,
        },
        { status: 500 },
      );
    }

    if (!existingUsage) {
      const trackingResult = await trackLeadBillingUsage({
        supabase: serviceClient,
        leadId,
        organizationId: body.organizationId,
        materialLineId: lead.material_line_id,
        occurredAtIso: lead.created_at || nowIso,
      });

      if (!trackingResult.tracked) {
        return NextResponse.json(
          {
            error: `Failed to create billing usage row: ${
              trackingResult.error?.message || "unknown error"
            }`,
          },
          { status: 500 },
        );
      }
    }

    const { data: updatedRows, error } = await serviceClient
      .from("organization_billing_usage")
      .update({
        excluded_from_billing: body.excludedFromBilling,
        billing_exclusion_reason: body.excludedFromBilling
          ? body.reason || "Marked as test lead"
          : null,
        excluded_at: body.excludedFromBilling ? nowIso : null,
        excluded_by: body.excludedFromBilling ? user.id : null,
      })
      .eq("lead_id", leadId)
      .eq("organization_id", body.organizationId)
      .select("id");

    if (error) {
      return NextResponse.json(
        { error: `Failed to update billing exclusion: ${error.message}` },
        { status: 500 },
      );
    }

    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { error: "No billing usage rows were updated for this lead" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to toggle billing exclusion",
      },
      { status: 500 },
    );
  }
}
