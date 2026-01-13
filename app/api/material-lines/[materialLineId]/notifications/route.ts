import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

interface RouteParams {
  params: Promise<{ materialLineId: string }>;
}

// GET: Fetch all notification assignments for a material line
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { materialLineId } = await params;

    // Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this material line
    const { data: materialLine } = await supabase
      .from("material_lines")
      .select("organization_id")
      .eq("id", materialLineId)
      .single();

    if (!materialLine) {
      return NextResponse.json(
        { error: "Material line not found" },
        { status: 404 }
      );
    }

    // Verify user is member of the organization
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", materialLine.organization_id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "You don't have access to this material line" },
        { status: 403 }
      );
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

    // Fetch notification assignments with user profiles
    const { data: notifications, error: notificationsError } =
      await serviceClient
        .from("material_line_notifications")
        .select(
          `
          id,
          profile_id,
          sms_enabled,
          email_enabled,
          created_at,
          profiles(id, full_name, phone)
        `
        )
        .eq("material_line_id", materialLineId)
        .order("created_at", { ascending: false });

    if (notificationsError) {
      console.error("Error fetching notifications:", notificationsError);
      return NextResponse.json(
        {
          error: notificationsError.message || "Failed to fetch notifications",
        },
        { status: 500 }
      );
    }

    // Fetch user emails from auth.users
    const notificationsWithEmails = await Promise.all(
      (notifications || []).map(async (notification: any) => {
        // Get email from auth.users via service role
        const { data: authUser } = await serviceClient.auth.admin.getUserById(
          notification.profile_id
        );

        return {
          ...notification,
          profiles: {
            ...notification.profiles,
            email: authUser?.user?.email || null,
          },
        };
      })
    );

    return NextResponse.json(
      { notifications: notificationsWithEmails },
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

// POST: Assign a user to receive notifications
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { materialLineId } = await params;
    const body = await request.json();
    const { profileId, smsEnabled, emailEnabled } = body;

    if (!profileId) {
      return NextResponse.json(
        { error: "profileId is required" },
        { status: 400 }
      );
    }

    // Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this material line and is owner/admin
    const { data: materialLine } = await supabase
      .from("material_lines")
      .select("organization_id")
      .eq("id", materialLineId)
      .single();

    if (!materialLine) {
      return NextResponse.json(
        { error: "Material line not found" },
        { status: 404 }
      );
    }

    // Verify user is owner/admin of the organization
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", materialLine.organization_id)
      .single();

    if (
      !membership ||
      (membership.role !== "owner" && membership.role !== "admin")
    ) {
      return NextResponse.json(
        { error: "You must be an owner or admin to manage notifications" },
        { status: 403 }
      );
    }

    // Verify the target user is a member of the organization and has appropriate role
    const { data: targetMembership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", profileId)
      .eq("organization_id", materialLine.organization_id)
      .single();

    if (!targetMembership) {
      return NextResponse.json(
        { error: "User is not a member of this organization" },
        { status: 400 }
      );
    }

    if (
      targetMembership.role !== "owner" &&
      targetMembership.role !== "admin" &&
      targetMembership.role !== "sales_person"
    ) {
      return NextResponse.json(
        {
          error:
            "Only owners, admins, and salespeople can receive notifications",
        },
        { status: 400 }
      );
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

    // Create or update notification assignment
    const { data: notification, error: notificationError } = await serviceClient
      .from("material_line_notifications")
      .upsert(
        {
          material_line_id: materialLineId,
          profile_id: profileId,
          sms_enabled: smsEnabled ?? false,
          email_enabled: emailEnabled ?? true,
        },
        {
          onConflict: "material_line_id,profile_id",
        }
      )
      .select()
      .single();

    if (notificationError) {
      console.error("Error creating notification:", notificationError);
      return NextResponse.json(
        { error: notificationError.message || "Failed to create notification" },
        { status: 500 }
      );
    }

    return NextResponse.json({ notification }, { status: 201 });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// DELETE: Remove a notification assignment
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { materialLineId } = await params;
    const { searchParams } = new URL(request.url);
    const notificationId = searchParams.get("id");

    if (!notificationId) {
      return NextResponse.json(
        { error: "Notification ID is required" },
        { status: 400 }
      );
    }

    // Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this material line and is owner/admin
    const { data: materialLine } = await supabase
      .from("material_lines")
      .select("organization_id")
      .eq("id", materialLineId)
      .single();

    if (!materialLine) {
      return NextResponse.json(
        { error: "Material line not found" },
        { status: 404 }
      );
    }

    // Verify user is owner/admin of the organization
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", materialLine.organization_id)
      .single();

    if (
      !membership ||
      (membership.role !== "owner" && membership.role !== "admin")
    ) {
      return NextResponse.json(
        { error: "You must be an owner or admin to manage notifications" },
        { status: 403 }
      );
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

    // Delete notification assignment
    const { error: deleteError } = await serviceClient
      .from("material_line_notifications")
      .delete()
      .eq("id", notificationId)
      .eq("material_line_id", materialLineId);

    if (deleteError) {
      console.error("Error deleting notification:", deleteError);
      return NextResponse.json(
        { error: deleteError.message || "Failed to delete notification" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// PATCH: Update notification preferences (SMS/Email)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { materialLineId } = await params;
    const { searchParams } = new URL(request.url);
    const notificationId = searchParams.get("id");
    const body = await request.json();
    const { smsEnabled, emailEnabled } = body;

    if (!notificationId) {
      return NextResponse.json(
        { error: "Notification ID is required" },
        { status: 400 }
      );
    }

    if (smsEnabled === undefined && emailEnabled === undefined) {
      return NextResponse.json(
        {
          error: "At least one of smsEnabled or emailEnabled must be provided",
        },
        { status: 400 }
      );
    }

    // Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this material line and is owner/admin
    const { data: materialLine } = await supabase
      .from("material_lines")
      .select("organization_id")
      .eq("id", materialLineId)
      .single();

    if (!materialLine) {
      return NextResponse.json(
        { error: "Material line not found" },
        { status: 404 }
      );
    }

    // Verify user is owner/admin of the organization
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", materialLine.organization_id)
      .single();

    if (
      !membership ||
      (membership.role !== "owner" && membership.role !== "admin")
    ) {
      return NextResponse.json(
        { error: "You must be an owner or admin to manage notifications" },
        { status: 403 }
      );
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

    // Build update object
    const updateData: { sms_enabled?: boolean; email_enabled?: boolean } = {};
    if (smsEnabled !== undefined) {
      updateData.sms_enabled = smsEnabled;
    }
    if (emailEnabled !== undefined) {
      updateData.email_enabled = emailEnabled;
    }

    // Ensure at least one notification method is enabled
    const { data: currentNotification } = await serviceClient
      .from("material_line_notifications")
      .select("sms_enabled, email_enabled")
      .eq("id", notificationId)
      .eq("material_line_id", materialLineId)
      .single();

    if (!currentNotification) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 }
      );
    }

    const finalSmsEnabled =
      smsEnabled !== undefined ? smsEnabled : currentNotification.sms_enabled;
    const finalEmailEnabled =
      emailEnabled !== undefined
        ? emailEnabled
        : currentNotification.email_enabled;

    if (!finalSmsEnabled && !finalEmailEnabled) {
      return NextResponse.json(
        { error: "At least one notification method must be enabled" },
        { status: 400 }
      );
    }

    // Update notification preferences
    const { data: updatedNotification, error: updateError } =
      await serviceClient
        .from("material_line_notifications")
        .update(updateData)
        .eq("id", notificationId)
        .eq("material_line_id", materialLineId)
        .select()
        .single();

    if (updateError) {
      console.error("Error updating notification:", updateError);
      return NextResponse.json(
        { error: updateError.message || "Failed to update notification" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { notification: updatedNotification },
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
