import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrgAccess } from "@/lib/admin-auth";

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/**
 * Returns the display fields for a single organization.
 *
 * Client components can't read `organizations` directly: RLS scopes that table
 * to members and creators, so a super admin viewing an org they don't belong to
 * gets nothing back and renders a blank name. Access is gated here instead, and
 * the read runs with the service client once the gate passes.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { orgId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await getOrgAccess(orgId);
  if (!access?.allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const service = await createServiceClient();
  const { data: org, error } = await service
    .from("organizations")
    .select("id, name, slug")
    .eq("id", orgId)
    .single();

  if (error || !org) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ...org, role: access.role });
}
