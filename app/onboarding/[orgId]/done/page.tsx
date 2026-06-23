import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrgAccess } from "@/lib/admin-auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPublicVisualizerUrl } from "@/lib/material-line-path";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { TrackView } from "@/components/analytics/TrackView";
import { ONBOARDING_EVENTS } from "@/lib/onboarding-track";

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
      "id, name, slug, line_kind, access_locked, logo_url, primary_color, accent_color, background_color, custom_domain, custom_domain_verified",
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

  const { data: org } = await service
    .from("organizations")
    .select("slug")
    .eq("id", orgId)
    .maybeSingle();

  const appDomain =
    process.env.NEXT_PUBLIC_APP_DOMAIN || "countertopvisualizer.com";
  const publicUrl = getPublicVisualizerUrl({
    lineKind: line.line_kind,
    slug: line.slug,
    customDomain: line.custom_domain,
    customDomainVerified: line.custom_domain_verified,
    appDomain,
    accessLocked: line.access_locked,
    orgSlug: org?.slug,
  });

  const primary = line.primary_color || "#1A1A1A";
  const accent = line.accent_color || "#9CAF88";
  const background = line.background_color || "#FFFFFF";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <TrackView
        event={ONBOARDING_EVENTS.doneViewed}
        organizationId={orgId}
        profileId={user?.id}
      />
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
            <strong>{line.name}</strong> is set up and ready for your sales
            team. Open it in the showroom or on in-home visits to show buyers
            their kitchen with your slabs.
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

      <div className="mt-8">
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full px-5 py-4 rounded-xl bg-blue-600 text-white text-center text-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Go to your sales page →
        </a>
      </div>

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
