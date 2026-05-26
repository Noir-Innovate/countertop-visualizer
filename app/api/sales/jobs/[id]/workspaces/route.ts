import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface CreateBody {
  sessionId: string;
  kitchenImagePath?: string;
  label?: string;
}

function publicUrlBuilder() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return (path: string | null | undefined) =>
    path ? `${base}/storage/v1/object/public/public-assets/${path}` : null;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ownership check.
  const { data: lead } = await supabase
    .from("leads")
    .select("id, salesperson_id")
    .eq("id", id)
    .maybeSingle();
  if (!lead || lead.salesperson_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const service = await createServiceClient();
  const { data: workspaces, error } = await service
    .from("job_workspaces")
    .select("id, session_id, label, kitchen_image_path, created_at")
    .eq("lead_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[workspaces GET] failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sessionIds = (workspaces || []).map((w) => w.session_id);
  const toUrl = publicUrlBuilder();

  // Pull all generations in one query, then bucket by session_id.
  let generationsBySession = new Map<
    string,
    {
      id: string;
      materialId: string | null;
      materialName: string | null;
      materialCategory: string;
      outputImageUrl: string | null;
      kitchenImageUrl: string | null;
      kitchenImagePath: string | null;
      generationOrder: number;
      createdAt: string;
    }[]
  >();

  if (sessionIds.length > 0) {
    const { data: gens } = await service
      .from("generated_images")
      .select(
        `
        id,
        session_id,
        material_id,
        material_category,
        kitchen_image_path,
        output_image_path,
        generation_order,
        created_at,
        materials(title)
        `,
      )
      .in("session_id", sessionIds)
      .order("generation_order", { ascending: true });

    type Row = {
      id: string;
      session_id: string;
      material_id: string | null;
      material_category: string;
      kitchen_image_path: string;
      output_image_path: string;
      generation_order: number;
      created_at: string;
      materials: { title: string | null } | { title: string | null }[] | null;
    };

    generationsBySession = new Map();
    for (const r of (gens || []) as Row[]) {
      const mat = Array.isArray(r.materials) ? r.materials[0] : r.materials;
      const arr = generationsBySession.get(r.session_id) || [];
      arr.push({
        id: r.id,
        materialId: r.material_id,
        materialName: mat?.title || null,
        materialCategory: r.material_category,
        outputImageUrl: toUrl(r.output_image_path),
        kitchenImageUrl: toUrl(r.kitchen_image_path),
        kitchenImagePath: r.kitchen_image_path,
        generationOrder: r.generation_order,
        createdAt: r.created_at,
      });
      generationsBySession.set(r.session_id, arr);
    }
  }

  const result = (workspaces || []).map((w, idx) => ({
    id: w.id,
    sessionId: w.session_id,
    label: w.label || `Workspace ${idx + 1}`,
    kitchenImagePath: w.kitchen_image_path,
    kitchenImageUrl: toUrl(w.kitchen_image_path),
    createdAt: w.created_at,
    generations: generationsBySession.get(w.session_id) || [],
  }));

  return NextResponse.json({ workspaces: result });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  // Ownership check.
  const { data: lead } = await supabase
    .from("leads")
    .select("id, salesperson_id")
    .eq("id", id)
    .maybeSingle();
  if (!lead || lead.salesperson_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const service = await createServiceClient();
  // Auto-label: first one is "Kitchen", subsequent are "Kitchen 2", "Kitchen 3"…
  const { count } = await service
    .from("job_workspaces")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", id);
  const next = (count || 0) + 1;
  const defaultLabel = next === 1 ? "Kitchen" : `Kitchen ${next}`;

  const { data: ws, error } = await service
    .from("job_workspaces")
    .insert({
      lead_id: id,
      session_id: body.sessionId,
      label: body.label?.trim() || defaultLabel,
      kitchen_image_path: body.kitchenImagePath || null,
    })
    .select("id, session_id, label, kitchen_image_path, created_at")
    .single();

  if (error || !ws) {
    console.error("[workspaces POST] failed:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create workspace" },
      { status: 500 },
    );
  }

  const toUrl = publicUrlBuilder();
  return NextResponse.json(
    {
      workspace: {
        id: ws.id,
        sessionId: ws.session_id,
        label: ws.label,
        kitchenImagePath: ws.kitchen_image_path,
        kitchenImageUrl: toUrl(ws.kitchen_image_path),
        createdAt: ws.created_at,
        generations: [],
      },
    },
    { status: 201 },
  );
}
