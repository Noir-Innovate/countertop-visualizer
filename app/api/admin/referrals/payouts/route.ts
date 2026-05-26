import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { sendAffiliatePayout } from "@/lib/stripe-connect";

export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    referrerProfileId?: string;
    amountCents?: number;
    note?: string;
  };
  const { referrerProfileId, amountCents, note } = body;

  if (!referrerProfileId || !amountCents || amountCents <= 0) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const service = await createServiceClient();

  const { data: payoutProfile } = await service
    .from("referrer_payout_profiles")
    .select("stripe_account_id, stripe_payouts_enabled")
    .eq("profile_id", referrerProfileId)
    .maybeSingle();

  if (
    !payoutProfile?.stripe_account_id ||
    !payoutProfile.stripe_payouts_enabled
  ) {
    return NextResponse.json(
      { error: "stripe_onboarding_required" },
      { status: 400 },
    );
  }

  const idempotencyKey = `payout-${referrerProfileId}-${Date.now()}`;

  let transfer;
  try {
    transfer = await sendAffiliatePayout({
      stripeAccountId: payoutProfile.stripe_account_id,
      amountCents,
      profileId: referrerProfileId,
      idempotencyKey,
      note: note ?? "Affiliate commission payout",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "stripe_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const { data: payoutRow, error: payoutError } = await service
    .from("referral_payouts")
    .insert({
      referrer_profile_id: referrerProfileId,
      amount_cents: amountCents,
      method: "stripe",
      note: note ?? null,
      created_by_admin_id: admin.userId,
      stripe_transfer_id: transfer.id,
      stripe_status: "paid",
    })
    .select("id")
    .single();

  if (payoutError) {
    return NextResponse.json({ error: payoutError.message }, { status: 500 });
  }

  return NextResponse.json({
    payoutId: payoutRow.id,
    stripeTransferId: transfer.id,
  });
}
