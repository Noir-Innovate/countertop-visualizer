import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { hasW9OnFile } from "@/lib/referrals";
import { submitPayoutBatch } from "@/lib/paypal-payouts";

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

  if (!(await hasW9OnFile(referrerProfileId))) {
    return NextResponse.json({ error: "w9_required" }, { status: 400 });
  }

  const service = await createServiceClient();

  const { data: payoutProfile } = await service
    .from("referrer_payout_profiles")
    .select("payout_method, payout_handle")
    .eq("profile_id", referrerProfileId)
    .maybeSingle();

  if (
    !payoutProfile ||
    payoutProfile.payout_method !== "paypal" ||
    !payoutProfile.payout_handle
  ) {
    return NextResponse.json(
      { error: "paypal_email_missing" },
      { status: 400 },
    );
  }

  const senderItemId = `${referrerProfileId}_${Date.now()}`;

  let batchResult;
  try {
    batchResult = await submitPayoutBatch([
      {
        recipientEmail: payoutProfile.payout_handle,
        amountCents,
        senderItemId,
        note: note ?? "Affiliate commission payout",
      },
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "paypal_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const { data: batchRow, error: batchError } = await service
    .from("paypal_payout_batches")
    .insert({
      paypal_batch_id: batchResult.batchId,
      status: "pending",
      total_cents: amountCents,
      item_count: 1,
      created_by_admin_id: admin.userId,
      raw_response: batchResult.raw as object,
    })
    .select("id")
    .single();

  if (batchError) {
    return NextResponse.json({ error: batchError.message }, { status: 500 });
  }

  const { data: payoutRow, error: payoutError } = await service
    .from("referral_payouts")
    .insert({
      referrer_profile_id: referrerProfileId,
      amount_cents: amountCents,
      method: "paypal",
      note: note ?? null,
      created_by_admin_id: admin.userId,
      paypal_batch_id: batchRow.id,
      paypal_item_id: senderItemId,
      paypal_status: batchResult.batchStatus,
    })
    .select("id")
    .single();

  if (payoutError) {
    return NextResponse.json({ error: payoutError.message }, { status: 500 });
  }

  return NextResponse.json({
    payoutId: payoutRow.id,
    paypalBatchId: batchResult.batchId,
    paypalStatus: batchResult.batchStatus,
  });
}
