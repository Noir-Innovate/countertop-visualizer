import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import TrackingLinksClient from "./TrackingLinksClient";

interface Props {
  params: Promise<{ orgId: string; materialLineId: string }>;
}

export default async function TrackingLinksPage({ params }: Props) {
  const { orgId, materialLineId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/dashboard/login");
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .single();

  if (!membership) {
    notFound();
  }

  const { data: materialLine } = await supabase
    .from("material_lines")
    .select("id, name, slug, custom_domain, custom_domain_verified")
    .eq("id", materialLineId)
    .eq("organization_id", orgId)
    .single();

  if (!materialLine) {
    notFound();
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();

  const appDomain =
    process.env.NEXT_PUBLIC_APP_DOMAIN || "countertopvisualizer.com";
  const baseUrl =
    materialLine.custom_domain && materialLine.custom_domain_verified
      ? `https://${materialLine.custom_domain}`
      : `https://${materialLine.slug}.${appDomain}`;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          <Link href="/dashboard" className="hover:text-slate-700">
            Dashboard
          </Link>
          <span>/</span>
          <Link
            href={`/dashboard/organizations/${orgId}`}
            className="hover:text-slate-700"
          >
            {org?.name}
          </Link>
          <span>/</span>
          <Link
            href={`/dashboard/organizations/${orgId}/material-lines/${materialLineId}`}
            className="hover:text-slate-700"
          >
            {materialLine.name}
          </Link>
          <span>/</span>
          <span>Tracking links</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900">
          Tracking links
        </h1>
        <p className="text-slate-600 mt-1">
          Create URLs with UTM parameters and tags for ads, social, and
          campaigns. Save them to copy again later.
        </p>
      </div>

      <TrackingLinksClient
        materialLineId={materialLineId}
        baseUrl={baseUrl}
      />
    </div>
  );
}
