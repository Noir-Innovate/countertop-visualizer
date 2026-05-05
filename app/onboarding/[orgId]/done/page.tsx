import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrgAccess } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getPublicVisualizerUrl } from "@/lib/material-line-path";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { OnboardingDoneActions } from "@/components/onboarding/OnboardingDoneActions";

interface Props {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ materialLineId?: string }>;
}

export default async function OnboardingDonePage({
  params,
  searchParams,
}: Props) {
  const { orgId } = await params;
  const { materialLineId } = await searchParams;

  const access = await getOrgAccess(orgId);
  if (!access) {
    redirect(`/dashboard/login?next=/onboarding/${orgId}/done`);
  }

  const service = await createServiceClient();
  const lineQuery = service
    .from("material_lines")
    .select(
      "id, name, slug, line_kind, logo_url, primary_color, accent_color, background_color, custom_domain, custom_domain_verified",
    )
    .eq("organization_id", orgId)
    .eq("line_kind", "internal");

  const { data: line } = materialLineId
    ? await lineQuery.eq("id", materialLineId).maybeSingle()
    : await lineQuery
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  if (!line) {
    redirect(`/onboarding/${orgId}/website`);
  }

  const appDomain =
    process.env.NEXT_PUBLIC_APP_DOMAIN || "countertopvisualizer.com";
  const publicUrl = getPublicVisualizerUrl(
    line.line_kind,
    line.slug,
    line.custom_domain,
    line.custom_domain_verified,
    appDomain,
  );

  const primary = line.primary_color || "#1A1A1A";
  const accent = line.accent_color || "#9CAF88";
  const background = line.background_color || "#FFFFFF";

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <OnboardingStepper current="share" />

      <div
        className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
        style={{ background }}
      >
        <div className="px-8 pt-10 pb-8 text-center">
          {line.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={line.logo_url}
              alt={line.name}
              className="mx-auto h-16 w-auto object-contain mb-6"
            />
          ) : null}
          <h1
            className="text-3xl sm:text-4xl font-bold"
            style={{ color: primary }}
          >
            You&apos;re live!
          </h1>
          <p className="mt-3 text-slate-600">
            <strong>{line.name}</strong> is set up and ready to share with your
            sales team. Use it in the showroom and on in-home visits.
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <span
              className="inline-block w-6 h-6 rounded-full ring-1 ring-slate-200"
              style={{ background: primary }}
              title="Primary"
            />
            <span
              className="inline-block w-6 h-6 rounded-full ring-1 ring-slate-200"
              style={{ background: accent }}
              title="Accent"
            />
            <span
              className="inline-block w-6 h-6 rounded-full ring-1 ring-slate-200"
              style={{ background }}
              title="Background"
            />
          </div>
        </div>
      </div>

      <OnboardingDoneActions
        orgId={orgId}
        materialLineId={line.id}
        materialLineName={line.name}
        publicUrl={publicUrl}
      />

      <div className="mt-10 text-center">
        <Link
          href={`/dashboard/organizations/${orgId}`}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Go to dashboard →
        </Link>
      </div>
    </div>
  );
}
