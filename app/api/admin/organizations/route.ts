import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createServiceClient();
  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id, name, material_lines(id, name, slug)")
    .order("name");

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch organizations" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    organizations: (orgs ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      material_lines:
        (
          o as {
            material_lines?: Array<{ id: string; name: string; slug: string }>;
          }
        ).material_lines ?? [],
    })),
  });
}
