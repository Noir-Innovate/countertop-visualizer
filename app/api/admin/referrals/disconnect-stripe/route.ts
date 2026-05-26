import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";

// Admin-only: unlink the Stripe Connect account from this affiliate so they
// can restart onboarding. We don't delete the account on Stripe — it's left in
// the platform's Connect → Accounts list for audit and can be deleted from
// the Stripe Dashboard manually if you really need to (test mode only).
export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { referrerProfileId } = (await req.json()) as {
    referrerProfileId?: string;
  };
  if (!referrerProfileId) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const service = await createServiceClient();
  const { error } = await service
    .from("referrer_payout_profiles")
    .update({
      stripe_account_id: null,
      stripe_account_status: null,
      stripe_payouts_enabled: false,
      stripe_onboarded_at: null,
      payout_method: null,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", referrerProfileId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
