import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardContent from "./components/DashboardContent";

export const dynamic = "force-dynamic";

interface MaterialLine {
  id: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  custom_domain_verified: boolean;
}

interface Organization {
  id: string;
  name: string;
  role: string;
  material_lines?: MaterialLine[];
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/dashboard/login");
  }

  let organizations: Organization[] = [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();

  if (profile?.is_super_admin) {
    // Super admins see all organizations and material lines
    const service = await createServiceClient();
    const { data: orgs } = await service
      .from("organizations")
      .select(
        `
        id,
        name,
        material_lines(id, name, slug, custom_domain, custom_domain_verified)
      `,
      )
      .order("name");

    organizations =
      orgs?.map((o) => {
        const ml = (o as { material_lines?: MaterialLine[] }).material_lines;
        return {
          id: o.id,
          name: o.name,
          role: "super_admin",
          material_lines: ml ?? [],
        };
      }) ?? [];
  } else {
    const { data: memberships } = await supabase
      .from("organization_members")
      .select(
        `
        role,
        organizations(
          id, 
          name,
          material_lines(id, name, slug, custom_domain, custom_domain_verified)
        )
      `,
      )
      .eq("profile_id", user.id);

    organizations =
      memberships
        ?.map((m) => {
          const org = m.organizations as unknown as {
            id: string;
            name: string;
            material_lines?: MaterialLine[];
          } | null;
          return {
            id: org?.id || "",
            name: org?.name || "",
            role: m.role as string,
            material_lines: org?.material_lines || [],
          };
        })
        .filter((org) => org.id) ?? [];
  }

  return <DashboardContent organizations={organizations} />;
}
