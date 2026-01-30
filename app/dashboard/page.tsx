import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getPostHogEventCounts } from "@/lib/posthog-server";
import DashboardContent from "./components/DashboardContent";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/dashboard/login");
  }

  // Define types for the query result
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

  // Fetch user's organizations and their material lines
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

  const organizations: Organization[] =
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
      .filter((org) => org.id) || [];

  // Fetch analytics from PostHog
  const allMaterialLineIds = organizations.flatMap(
    (org) => org.material_lines?.map((ml) => ml.id) || [],
  );

  let totalPageViews = 0;
  let totalQuoteRequests = 0;

  if (allMaterialLineIds.length > 0) {
    const [pageViews, quoteRequests] = await getPostHogEventCounts([
      {
        eventName: "page_view",
        materialLineIds: allMaterialLineIds,
      },
      {
        eventName: "quote_submitted",
        materialLineIds: allMaterialLineIds,
      },
    ]);

    totalPageViews = pageViews;
    totalQuoteRequests = quoteRequests;
  }

  return (
    <DashboardContent
      organizations={organizations}
      totalPageViews={totalPageViews}
      totalQuoteRequests={totalQuoteRequests}
    />
  );
}
