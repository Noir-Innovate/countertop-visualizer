import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export async function PUT(request: NextRequest) {
  try {
    // Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get request body
    const body = await request.json();
    const { full_name, email, phone } = body;

    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: "Invalid email format" },
          { status: 400 }
        );
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey);

    // Update profile
    const profileUpdates: {
      full_name?: string;
      phone?: string | null;
    } = {};

    if (full_name !== undefined) {
      profileUpdates.full_name = full_name || null;
    }

    if (phone !== undefined) {
      profileUpdates.phone = phone || null;
    }

    // Update profile if there are changes
    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileError } = await serviceClient
        .from("profiles")
        .update(profileUpdates)
        .eq("id", user.id);

      if (profileError) {
        console.error("Error updating profile:", profileError);
        return NextResponse.json(
          { error: profileError.message || "Failed to update profile" },
          { status: 500 }
        );
      }
    }

    // Update email if provided and different
    if (email && email !== user.email) {
      // Check if email is already taken
      const { data: existingUsers } = await serviceClient.auth.admin.listUsers();
      const emailTaken = existingUsers.users.some(
        (u) => u.email === email && u.id !== user.id
      );

      if (emailTaken) {
        return NextResponse.json(
          { error: "This email is already in use" },
          { status: 400 }
        );
      }

      // Update email using admin API
      const { error: emailError } = await serviceClient.auth.admin.updateUserById(
        user.id,
        { email }
      );

      if (emailError) {
        console.error("Error updating email:", emailError);
        return NextResponse.json(
          { error: emailError.message || "Failed to update email" },
          { status: 500 }
        );
      }
    }

    // Fetch updated profile
    const { data: updatedProfile, error: fetchError } = await serviceClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (fetchError) {
      console.error("Error fetching updated profile:", fetchError);
    }

    // Get updated user info
    const { data: updatedUser } = await serviceClient.auth.admin.getUserById(user.id);

    return NextResponse.json(
      {
        profile: updatedProfile || {},
        email: updatedUser?.user?.email || user.email,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch current profile
export async function GET(request: NextRequest) {
  try {
    // Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError && profileError.code !== "PGRST116") {
      // PGRST116 is "not found" - profile might not exist yet
      console.error("Error fetching profile:", profileError);
      return NextResponse.json(
        { error: "Failed to fetch profile" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        profile: profile || {
          id: user.id,
          full_name: null,
          phone: null,
          avatar_url: null,
          email: user.email || null,
        },
        email: profile?.email || user.email,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

