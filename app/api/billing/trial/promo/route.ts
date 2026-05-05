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
    const promoList = await stripe.promotionCodes.list({
      code: code.trim(),
      active: true,
      limit: 1,
      expand: ["data.coupon"],
    });

    const promo = promoList.data[0];
    if (!promo) {
      return NextResponse.json(
        { valid: false, error: "Promotion code not found" },
        { status: 200 },
      );
    }

    const coupon = (promo as unknown as { coupon: Stripe.Coupon | null })
      .coupon;
    if (!coupon || !coupon.valid) {
      return NextResponse.json(
        { valid: false, error: "Promotion code is no longer valid" },
        { status: 200 },
      );
    }

    return NextResponse.json({
      valid: true,
      promotionCodeId: promo.id,
      description: describeCoupon({
        percent_off: coupon.percent_off,
        amount_off: coupon.amount_off,
        currency: coupon.currency,
        duration: coupon.duration,
        duration_in_months: coupon.duration_in_months,
      }),
    });
  } catch (error) {
    console.error("Trial promo lookup error:", error);
    return NextResponse.json(
      { valid: false, error: "Failed to look up promotion code" },
      { status: 200 },
    );
  }
}
