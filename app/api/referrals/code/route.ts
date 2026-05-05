import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ensureReferralCodeForProfile } from "@/lib/referrals";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { code } = await ensureReferralCodeForProfile(user.id);
    return NextResponse.json({ code });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to mint code" },
      { status: 500 },
    );
  }
}

// Format aligns with the DB CHECK constraint on profile_referral_codes.code
// (length 6–12, alphanumeric + dash, no leading/trailing dash).
const CODE_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{4,10}[A-Za-z0-9])$/;

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code: raw } = (await req.json().catch(() => ({}))) as {
    code?: string;
  };
  const next = (raw ?? "").trim().toUpperCase();
  if (!CODE_RE.test(next)) {
    return NextResponse.json(
      {
        error:
          "Code must be 6–12 characters, letters/numbers/dashes only, no leading or trailing dash.",
      },
      { status: 400 },
    );
  }

  const service = (await createServiceClient()) as any;

  // Case-insensitive uniqueness — codes are stored upper-cased above.
  const { data: clash } = await service
    .from("profile_referral_codes")
    .select("profile_id")
    .ilike("code", next)
    .maybeSingle();
  if (clash && clash.profile_id !== user.id) {
    return NextResponse.json(
      { error: "That code is already in use." },
      { status: 409 },
    );
  }

  const { data: existing } = await service
    .from("profile_referral_codes")
    .select("profile_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  const { error } = existing
    ? await service
        .from("profile_referral_codes")
        .update({ code: next })
        .eq("profile_id", user.id)
    : await service
        .from("profile_referral_codes")
        .insert({ profile_id: user.id, code: next });

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "That code is already in use." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ code: next });
}
