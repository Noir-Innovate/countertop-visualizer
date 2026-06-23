import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;

    const body = await request.json();
    const { password, fullName } = body as {
      password?: string;
      fullName?: string;
    };

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey);

    // Validate invitation
    const { data: invitation, error: inviteError } = await serviceClient
      .from("organization_invitations")
      .select("id, email, expires_at, accepted_at")
      .eq("token", token)
      .single();

    if (inviteError || !invitation) {
      return NextResponse.json(
        { error: "Invalid or expired invitation" },
        { status: 404 },
      );
    }

    if (invitation.accepted_at) {
      return NextResponse.json(
        { error: "This invitation has already been accepted" },
        { status: 400 },
      );
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This invitation has expired" },
        { status: 400 },
      );
    }

    // Bail if a user with that email already exists — they should sign in.
    // Look up via the `profiles` table (kept in sync with auth.users by the
    // email trigger in migration 019) rather than auth.admin.listUsers(), which
    // only returns the first page and silently misses users at scale.
    const { data: existing } = await serviceClient
      .from("profiles")
      .select("id")
      .ilike("email", invitation.email)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        {
          error:
            "An account already exists for this email. Please sign in to accept the invitation.",
        },
        { status: 409 },
      );
    }

    // Create the user with email already confirmed — the invitation email itself
    // proves the recipient owns the address.
    const { data: created, error: createError } =
      await serviceClient.auth.admin.createUser({
        email: invitation.email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName || null,
        },
      });

    if (createError || !created.user) {
      console.error("Error creating invited user:", createError);
      return NextResponse.json(
        { error: createError?.message || "Failed to create account" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        user_id: created.user.id,
        email: created.user.email,
      },
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
