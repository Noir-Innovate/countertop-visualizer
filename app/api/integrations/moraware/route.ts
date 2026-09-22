import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/crypto";

// Per-organization Moraware integration config (tenant + username + password),
// mirroring the GHL integration. The password is encrypted at rest in api_token
// and never returned after saving — GET only ever exposes a mask.

async function requireOrgAdmin(orgId: string): Promise<
  { ok: true } | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, status: 401, error: "Unauthorized" };
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .single();
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return { ok: false, status: 403, error: "Org admin role required" };
  }
  return { ok: true };
}

interface CrmRow {
  id: string;
  organization_id: string;
  provider: string;
  tenant: string | null;
  username: string | null;
  api_token: string;
  enabled: boolean;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
  created_at: string;
  updated_at: string;
}

function sanitize(row: CrmRow) {
  let last4 = "????";
  try {
    last4 = decryptSecret(row.api_token).slice(-4);
  } catch {
    // keep placeholder
  }
  return {
    id: row.id,
    organization_id: row.organization_id,
    provider: row.provider,
    tenant: row.tenant,
    username: row.username,
    password_masked: maskSecret(`xxxx${last4}`),
    enabled: row.enabled,
    last_tested_at: row.last_tested_at,
    last_test_status: row.last_test_status,
    last_test_error: row.last_test_error,
  };
}

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
  const guard = await requireOrgAdmin(orgId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const service = await createServiceClient();
  const { data, error } = await service
    .from("crm_integrations")
    .select("*")
    .eq("organization_id", orgId)
    .eq("provider", "moraware")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ integration: data ? sanitize(data as CrmRow) : null });
}

export async function POST(request: NextRequest) {
  const { orgId, tenant, username, password, enabled } = (await request.json()) as {
    orgId?: string;
    tenant?: string;
    username?: string;
    password?: string;
    enabled?: boolean;
  };
  if (!orgId || !tenant || !username || !password) {
    return NextResponse.json(
      { error: "orgId, tenant, username, and password are required" },
      { status: 400 },
    );
  }
  const guard = await requireOrgAdmin(orgId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  let encrypted: string;
  try {
    encrypted = encryptSecret(password);
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
        provider: "moraware",
        tenant: tenant.trim(),
        username: username.trim(),
        api_token: encrypted,
        location_id: null,
        enabled: enabled ?? true,
      },
      { onConflict: "organization_id,provider" },
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ integration: sanitize(data as CrmRow) }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { orgId, tenant, username, password, enabled } = (await request.json()) as {
    orgId?: string;
    tenant?: string;
    username?: string;
    password?: string;
    enabled?: boolean;
  };
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
  const guard = await requireOrgAdmin(orgId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const patch: Record<string, unknown> = {};
  if (typeof tenant === "string" && tenant.trim()) patch.tenant = tenant.trim();
  if (typeof username === "string" && username.trim()) patch.username = username.trim();
  // Only re-encrypt if a new password was actually entered; blank keeps the old one.
  if (typeof password === "string" && password.length > 0) {
    patch.api_token = encryptSecret(password);
  }
  if (typeof enabled === "boolean") patch.enabled = enabled;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no updatable fields" }, { status: 400 });
  }
  const service = await createServiceClient();
  const { data, error } = await service
    .from("crm_integrations")
    .update(patch)
    .eq("organization_id", orgId)
    .eq("provider", "moraware")
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ integration: sanitize(data as CrmRow) });
}

export async function DELETE(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
  const guard = await requireOrgAdmin(orgId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const service = await createServiceClient();
  const { error } = await service
    .from("crm_integrations")
    .delete()
    .eq("organization_id", orgId)
    .eq("provider", "moraware");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
