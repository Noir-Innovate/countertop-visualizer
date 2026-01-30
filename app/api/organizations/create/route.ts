import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

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
    const { name, slug } = body;

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

    // Add the user as owner using service role (bypasses RLS)
    const { error: memberError } = await serviceClient
      .from("organization_members")
      .insert({
        profile_id: user.id,
        organization_id: org.id,
        role: "owner",
      });

    if (memberError) {
      console.error("Error adding member:", memberError);
      // If adding member fails, try to clean up the organization
      await serviceClient.from("organizations").delete().eq("id", org.id);

      return NextResponse.json(
        { error: memberError.message || "Failed to add organization member" },
        { status: 500 },
      );
    }

    return NextResponse.json({ organization: org }, { status: 201 });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
