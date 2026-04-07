import { NextRequest, NextResponse } from "next/server";
import { uploadLeadImage } from "@/lib/storage";
import { uploadImage } from "@/app/api/submit-lead/route";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { trackLeadBillingUsage } from "@/lib/billing-usage";
import { sendLeadNotificationEmail } from "@/lib/resend";
import { NoirMessenger } from "@/lib/noir-sms";

interface DownloadLeadData {
  phone: string;
  name?: string;
  source: "download" | "share";
  selectedSlabId?: string;
  selectedSlabName?: string;
  selectedImageBlobUrl?: string | null;
  selectedImageBase64?: string;
  originalImageBlobUrl?: string | null;
  originalImageBase64?: string;
  materialLineId?: string;
  organizationId?: string;
  v2SessionId?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  referrer?: string | null;
  tags?: Record<string, string> | null;
}

function sanitizeUUID(value: string | null | undefined): string | null {
  if (!value || value === "default") {
    return null;
  }
  return value;
}

export async function POST(request: NextRequest) {
  try {
    const data: DownloadLeadData = await request.json();

    if (!data.phone?.trim()) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 },
      );
    }

    const hasImage = data.selectedImageBlobUrl || data.selectedImageBase64;
    if (!hasImage) {
      return NextResponse.json({ error: "Image is required" }, { status: 400 });
    }

    const source = data.source === "share" ? "share" : "download";

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    let sessionId: string | null = null;
    const { data: session } = await supabase
      .from("user_sessions")
      .select("id")
      .eq("phone", data.phone.trim())
      .single();

    if (session) {
      sessionId = session.id;
    }

    const materialLineId = sanitizeUUID(data.materialLineId);
    const organizationId = sanitizeUUID(data.organizationId);

    let imageStoragePath: string | null = null;
    let imageSignedUrl: string | null = null;
    let originalImageStoragePath: string | null = null;
    let originalImageSignedUrl: string | null = null;

    let orgSlug = "default";
    let materialLineSlug = "default";

    if (organizationId) {
      const { data: org } = await supabase
        .from("organizations")
        .select("slug")
        .eq("id", organizationId)
        .single();
      if (org?.slug) orgSlug = org.slug;
    }

    if (materialLineId) {
      const { data: materialLine } = await supabase
        .from("material_lines")
        .select("slug")
        .eq("id", materialLineId)
        .single();
      if (materialLine?.slug) materialLineSlug = materialLine.slug;
    }

    if (data.selectedImageBlobUrl) {
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
    } else if (data.selectedImageBase64) {
      const result = await uploadImage(
        data.selectedImageBase64,
        orgSlug,
        materialLineSlug,
      );
      imageStoragePath = result.storagePath;
      imageSignedUrl = result.signedUrl;
    }

    if (data.originalImageBlobUrl) {
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
        console.error("Error downloading original from blob:", error);
      }
    } else if (data.originalImageBase64) {
      const result = await uploadImage(
        data.originalImageBase64,
        orgSlug,
        materialLineSlug,
      );
      originalImageStoragePath = result.storagePath;
      originalImageSignedUrl = result.signedUrl;
    }

    const tagsJson =
      data.tags &&
      typeof data.tags === "object" &&
      Object.keys(data.tags).length > 0
        ? data.tags
        : null;

    const leadName = data.name?.trim() || null;

    const { data: lead, error: insertError } = await supabase
      .from("leads")
      .insert({
        session_id: sessionId,
        name: leadName,
        email: null,
        address: null,
        phone: data.phone.trim(),
        sms_notifications: false,
        selected_slab_id: data.selectedSlabId || null,
        selected_image_url: imageSignedUrl,
        image_storage_path: imageStoragePath,
        original_image_url: originalImageSignedUrl,
        original_image_storage_path: originalImageStoragePath,
        ab_variant: null,
        material_line_id: materialLineId,
        organization_id: organizationId,
        utm_source: data.utm_source ?? null,
        utm_medium: data.utm_medium ?? null,
        utm_campaign: data.utm_campaign ?? null,
        utm_term: data.utm_term ?? null,
        utm_content: data.utm_content ?? null,
        referrer: data.referrer ?? null,
        tags: tagsJson,
        v2_session_id: data.v2SessionId ?? null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to store download lead:", insertError);
      return NextResponse.json(
        { error: "Failed to submit lead" },
        { status: 500 },
      );
    }

    if (organizationId && lead?.id) {
      const trackedUsage = await trackLeadBillingUsage({
        supabase,
        leadId: lead.id,
        organizationId,
        materialLineId,
        occurredAtIso: lead.created_at || new Date().toISOString(),
      });

      if (!trackedUsage.tracked) {
        console.error("Failed to write billing usage row:", trackedUsage.error);
      }
    }

    const eventType =
      source === "share" ? "share_lead_submitted" : "download_lead_submitted";
    supabase
      .from("analytics_events")
      .insert({
        event_type: eventType,
        material_line_id: materialLineId,
        organization_id: organizationId,
        session_id: sessionId,
        metadata: {
          lead_id: lead?.id,
          selectedSlab: data.selectedSlabName,
          source,
          has_name: !!leadName,
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
        (err) => console.error(`[analytics] ${eventType} insert:`, err),
      );

    // Send notifications to subscribed salespeople (same as quote flow)
    if (materialLineId) {
      let materialLineName: string | undefined;
      let orgSenderName: string | undefined;
      let orgReplyTo: string | undefined;

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

      const { data: materialLine } = await supabase
        .from("material_lines")
        .select("name, display_title, email_sender_name, email_reply_to")
        .eq("id", materialLineId)
        .single();

      if (materialLine) {
        materialLineName =
          materialLine.display_title || materialLine.name || undefined;
      }

      const emailSenderName = materialLine?.email_sender_name || orgSenderName;
      const emailReplyTo = materialLine?.email_reply_to || orgReplyTo;

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

      if (!notificationsError && notifications && notifications.length > 0) {
        const leadInfo = {
          name: leadName || "Download/Share lead",
          email: "Phone only",
          phone: data.phone.trim(),
          address: "—",
          selectedSlab: data.selectedSlabName || "Not specified",
        };
        const notificationMaterialLineName =
          materialLineName || "Countertop Visualizer";

        for (const notification of notifications) {
          const profile = Array.isArray(notification.profiles)
            ? notification.profiles[0]
            : notification.profiles;
          const userEmail = profile?.email;
          const userPhone = profile?.phone;

          if (notification.sms_enabled && userPhone) {
            try {
              const messenger = new NoirMessenger();
              const baseMessage = `New Countertop Visualizer Lead!\n\nType: Download/Share\nName: ${leadName || "Not provided"}\nPhone: ${leadInfo.phone}\nSelected: ${leadInfo.selectedSlab}\n\nCall them immediately!`;
              await messenger.sendMessage(
                userPhone,
                baseMessage,
                leadInfo.name,
              );
              if (originalImageSignedUrl) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await messenger.sendMessage(
                  userPhone,
                  `Before: ${originalImageSignedUrl}`,
                  leadInfo.name,
                );
              }
              if (imageSignedUrl) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await messenger.sendMessage(
                  userPhone,
                  `Wants: ${imageSignedUrl}`,
                  leadInfo.name,
                );
              }
            } catch (error) {
              console.error("Failed to send SMS notification:", error);
            }
          }

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Submit download lead error:", error);
    return NextResponse.json(
      { error: "Failed to submit lead" },
      { status: 500 },
    );
  }
}
