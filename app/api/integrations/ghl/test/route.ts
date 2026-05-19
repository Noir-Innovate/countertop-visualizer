import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { testConnection, GhlError } from "@/lib/integrations/ghl";

export async function POST(request: NextRequest) {
  const { orgId } = (await request.json()) as { orgId?: string };
  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .single();
  if (
    !membership ||
    (membership.role !== "owner" && membership.role !== "admin")
  ) {
    return NextResponse.json(
      { error: "Org admin role required" },
      { status: 403 },
    );
  }

  const service = await createServiceClient();
  const { data: integration } = await service
    .from("crm_integrations")
    .select("location_id, api_token")
    .eq("organization_id", orgId)
    .eq("provider", "ghl")
    .maybeSingle();

  if (!integration) {
    return NextResponse.json(
      { error: "No GHL integration configured for this organization" },
      { status: 404 },
    );
  }

  let token: string;
  try {
    token = decryptSecret(integration.api_token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "decryption failed";
    await service
      .from("crm_integrations")
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: "error",
        last_test_error: msg,
      })
      .eq("organization_id", orgId)
      .eq("provider", "ghl");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  try {
    const result = await testConnection({
      locationId: integration.location_id,
      token,
    });
    await service
      .from("crm_integrations")
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: "ok",
        last_test_error: null,
      })
      .eq("organization_id", orgId)
      .eq("provider", "ghl");
    return NextResponse.json({
      ok: true,
      contactId: result.contactId,
      created: result.created,
      message:
        "Created a test contact tagged 'cv-test' in your GHL location. Safe to delete.",
    });
  } catch (e) {
    const msg =
      e instanceof GhlError
        ? e.message
        : e instanceof Error
          ? e.message
          : "unknown error";
    await service
      .from("crm_integrations")
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: "error",
        last_test_error: msg,
      })
      .eq("organization_id", orgId)
      .eq("provider", "ghl");
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
