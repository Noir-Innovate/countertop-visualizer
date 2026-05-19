import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/crypto";

interface SessionContext {
  userId: string;
  orgId: string;
}

async function requireOrgAdmin(orgId: string): Promise<
  | { ok: true; ctx: SessionContext }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, status: 401, error: "Unauthorized" };
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
    return { ok: false, status: 403, error: "Org admin role required" };
  }
  return { ok: true, ctx: { userId: user.id, orgId } };
}

function sanitize(row: {
  id: string;
  organization_id: string;
  provider: string;
  location_id: string;
  api_token: string;
  enabled: boolean;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
  created_at: string;
  updated_at: string;
}) {
  let tokenLast4 = "";
  try {
    const decrypted = decryptSecret(row.api_token);
    tokenLast4 = decrypted.slice(-4);
  } catch {
    tokenLast4 = "????";
  }
  return {
    id: row.id,
    organization_id: row.organization_id,
    provider: row.provider,
    location_id: row.location_id,
    token_masked: maskSecret(`xxxx${tokenLast4}`),
    enabled: row.enabled,
    last_tested_at: row.last_tested_at,
    last_test_status: row.last_test_status,
    last_test_error: row.last_test_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }
  const guard = await requireOrgAdmin(orgId);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const service = await createServiceClient();
  const { data, error } = await service
    .from("crm_integrations")
    .select("*")
    .eq("organization_id", orgId)
    .eq("provider", "ghl")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ integration: data ? sanitize(data) : null });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { orgId, locationId, apiToken, enabled } = body as {
    orgId?: string;
    locationId?: string;
    apiToken?: string;
    enabled?: boolean;
  };
  if (!orgId || !locationId || !apiToken) {
    return NextResponse.json(
      { error: "orgId, locationId, and apiToken are required" },
      { status: 400 },
    );
  }
  const guard = await requireOrgAdmin(orgId);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  let encrypted: string;
  try {
    encrypted = encryptSecret(apiToken);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "encryption failed" },
      { status: 500 },
    );
  }
  const service = await createServiceClient();
  const { data, error } = await service
    .from("crm_integrations")
    .upsert(
      {
        organization_id: orgId,
        provider: "ghl",
        location_id: locationId,
        api_token: encrypted,
        enabled: enabled ?? true,
      },
      { onConflict: "organization_id,provider" },
    )
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ integration: sanitize(data) }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { orgId, locationId, apiToken, enabled } = body as {
    orgId?: string;
    locationId?: string;
    apiToken?: string;
    enabled?: boolean;
  };
  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }
  const guard = await requireOrgAdmin(orgId);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const patch: Record<string, unknown> = {};
  if (typeof locationId === "string" && locationId.length > 0)
    patch.location_id = locationId;
  if (typeof apiToken === "string" && apiToken.length > 0)
    patch.api_token = encryptSecret(apiToken);
  if (typeof enabled === "boolean") patch.enabled = enabled;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no updatable fields" }, { status: 400 });
  }
  const service = await createServiceClient();
  const { data, error } = await service
    .from("crm_integrations")
    .update(patch)
    .eq("organization_id", orgId)
    .eq("provider", "ghl")
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ integration: sanitize(data) });
}

export async function DELETE(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }
  const guard = await requireOrgAdmin(orgId);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const service = await createServiceClient();
  const { error } = await service
    .from("crm_integrations")
    .delete()
    .eq("organization_id", orgId)
    .eq("provider", "ghl");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Also turn off per-line toggles so leads don't appear "armed" against nothing.
  await service
    .from("material_lines")
    .update({ ghl_push_enabled: false })
    .eq("organization_id", orgId);
  return NextResponse.json({ ok: true });
}
