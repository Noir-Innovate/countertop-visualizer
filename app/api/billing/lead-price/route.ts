import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface LeadPriceRequestBody {
  organizationId: string;
  leadPriceCents: number;
}

export async function POST(request: NextRequest) {
  try {
    const { organizationId, leadPriceCents } =
      (await request.json()) as LeadPriceRequestBody;

    if (
      !organizationId ||
      !Number.isInteger(leadPriceCents) ||
      leadPriceCents < 0
    ) {
      return NextResponse.json(
        {
          error:
            "organizationId and a non-negative leadPriceCents are required",
        },
        { status: 400 },
      );
    }

    const supabase = await createClient();
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
        { error: "Only super admins can update lead pricing" },
        { status: 403 },
      );
    }

    const { error } = await supabase
      .from("organization_billing_pricing")
      .insert({
        organization_id: organizationId,
        lead_price_cents: leadPriceCents,
        created_by: user.id,
      });

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Lead pricing update error:", error);
    return NextResponse.json(
      { error: "Failed to update lead pricing" },
      { status: 500 },
    );
  }
}
