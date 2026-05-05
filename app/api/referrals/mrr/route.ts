import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeAffiliateMRR } from "@/lib/referrals-mrr";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await computeAffiliateMRR(user.id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to compute MRR" },
      { status: 500 },
    );
  }
}
