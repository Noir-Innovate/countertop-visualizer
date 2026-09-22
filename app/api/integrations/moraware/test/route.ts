import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { MorawareClient, MorawareError } from "@/lib/moraware/client";

// Tests the saved Moraware credentials by opening and closing a session.

async function requireOrgAdmin(orgId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .single();
  return !!membership && (membership.role === "owner" || membership.role === "admin");
}

export async function POST(request: NextRequest) {
  const { orgId } = (await request.json()) as { orgId?: string };
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
  if (!(await requireOrgAdmin(orgId))) {
    return NextResponse.json({ error: "Org admin role required" }, { status: 403 });
  }

  const service = await createServiceClient();
  const { data: row } = await service
    .from("crm_integrations")
    .select("tenant, username, api_token")
    .eq("organization_id", orgId)
    .eq("provider", "moraware")
    .maybeSingle();
  if (!row || !row.tenant || !row.username) {
    return NextResponse.json({ error: "Moraware is not configured" }, { status: 400 });
  }

  let status = "ok";
  let errorMessage: string | null = null;
  try {
    const client = new MorawareClient({
      tenant: row.tenant,
      userName: row.username,
      password: decryptSecret(row.api_token),
      timeoutMs: 30_000,
    });
    await client.login();
    await client.logout();
  } catch (e) {
    status = "error";
    errorMessage =
      e instanceof MorawareError
        ? `${e.codeDescription ?? "error"}: ${e.message}`
        : e instanceof Error
          ? e.message
          : "connection failed";
  }

  await service
    .from("crm_integrations")
    .update({
      last_tested_at: new Date().toISOString(),
      last_test_status: status,
      last_test_error: errorMessage,
    })
    .eq("organization_id", orgId)
    .eq("provider", "moraware");

  return NextResponse.json(
    { status, error: errorMessage },
    { status: status === "ok" ? 200 : 502 },
  );
}
