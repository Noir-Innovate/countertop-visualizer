import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  finalizeOnboarding,
  type FinalizeOnboardingInput,
} from "@/lib/onboarding-finalize";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as FinalizeOnboardingInput;

    if (!body.organizationId || !body.scrapeId || !body.materialLineSlug) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", body.organizationId)
      .single();
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "You do not have permission to finalize onboarding" },
        { status: 403 },
      );
    }

    const result = await finalizeOnboarding(body);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Onboarding finalize error", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to finalize",
      },
      { status: 500 },
    );
  }
}
