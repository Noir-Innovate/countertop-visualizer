import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const { data: scrape } = await service
    .from("org_onboarding_scrapes")
    .select(
      "id, organization_id, status, result, error, source_url, progress, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!scrape) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Verify the user is a member of the org that owns this scrape.
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", scrape.organization_id)
    .single();
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    id: scrape.id,
    status: scrape.status,
    sourceUrl: scrape.source_url,
    result: scrape.result,
    error: scrape.error,
    progress: scrape.progress ?? null,
    createdAt: scrape.created_at,
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const { data: scrape } = await service
    .from("org_onboarding_scrapes")
    .select("id, organization_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!scrape) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", scrape.organization_id)
    .single();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Mark the row failed so the onboarding state machine routes the user back
  // to /website. We can't actually kill an in-flight background task, but any
  // zombie writes from a dead worker will land on a row the user has abandoned.
  // We also abandon `complete` rows so the user can restart with a fresh URL.
  if (scrape.status !== "failed") {
    await service
      .from("org_onboarding_scrapes")
      .update({
        status: "failed",
        error: "Abandoned by user",
        progress: null,
      })
      .eq("id", id);
  }

  return NextResponse.json({ ok: true });
}
