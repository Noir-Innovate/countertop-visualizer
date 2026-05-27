import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { createClient as createAuthedClient } from "@/lib/supabase/server";
import { getStripeServerClient } from "@/lib/stripe";

interface Body {
  code: string;
}

function describeCoupon(coupon: {
  percent_off: number | null;
  amount_off: number | null;
  currency: string | null;
  duration: string;
  duration_in_months: number | null;
}): string {
  const amountStr = coupon.percent_off
    ? `${coupon.percent_off}% off`
    : coupon.amount_off
      ? `${(coupon.amount_off / 100).toLocaleString("en-US", {
          style: "currency",
          currency: (coupon.currency || "usd").toUpperCase(),
        })} off`
      : "Discount";

  switch (coupon.duration) {
    case "forever":
      return `${amountStr} forever`;
    case "once":
      return `${amountStr} on your first invoice`;
    case "repeating":
      return `${amountStr} for ${coupon.duration_in_months ?? 0} months`;
    default:
      return amountStr;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { code } = (await request.json()) as Body;
    if (!code || !code.trim()) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const supabase = await createAuthedClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stripe = getStripeServerClient();
    // Stripe stores promo codes as configured but the `code` filter is
    // exact-match. Normalize to uppercase since that's the dominant Stripe
    // convention — otherwise "save50" misses a code stored as "SAVE50".
    const normalized = code.trim().toUpperCase();
    const promoList = await stripe.promotionCodes.list({
      code: normalized,
      active: true,
      limit: 1,
    });

    const promo = promoList.data[0];
    if (!promo) {
      return NextResponse.json(
        { valid: false, error: "Promotion code not found" },
        { status: 200 },
      );
    }

    // Resolve the underlying coupon. The 2026-02-25.clover API moved the
    // coupon reference from `promo.coupon` (legacy) to
    // `promo.promotion.coupon` (new shape) — we accept either and follow up
    // with a direct retrieve so we always have the full coupon object.
    const legacyCoupon = (promo as unknown as { coupon?: string | Stripe.Coupon })
      .coupon;
    const newShape = (promo as unknown as {
      promotion?: { coupon?: string };
    }).promotion;
    const couponRef = legacyCoupon ?? newShape?.coupon ?? null;
    const couponId =
      typeof couponRef === "string" ? couponRef : couponRef?.id ?? null;
    if (!couponId) {
      return NextResponse.json(
        { valid: false, error: "Promotion code has no coupon attached" },
        { status: 200 },
      );
    }
    const coupon = await stripe.coupons.retrieve(couponId);

    const nowSec = Math.floor(Date.now() / 1000);
    if (coupon.redeem_by != null && coupon.redeem_by <= nowSec) {
      return NextResponse.json(
        { valid: false, error: "Promotion code has expired" },
        { status: 200 },
      );
    }
    if (
      coupon.max_redemptions != null &&
      coupon.times_redeemed >= coupon.max_redemptions
    ) {
      return NextResponse.json(
        { valid: false, error: "Promotion code has been fully redeemed" },
        { status: 200 },
      );
    }

    return NextResponse.json({
      valid: true,
      promotionCodeId: promo.id,
      code: normalized,
      description: describeCoupon({
        percent_off: coupon.percent_off,
        amount_off: coupon.amount_off,
        currency: coupon.currency,
        duration: coupon.duration,
        duration_in_months: coupon.duration_in_months,
      }),
      coupon: {
        percent_off: coupon.percent_off,
        amount_off: coupon.amount_off,
        currency: coupon.currency,
        duration: coupon.duration,
        duration_in_months: coupon.duration_in_months,
      },
    });
  } catch (error) {
    console.error("Trial promo lookup error:", error);
    return NextResponse.json(
      { valid: false, error: "Failed to look up promotion code" },
      { status: 200 },
    );
  }
}
