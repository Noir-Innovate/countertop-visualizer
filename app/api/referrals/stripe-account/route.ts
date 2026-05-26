import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  ensureAffiliateAccount,
  createOnboardingAccountLink,
  createDashboardLoginLink,
  syncAccountStatus,
} from "@/lib/stripe-connect";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const { data } = await service
    .from("referrer_payout_profiles")
    .select(
      "stripe_account_id, stripe_account_status, stripe_payouts_enabled, stripe_onboarded_at",
    )
    .eq("profile_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    stripeAccountId: data?.stripe_account_id ?? null,
    status: data?.stripe_account_status ?? null,
    payoutsEnabled: Boolean(data?.stripe_payouts_enabled),
    onboardedAt: data?.stripe_onboarded_at ?? null,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { mode?: string };
  const mode = body.mode === "dashboard" ? "dashboard" : "onboarding";

  try {
    const { stripeAccountId } = await ensureAffiliateAccount(
      user.id,
      user.email,
    );
    // Refresh capability status whenever the affiliate revisits the flow, so
    // the dashboard reflects the latest state even if the webhook is delayed.
    await syncAccountStatus(stripeAccountId).catch(() => {});
    const { url } =
      mode === "dashboard"
        ? await createDashboardLoginLink(stripeAccountId)
        : await createOnboardingAccountLink(stripeAccountId);
    return NextResponse.json({ url, stripeAccountId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "stripe_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
