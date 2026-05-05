import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface PayoutProfileBody {
  legal_name?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
  paypal_email?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      "legal_name, address_line1, address_line2, city, region, postal_code, country, payout_method, payout_handle, w9_collected_at",
    )
    .eq("profile_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    profile: data
      ? {
          legal_name: data.legal_name,
          address_line1: data.address_line1,
          address_line2: data.address_line2,
          city: data.city,
          region: data.region,
          postal_code: data.postal_code,
          country: data.country,
          paypal_email:
            data.payout_method === "paypal" ? data.payout_handle : null,
          w9_collected_at: data.w9_collected_at,
        }
      : {
          legal_name: null,
          address_line1: null,
          address_line2: null,
          city: null,
          region: null,
          postal_code: null,
          country: null,
          paypal_email: null,
          w9_collected_at: null,
        },
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as PayoutProfileBody;
  const paypalEmail = body.paypal_email?.trim() || null;

  if (paypalEmail && !EMAIL_RE.test(paypalEmail)) {
    return NextResponse.json(
      { error: "Invalid PayPal email" },
      { status: 400 },
    );
  }

  const service = await createServiceClient();
  const now = new Date().toISOString();
  const { error } = await service.from("referrer_payout_profiles").upsert(
    {
      profile_id: user.id,
      legal_name: body.legal_name ?? null,
      address_line1: body.address_line1 ?? null,
      address_line2: body.address_line2 ?? null,
      city: body.city ?? null,
      region: body.region ?? null,
      postal_code: body.postal_code ?? null,
      country: body.country ?? null,
      payout_method: paypalEmail ? "paypal" : null,
      payout_handle: paypalEmail,
      updated_at: now,
    },
    { onConflict: "profile_id" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
