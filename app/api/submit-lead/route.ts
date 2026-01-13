import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { notifySalesTeam, sendUserConfirmation, sendMMS } from "@/lib/twilio";
import { sendLeadNotificationEmail } from "@/lib/resend";
import { createContact } from "@/lib/ghl";
import { PostHog } from "posthog-node";
import { uploadLeadImage } from "@/lib/storage";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

interface LeadData {
  name: string;
  email: string;
  address: string;
  phone?: string;
  smsNotifications?: boolean;
  selectedSlabId?: string;
  selectedSlabName?: string;
  selectedImageUrl?: string;
  selectedImageBase64?: string; // Base64 image data
  abVariant?: string;
  materialLineId?: string;
  organizationId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const data: LeadData = await request.json();

    // Validate required fields
    if (!data.name || !data.email || !data.address) {
      return NextResponse.json(
        { error: "Name, email, and address are required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Use service role client to bypass RLS
    const supabase = await createServiceClient();

    // Get user session if phone exists (optional - for linking leads to sessions)
    let sessionId = null;
    if (data.phone) {
      const { data: session } = await supabase
        .from("user_sessions")
        .select("id")
        .eq("phone", data.phone)
        .single();

      if (session) {
        sessionId = session.id;
      }
    }

    // Handle image upload if base64 image is provided
    let imageStoragePath: string | null = null;
    let imageSignedUrl: string | null = data.selectedImageUrl || null;

    if (
      data.selectedImageBase64 &&
      data.materialLineId &&
      data.organizationId
    ) {
      // Fetch organization slug and material line slug
      const { data: org } = await supabase
        .from("organizations")
        .select("slug")
        .eq("id", data.organizationId)
        .single();

      const { data: materialLine } = await supabase
        .from("material_lines")
        .select("slug")
        .eq("id", data.materialLineId)
        .single();

      if (org?.slug && materialLine?.slug) {
        // Detect MIME type from base64 data
        const mimeMatch = data.selectedImageBase64.match(
          /data:image\/(\w+);base64/
        );
        const mimeType = mimeMatch ? `image/${mimeMatch[1]}` : "image/jpeg";

        // Upload image to storage
        const uploadResult = await uploadLeadImage(
          org.slug,
          materialLine.slug,
          data.selectedImageBase64,
          mimeType
        );

        if (uploadResult.path && uploadResult.url) {
          imageStoragePath = uploadResult.path;
          imageSignedUrl = uploadResult.url;
        } else {
          console.error("Failed to upload image:", uploadResult.error);
          // Continue without image if upload fails
        }
      }
    }

    // Store lead in Supabase
    const { data: lead, error: insertError } = await supabase
      .from("leads")
      .insert({
        session_id: sessionId,
        name: data.name,
        email: data.email,
        address: data.address,
        phone: data.phone || null,
        sms_notifications: data.smsNotifications || false,
        selected_slab_id: data.selectedSlabId || null,
        selected_image_url: imageSignedUrl,
        image_storage_path: imageStoragePath,
        ab_variant: data.abVariant || null,
        material_line_id: data.materialLineId || null,
        organization_id: data.organizationId || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to store lead:", insertError);
      return NextResponse.json(
        { error: "Failed to submit lead" },
        { status: 500 }
      );
    }

    // Track analytics event with PostHog
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      const posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      });

      posthog.capture({
        distinctId: sessionId || "anonymous",
        event: "quote_submitted",
        properties: {
          name: data.name,
          email: data.email,
          selectedSlab: data.selectedSlabName,
          materialLineId: data.materialLineId || null,
          organizationId: data.organizationId || null,
        },
      });

      await posthog.shutdown();
    }

    // Create contact in GHL
    const contactResult = await createContact({
      name: data.name,
      email: data.email,
      phone: data.phone,
      address: data.address,
      tags: ["countertop-lead", `variant-${data.abVariant || "unknown"}`],
      customFields: {
        selected_slab: data.selectedSlabName || "Not specified",
      },
    });

    if (!contactResult.success) {
      console.error("Failed to create GHL contact:", contactResult.error);
      // Don't fail the request - lead is already stored
    }

    // Send notifications to assigned users
    if (data.materialLineId) {
      // Fetch notification assignments for this material line
      const { data: notifications } = await supabase
        .from("material_line_notifications")
        .select(
          `
          profile_id,
          sms_enabled,
          email_enabled,
          profiles(id, full_name, phone)
        `
        )
        .eq("material_line_id", data.materialLineId);

      if (notifications && notifications.length > 0) {
        // Get material line name for notifications
        const { data: materialLine } = await supabase
          .from("material_lines")
          .select("name")
          .eq("id", data.materialLineId)
          .single();

        const materialLineName = materialLine?.name || "Countertop Visualizer";

        // Get user emails from auth.users
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (supabaseUrl && serviceRoleKey) {
          const serviceClient = createSupabaseClient(
            supabaseUrl,
            serviceRoleKey
          );

          // Send notifications to each assigned user
          for (const notification of notifications) {
            // Get user email
            const { data: authUser } =
              await serviceClient.auth.admin.getUserById(
                notification.profile_id
              );
            const userEmail = authUser?.user?.email;
            // Handle profiles as array (Supabase relation)
            const profile = Array.isArray(notification.profiles)
              ? notification.profiles[0]
              : notification.profiles;
            const userPhone = profile?.phone;

            const leadInfo = {
              name: data.name,
              email: data.email,
              phone: data.phone,
              address: data.address,
              selectedSlab: data.selectedSlabName || "Not specified",
            };

            // Send SMS/MMS if enabled
            if (notification.sms_enabled && userPhone) {
              const message = `🏠 New Countertop Lead!\n\nName: ${
                leadInfo.name
              }\nEmail: ${leadInfo.email}\n${
                leadInfo.phone ? `Phone: ${leadInfo.phone}\n` : ""
              }Address: ${leadInfo.address}\nSelected: ${
                leadInfo.selectedSlab
              }\n\nFollow up ASAP!`;

              if (imageSignedUrl) {
                // Send MMS with image
                await sendMMS({
                  phone: userPhone,
                  message,
                  mediaUrl: imageSignedUrl,
                });
              } else {
                // Send SMS without image
                await notifySalesTeam([userPhone], leadInfo);
              }
            }

            // Send email if enabled
            if (notification.email_enabled && userEmail) {
              await sendLeadNotificationEmail({
                to: userEmail,
                leadInfo,
                kitchenImageUrl: imageSignedUrl || undefined,
                materialLineName,
              });
            }
          }
        }
      }
    }

    // Legacy: Notify sales team via SMS (keep for backward compatibility)
    const salesPhones =
      process.env.SALES_TEAM_PHONES?.split(",").filter(Boolean) || [];

    if (salesPhones.length > 0) {
      await notifySalesTeam(salesPhones, {
        name: data.name,
        email: data.email,
        phone: data.phone,
        address: data.address,
        selectedSlab: data.selectedSlabName || "Not specified",
      });
    }

    // Send confirmation to user if they have a phone and opted in for SMS notifications
    if (data.phone && data.smsNotifications) {
      await sendUserConfirmation(
        data.phone,
        data.name,
        data.selectedSlabName || undefined,
        data.selectedImageUrl || undefined,
        {
          email: data.email,
          address: data.address,
        }
      );
    }

    return NextResponse.json({
      success: true,
      leadId: lead.id,
      message: "Lead submitted successfully",
    });
  } catch (error) {
    console.error("Submit lead error:", error);
    return NextResponse.json(
      { error: "Failed to submit lead" },
      { status: 500 }
    );
  }
}
