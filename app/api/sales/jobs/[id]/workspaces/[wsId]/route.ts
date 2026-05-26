import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string; wsId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id, wsId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { label?: string; kitchenImagePath?: string | null };
  try {
    body = (await request.json()) as {
      label?: string;
      kitchenImagePath?: string | null;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { data: lead } = await supabase
    .from("leads")
    .select("id, salesperson_id")
    .eq("id", id)
    .maybeSingle();
  if (!lead || lead.salesperson_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, string | null> = {};
  if (body.label !== undefined) {
    const trimmed = body.label.trim();
    updates.label = trimmed || null;
  }
  if (body.kitchenImagePath !== undefined) {
    updates.kitchen_image_path = body.kitchenImagePath || null;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const service = await createServiceClient();
  const { data: ws, error } = await service
    .from("job_workspaces")
    .update(updates)
    .eq("id", wsId)
    .eq("lead_id", id)
    .select("id, session_id, label, kitchen_image_path, created_at")
    .single();

  if (error || !ws) {
    console.error("[workspaces PATCH] failed:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update workspace" },
      { status: 500 },
    );
  }

  return NextResponse.json({ workspace: ws });
}
