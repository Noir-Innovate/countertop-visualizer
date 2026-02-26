import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendFreeResourceEmail } from "@/lib/resend";

interface FreeResourceRequest {
  email: string;
  materialLineId: string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  referrer?: string | null;
  tags?: Record<string, string> | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeBrandColor(
  color: string | null | undefined,
): string | undefined {
  if (!color || typeof color !== "string") return undefined;
  const value = color.trim();
  const withHash = value.startsWith("#") ? value : `#${value}`;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(withHash)
    ? withHash
    : undefined;
}

export async function POST(request: NextRequest) {
  try {
    const data: FreeResourceRequest = await request.json();

    if (!data.email || !EMAIL_REGEX.test(data.email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 },
      );
    }

    if (!data.materialLineId || data.materialLineId === "default") {
      return NextResponse.json(
        { error: "Invalid material line" },
        { status: 400 },
      );
    }

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: materialLine, error: materialLineError } = await supabase
      .from("material_lines")
      .select(
        "id, name, display_title, organization_id, primary_color, free_resource_enabled, free_resource_title, free_resource_email_subject, free_resource_email_body, free_resource_cta_label, free_resource_file_url, email_sender_name, email_reply_to",
      )
      .eq("id", data.materialLineId)
      .single();

    if (materialLineError || !materialLine) {
      return NextResponse.json(
        { error: "Material line not found" },
        { status: 404 },
      );
    }

    if (
      !materialLine.free_resource_enabled ||
      !materialLine.free_resource_file_url
    ) {
      return NextResponse.json(
        { error: "Free resource is not configured" },
        { status: 400 },
      );
    }

    const resourceTitle =
      materialLine.free_resource_title ||
      `${materialLine.display_title || materialLine.name} Free Resource`;
    const subject =
      materialLine.free_resource_email_subject ||
      `Your free resource from ${materialLine.display_title || materialLine.name}`;
    const body =
      materialLine.free_resource_email_body ||
      "Thanks for trying our countertop visualizer. Use the button below to access your free resource.";

    const emailResult = await sendFreeResourceEmail({
      to: data.email,
      subject,
      body,
      resourceTitle,
      resourceUrl: materialLine.free_resource_file_url,
      ctaLabel: materialLine.free_resource_cta_label || undefined,
      buttonColor: normalizeBrandColor(materialLine.primary_color),
      senderName: materialLine.email_sender_name || undefined,
      replyTo: materialLine.email_reply_to || undefined,
    });

    if (!emailResult.success) {
      return NextResponse.json(
        { error: emailResult.error || "Failed to send email" },
        { status: 500 },
      );
    }

    const tagsJson =
      data.tags &&
      typeof data.tags === "object" &&
      Object.keys(data.tags).length > 0
        ? data.tags
        : {};

    // Best-effort analytics insert; this should never fail the request.
    supabase
      .from("analytics_events")
      .insert({
        event_type: "free_resource_email_sent",
        material_line_id: materialLine.id,
        organization_id: materialLine.organization_id,
        metadata: {
          email: data.email,
        },
        utm_source: data.utm_source ?? null,
        utm_medium: data.utm_medium ?? null,
        utm_campaign: data.utm_campaign ?? null,
        utm_term: data.utm_term ?? null,
        utm_content: data.utm_content ?? null,
        referrer: data.referrer ?? null,
        tags: tagsJson,
      })
      .then(
        () => {},
        (err) =>
          console.error("[analytics] free_resource_email_sent insert:", err),
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Free resource send error:", error);
    return NextResponse.json(
      { error: "Failed to send free resource" },
      { status: 500 },
    );
  }
}
