import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthedClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getStripeServerClient } from "@/lib/stripe";

interface PortalRequestBody {
  organizationId: string;
}

export async function POST(request: NextRequest) {
  try {
    const { organizationId } = (await request.json()) as PortalRequestBody;
    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required" },
        { status: 400 },
      );
    }

    const supabase = await createAuthedClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "You do not have permission to manage billing" },
        { status: 403 },
      );
    }

    const serviceClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: billingAccount } = await serviceClient
      .from("organization_billing_accounts")
      .select("stripe_customer_id")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!billingAccount?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No billing account found for this organization" },
        { status: 400 },
      );
    }

    const stripe = getStripeServerClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: billingAccount.stripe_customer_id,
      return_url: `${appUrl}/dashboard/organizations/${organizationId}/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error("Billing portal error:", error);
    return NextResponse.json(
      { error: "Failed to open billing portal" },
      { status: 500 },
    );
  }
}
