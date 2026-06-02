import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { attributeReferral } from "@/lib/referrals";
import {
  getOnboardingNextStep,
  onboardingStepUrl,
} from "@/lib/onboarding-state";

export async function POST(request: NextRequest) {
  try {
    // First, verify the user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the request body
    const body = await request.json();
    const { name, slug, referralCode } = body as {
      name?: string;
      slug?: string;
      referralCode?: string;
    };

    if (!name || !slug) {
      return NextResponse.json(
        { error: "Name and slug are required" },
        { status: 400 },
      );
    }

    // Use service role client to bypass RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey);

    // Check if slug is already taken
    const { data: existingOrg } = await serviceClient
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .single();

    if (existingOrg) {
      return NextResponse.json(
        { error: "This slug is already taken. Please choose a different one." },
        { status: 400 },
      );
    }

    // Create the organization using service role (bypasses RLS)
    const { data: org, error: orgError } = await serviceClient
      .from("organizations")
      .insert({
        name,
        slug,
        created_by: user.id,
      })
      .select()
      .single();

    if (orgError) {
      console.error("Error creating organization:", orgError);
      return NextResponse.json(
        { error: orgError.message || "Failed to create organization" },
        { status: 500 },
      );
    }

    // Add the user as owner using service role (bypasses RLS). Upsert on the
    // (profile_id, organization_id) unique constraint so the creator is always
    // recorded as 'owner' even if a prior insert (e.g. a trigger or retry)
    // already added them with the default 'member' role.
    const { error: memberError } = await serviceClient
      .from("organization_members")
      .upsert(
        {
          profile_id: user.id,
          organization_id: org.id,
          role: "owner",
        },
        { onConflict: "profile_id,organization_id" },
      );

    if (memberError) {
      console.error("Error adding member:", memberError);
      // If adding member fails, try to clean up the organization
      await serviceClient.from("organizations").delete().eq("id", org.id);

      return NextResponse.json(
        { error: memberError.message || "Failed to add organization member" },
        { status: 500 },
      );
    }

    if (referralCode && user.email) {
      try {
        const result = await attributeReferral({
          refereeOrgId: org.id,
          refereeProfileId: user.id,
          refereeEmail: user.email,
          code: referralCode,
        });
        if ("error" in result) {
          console.warn("Referral attribution skipped:", result.error);
        }
      } catch (err) {
        console.error("Referral attribution failed:", err);
      }
    }

    const onboardingState = await getOnboardingNextStep(org.id);
    const nextUrl = onboardingStepUrl(org.id, onboardingState);

    return NextResponse.json(
      { organization: org, nextUrl },
      { status: 201 },
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
