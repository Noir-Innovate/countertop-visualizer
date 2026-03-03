import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/admin-auth";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (await isSuperAdmin()) {
      // Super admins get all organizations
      const service = await createServiceClient();
      const { data: orgs, error } = await service
        .from("organizations")
        .select("id, name")
        .order("name");

      if (error) {
        console.error("Fetch orgs error (super admin):", error);
        return NextResponse.json(
          { error: "Failed to fetch organizations" },
          { status: 500 },
        );
      }

      const organizations = (orgs ?? []).map((o) => ({
        id: o.id,
        name: o.name,
        role: "super_admin",
      }));

      return NextResponse.json(organizations);
    }

    const { data: memberships, error: membershipsError } = await supabase
      .from("organization_members")
      .select(
        `
        role,
        organizations(id, name)
      `,
      )
      .eq("profile_id", user.id)
      .in("role", ["owner", "admin"]);

    if (membershipsError) {
      console.error("Fetch orgs error:", membershipsError);
      return NextResponse.json(
        { error: "Failed to fetch organizations" },
        { status: 500 },
      );
    }

    const organizations = (memberships ?? [])
      .map((m) => {
        const org = m.organizations as unknown as {
          id: string;
          name: string;
        } | null;
        if (!org?.id) return null;
        return { id: org.id, name: org.name, role: m.role };
      })
      .filter(
        (x): x is { id: string; name: string; role: string } => x != null,
      );

    return NextResponse.json(organizations);
  } catch (err) {
    console.error("Organizations mine error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
