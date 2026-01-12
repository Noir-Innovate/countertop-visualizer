import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notifySalesTeam, sendUserConfirmation } from "@/lib/twilio";
import { createContact } from "@/lib/ghl";
import { trackQuoteSubmitted } from "@/lib/analytics";

interface LeadData {
  name: string;
  email: string;
  address: string;
  phone?: string;
  smsNotifications?: boolean;
  selectedSlabId?: string;
  selectedSlabName?: string;
  selectedImageUrl?: string;
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
    const supabase = createServerClient();

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
        selected_image_url: data.selectedImageUrl || null,
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

    // Track analytics event
    if (data.materialLineId && data.organizationId) {
      await trackQuoteSubmitted(data.materialLineId, data.organizationId, {
        name: data.name,
        email: data.email,
        selectedSlab: data.selectedSlabName,
      });
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

    // Notify sales team via SMS
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
