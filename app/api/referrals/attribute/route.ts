import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { attributeReferral } from "@/lib/referrals";

export async function POST(req: NextRequest) {
  const { organizationId, code } = (await req.json()) as {
    organizationId?: string;
    code?: string;
  };
  if (!organizationId || !code) {
    return NextResponse.json(
      { error: "organizationId and code are required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Caller must be a member of the referee org.
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", organizationId)
    .single();
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await attributeReferral({
    refereeOrgId: organizationId,
    refereeProfileId: user.id,
    refereeEmail: user.email,
    code,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ referralId: result.referralId });
}
