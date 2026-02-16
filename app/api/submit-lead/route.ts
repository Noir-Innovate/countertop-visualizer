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
  // Attribution (UTM, referrer, custom tags)
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  referrer?: string | null;
  tags?: Record<string, string> | null;
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
  base64Data: string | undefined,
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
  materialLineSlug: string,
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
    parsed.mimeType,
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
    const data: LeadData = await request.json();

    // Validate required fields
    if (!data.name || !data.email || !data.address) {
      return NextResponse.json(
        { error: "Name, email, and address are required" },
        { status: 400 },
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 },
      );
    }

    // Use service role client to bypass RLS
    // Use direct Supabase client with service role key to properly bypass RLS
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
            contentType,
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
        materialLineSlug,
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
            contentType,
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
        materialLineSlug,
      );
      originalImageStoragePath = result.storagePath;
      originalImageSignedUrl = result.signedUrl;
    }

    // Normalize tags to JSONB (object or undefined)
    const tagsJson =
      data.tags &&
      typeof data.tags === "object" &&
      Object.keys(data.tags).length > 0
        ? data.tags
        : null;

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
        utm_source: data.utm_source ?? null,
        utm_medium: data.utm_medium ?? null,
        utm_campaign: data.utm_campaign ?? null,
        utm_term: data.utm_term ?? null,
        utm_content: data.utm_content ?? null,
        referrer: data.referrer ?? null,
        tags: tagsJson,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to store lead:", insertError);
      return NextResponse.json(
        { error: "Failed to submit lead" },
        { status: 500 },
      );
    }

    // Track quote_submitted in Supabase (with UTM for segmentation)
    supabase
      .from("analytics_events")
      .insert({
        event_type: "quote_submitted",
        material_line_id: materialLineId,
        organization_id: organizationId,
        session_id: sessionId,
        metadata: {
          lead_id: lead?.id,
          selectedSlab: data.selectedSlabName,
        },
        utm_source: data.utm_source ?? null,
        utm_medium: data.utm_medium ?? null,
        utm_campaign: data.utm_campaign ?? null,
        utm_term: data.utm_term ?? null,
        utm_content: data.utm_content ?? null,
        referrer: data.referrer ?? null,
        tags: tagsJson ?? {},
      })
      .then(
        () => {},
        (err) =>
          console.error("[analytics] quote_submitted insert:", err),
      );

    // Track analytics event with PostHog
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      const posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      });

      // Extract zip code from address (look for 5-digit zip or 5+4 format)
      const zipMatch = data.address.match(/\b(\d{5})(?:-(\d{4}))?\b/);
      const zip = zipMatch ? zipMatch[1] : null;

      posthog.capture({
        distinctId: sessionId || "anonymous",
        event: "quote_submitted",
        properties: {
          name: data.name,
          email: data.email,
          selectedSlab: data.selectedSlabName,
          address: data.address,
          zip: zip,
          materialLineId: materialLineId,
          organizationId: organizationId,
          utm_source: data.utm_source ?? undefined,
          utm_medium: data.utm_medium ?? undefined,
          utm_campaign: data.utm_campaign ?? undefined,
          utm_term: data.utm_term ?? undefined,
          utm_content: data.utm_content ?? undefined,
          referrer: data.referrer ?? undefined,
          ...(data.tags &&
            Object.keys(data.tags).length > 0 && { tags: data.tags }),
        },
      });

      await posthog.shutdown();
    }

    // Get material line name and email settings for notifications and user confirmation
    let materialLineName: string | undefined = undefined;
    let materialLineSenderName: string | undefined = undefined;
    let materialLineReplyTo: string | undefined = undefined;

    // Get organization email settings (defaults)
    let orgSenderName: string | undefined = undefined;
    let orgReplyTo: string | undefined = undefined;

    if (organizationId) {
      const { data: org } = await supabase
        .from("organizations")
        .select("email_sender_name, email_reply_to")
        .eq("id", organizationId)
        .single();
      if (org) {
        orgSenderName = org.email_sender_name || undefined;
        orgReplyTo = org.email_reply_to || undefined;
      }
    }

    if (materialLineId) {
      const { data: materialLine } = await supabase
        .from("material_lines")
        .select("name, display_title, email_sender_name, email_reply_to")
        .eq("id", materialLineId)
        .single();
      if (materialLine) {
        // Use display_title for public-facing emails, fallback to name
        materialLineName =
          materialLine.display_title || materialLine.name || undefined;
        // Material line settings override organization settings
        materialLineSenderName =
          materialLine.email_sender_name || orgSenderName;
        materialLineReplyTo = materialLine.email_reply_to || orgReplyTo;
      }
    }

    // Use organization settings if no material line settings
    const emailSenderName = materialLineSenderName || orgSenderName;
    const emailReplyTo = materialLineReplyTo || orgReplyTo;

    // Send notifications to assigned users
    if (materialLineId) {
      // Fetch notification assignments for this material line
      const { data: notifications, error: notificationsError } = await supabase
        .from("material_line_notifications")
        .select(
          `
          profile_id,
          sms_enabled,
          email_enabled,
          profiles(id, full_name, phone, email)
        `,
        )
        .eq("material_line_id", materialLineId);

      if (notificationsError) {
        console.error("Failed to fetch notifications:", notificationsError);
      }

      if (notifications && notifications.length > 0) {
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
            try {
              const messenger = new NoirMessenger();

              // Base message with lead details
              const baseMessage = `New Countertop Visualizer Lead!\n\nName: ${
                leadInfo.name
              }\nEmail: ${leadInfo.email}\n${
                leadInfo.phone ? `Phone: ${leadInfo.phone}\n` : ""
              }Address: ${leadInfo.address}\nSelected: ${
                leadInfo.selectedSlab
              }\n\nCall them immediately!`;

              // Send base message
              await messenger.sendMessage(
                userPhone,
                baseMessage,
                leadInfo.name,
              );

              // Send original kitchen image link if available
              if (originalImageSignedUrl) {
                // Small delay between messages to avoid rate limiting
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await messenger.sendMessage(
                  userPhone,
                  `Before: ${originalImageSignedUrl}`,
                  leadInfo.name,
                );
              }

              // Send new kitchen image link if available
              if (imageSignedUrl) {
                // Small delay between messages to avoid rate limiting
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await messenger.sendMessage(
                  userPhone,
                  `Wants Quote For: ${imageSignedUrl}`,
                  leadInfo.name,
                );
              }
            } catch (error) {
              console.error("Failed to send SMS notification:", error);
              // Continue - don't fail the request if SMS fails
            }
          }

          // Send email if enabled
          if (notification.email_enabled && userEmail) {
            const emailResult = await sendLeadNotificationEmail({
              to: userEmail,
              leadInfo,
              kitchenImageUrl: imageSignedUrl || undefined,
              originalImageUrl: originalImageSignedUrl || undefined,
              materialLineName: notificationMaterialLineName,
              senderName: emailSenderName,
              replyTo: emailReplyTo,
            });
            if (!emailResult.success) {
              console.error(
                "Failed to send lead notification email:",
                emailResult.error,
              );
            }
          }
        }
      }
    }

    // Send quote confirmation email to user
    try {
      const emailResult = await sendUserQuoteConfirmationEmail({
        to: data.email,
        name: data.name,
        selectedSlab: data.selectedSlabName || undefined,
        address: data.address,
        kitchenImageUrl: imageSignedUrl || undefined,
        originalImageUrl: originalImageSignedUrl || undefined,
        materialLineName: materialLineName,
        senderName: emailSenderName,
        replyTo: emailReplyTo,
      });

      if (!emailResult.success) {
        console.error(
          "Failed to send user confirmation email:",
          emailResult.error,
        );
      }
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
      { status: 500 },
    );
  }
}
