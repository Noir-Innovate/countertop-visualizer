import { NextRequest, NextResponse } from "next/server";
import { sendUserConfirmation } from "@/lib/twilio";
import {
  sendLeadNotificationEmail,
  sendUserQuoteConfirmationEmail,
} from "@/lib/resend";
import { PostHog } from "posthog-node";
import { uploadLeadImage } from "@/lib/storage";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NoirMessenger } from "@/lib/noir-sms";

interface LeadData {
  name: string;
  email: string;
  address: string;
  phone?: string;
  smsNotifications?: boolean;
  selectedSlabId?: string;
  selectedSlabName?: string;
  // Vercel Blob URLs (preferred - uploaded directly from client)
  selectedImageBlobUrl?: string | null;
  originalImageBlobUrl?: string | null;
  // Legacy: Storage paths and URLs (for backwards compatibility)
  selectedImageStoragePath?: string | null;
  selectedImageSignedUrl?: string | null;
  originalImageStoragePath?: string | null;
  originalImageSignedUrl?: string | null;
  // Legacy: Base64 image data (fallback for backwards compatibility)
  selectedImageBase64?: string;
  originalImageBase64?: string;
  abVariant?: string;
  materialLineId?: string;
  organizationId?: string;
}

// Convert "default" to null, otherwise return the value or null
function sanitizeUUID(value: string | null | undefined): string | null {
  if (!value || value === "default") {
    return null;
  }
  return value;
}

// Parse base64 image data to extract MIME type
export function parseBase64Image(
  base64Data: string | undefined
): { mimeType: string; data: string } | null {
  if (!base64Data || !base64Data.startsWith("data:image")) {
    return null;
  }

  // Detect MIME type from base64 data URL
  const mimeMatch = base64Data.match(/data:image\/(\w+);base64/);
  const mimeType = mimeMatch ? `image/${mimeMatch[1]}` : "image/jpeg";

  return { mimeType, data: base64Data };
}

// Upload an image to storage
export async function uploadImage(
  base64Data: string | undefined,
  orgSlug: string,
  materialLineSlug: string
): Promise<{ storagePath: string | null; signedUrl: string | null }> {
  // Parse base64 data
  const parsed = parseBase64Image(base64Data);
  if (!parsed) {
    return { storagePath: null, signedUrl: null };
  }

  // Upload image to storage
  const uploadResult = await uploadLeadImage(
    orgSlug,
    materialLineSlug,
    parsed.data,
    parsed.mimeType
  );

  if (uploadResult.path && uploadResult.url) {
    return {
      storagePath: uploadResult.path,
      signedUrl: uploadResult.url,
    };
  } else {
    console.error("Failed to upload image:", uploadResult.error);
    return { storagePath: null, signedUrl: null };
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log("Swag 1");
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
    // Use direct Supabase client with service role key to properly bypass RLS
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

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

    // Sanitize UUIDs - convert "default" to null
    const materialLineId = sanitizeUUID(data.materialLineId);
    const organizationId = sanitizeUUID(data.organizationId);

    // Handle images: prefer blob URLs, then storage paths/URLs, fallback to base64 upload
    let imageStoragePath: string | null = null;
    let imageSignedUrl: string | null = null;
    let originalImageStoragePath: string | null = null;
    let originalImageSignedUrl: string | null = null;

    // Get organization and material line slugs if needed for upload
    let orgSlug = "default";
    let materialLineSlug = "default";

    if (organizationId) {
      const { data: org } = await supabase
        .from("organizations")
        .select("slug")
        .eq("id", organizationId)
        .single();
      if (org?.slug) {
        orgSlug = org.slug;
      }
    }

    if (materialLineId) {
      const { data: materialLine } = await supabase
        .from("material_lines")
        .select("slug")
        .eq("id", materialLineId)
        .single();
      if (materialLine?.slug) {
        materialLineSlug = materialLine.slug;
      }
    }

    // Handle selected image: prefer blob URL, then storage path, then base64
    if (data.selectedImageBlobUrl) {
      // Download from Vercel Blob and upload to Supabase
      try {
        const blobResponse = await fetch(data.selectedImageBlobUrl);
        if (blobResponse.ok) {
          const arrayBuffer = await blobResponse.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const contentType =
            blobResponse.headers.get("content-type") || "image/jpeg";

          const result = await uploadLeadImage(
            orgSlug,
            materialLineSlug,
            buffer,
            contentType
          );
          if (result.path && result.url) {
            imageStoragePath = result.path;
            imageSignedUrl = result.url;
          }
        }
      } catch (error) {
        console.error("Error downloading from blob:", error);
      }
    } else if (data.selectedImageStoragePath && data.selectedImageSignedUrl) {
      // Use existing storage paths/URLs (legacy)
      imageStoragePath = data.selectedImageStoragePath;
      imageSignedUrl = data.selectedImageSignedUrl;
    } else if (data.selectedImageBase64) {
      // Fallback: upload base64 image (legacy support)
      const result = await uploadImage(
        data.selectedImageBase64,
        orgSlug,
        materialLineSlug
      );
      imageStoragePath = result.storagePath;
      imageSignedUrl = result.signedUrl;
    }

    // Handle original image: prefer blob URL, then storage path, then base64
    if (data.originalImageBlobUrl) {
      // Download from Vercel Blob and upload to Supabase
      try {
        const blobResponse = await fetch(data.originalImageBlobUrl);
        if (blobResponse.ok) {
          const arrayBuffer = await blobResponse.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const contentType =
            blobResponse.headers.get("content-type") || "image/jpeg";

          const result = await uploadLeadImage(
            orgSlug,
            materialLineSlug,
            buffer,
            contentType
          );
          if (result.path && result.url) {
            originalImageStoragePath = result.path;
            originalImageSignedUrl = result.url;
          }
        }
      } catch (error) {
        console.error("Error downloading from blob:", error);
      }
    } else if (data.originalImageStoragePath && data.originalImageSignedUrl) {
      // Use existing storage paths/URLs (legacy)
      originalImageStoragePath = data.originalImageStoragePath;
      originalImageSignedUrl = data.originalImageSignedUrl;
    } else if (data.originalImageBase64) {
      // Fallback: upload base64 image (legacy support)
      const result = await uploadImage(
        data.originalImageBase64,
        orgSlug,
        materialLineSlug
      );
      originalImageStoragePath = result.storagePath;
      originalImageSignedUrl = result.signedUrl;
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
        original_image_url: originalImageSignedUrl,
        original_image_storage_path: originalImageStoragePath,
        ab_variant: data.abVariant || null,
        material_line_id: materialLineId,
        organization_id: organizationId,
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
          materialLineId: materialLineId,
          organizationId: organizationId,
        },
      });

      await posthog.shutdown();
    }

    // Get material line name for notifications and user confirmation
    let materialLineName: string | undefined = undefined;
    if (materialLineId) {
      const { data: materialLine } = await supabase
        .from("material_lines")
        .select("name")
        .eq("id", materialLineId)
        .single();
      materialLineName = materialLine?.name || undefined;
    }

    // Send notifications to assigned users
    if (materialLineId) {
      console.log("Material Line ID", materialLineId);
      // Fetch notification assignments for this material line
      const { data: notifications, error: notificationsError } = await supabase
        .from("material_line_notifications")
        .select(
          `
          profile_id,
          sms_enabled,
          email_enabled,
          profiles(id, full_name, phone, email)
        `
        )
        .eq("material_line_id", materialLineId);

      if (notificationsError) {
        console.error("Failed to fetch notifications:", notificationsError);
      }

      console.log("notifications", notifications);

      if (notifications && notifications.length > 0) {
        console.log("Swag 3");
        const notificationMaterialLineName =
          materialLineName || "Countertop Visualizer";

        // Send notifications to each assigned user
        for (const notification of notifications) {
          // Handle profiles as array (Supabase relation)
          const profile = Array.isArray(notification.profiles)
            ? notification.profiles[0]
            : notification.profiles;
          const userEmail = profile?.email;
          const userPhone = profile?.phone;

          const leadInfo = {
            name: data.name,
            email: data.email,
            phone: data.phone,
            address: data.address,
            selectedSlab: data.selectedSlabName || "Not specified",
          };

          // Send SMS if enabled using NoirMessenger
          if (notification.sms_enabled && userPhone) {
            let message = `🏠 New Countertop Lead!\n\nName: ${
              leadInfo.name
            }\nEmail: ${leadInfo.email}\n${
              leadInfo.phone ? `Phone: ${leadInfo.phone}\n` : ""
            }Address: ${leadInfo.address}\nSelected: ${
              leadInfo.selectedSlab
            }\n\nCall them immediately!`;

            // Add image URLs to message if available
            if (originalImageSignedUrl || imageSignedUrl) {
              message += "\n\nImages:";
              if (originalImageSignedUrl) {
                message += `\nBefore: ${originalImageSignedUrl}`;
              }
              if (imageSignedUrl) {
                message += `\nWants Quote For: ${imageSignedUrl}`;
              }
            }

            try {
              const messenger = new NoirMessenger();
              await messenger.sendMessage(userPhone, message, leadInfo.name);
            } catch (error) {
              console.error("Failed to send SMS notification:", error);
              // Continue - don't fail the request if SMS fails
            }
          }

          // Send email if enabled
          if (notification.email_enabled && userEmail) {
            await sendLeadNotificationEmail({
              to: userEmail,
              leadInfo,
              kitchenImageUrl: imageSignedUrl || undefined,
              originalImageUrl: originalImageSignedUrl || undefined,
              materialLineName: notificationMaterialLineName,
            });
          }
        }
      }
    }

    // Send quote confirmation email to user
    try {
      await sendUserQuoteConfirmationEmail({
        to: data.email,
        name: data.name,
        selectedSlab: data.selectedSlabName || undefined,
        address: data.address,
        kitchenImageUrl: imageSignedUrl || undefined,
        originalImageUrl: originalImageSignedUrl || undefined,
        materialLineName: materialLineName,
      });
    } catch (error) {
      console.error("Failed to send user confirmation email:", error);
      // Continue - don't fail the request if email fails
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
