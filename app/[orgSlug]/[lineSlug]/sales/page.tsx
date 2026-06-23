import { redirect, notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ orgSlug: string; lineSlug: string }>;
}

/**
 * Path-based entry point for an internal "sales" line on the main app domain:
 *   /{orgSlug}/{lineSlug}/sales
 *
 * Internal lines used to live on per-line subdomains, which have their own
 * cookie scope and forced a second sign-in. Serving them under the org on the
 * main domain keeps the existing session, so salespeople land straight in the
 * portal. We resolve the line and hand off to the canonical UUID-based portal
 * (`/sales/{id}`), which enforces auth + line-assignment access.
 *
 * External lines are unaffected — they keep using subdomains.
 */
export default async function OrgLineSalesPage({ params }: Props) {
  const { orgSlug, lineSlug } = await params;
  const service = await createServiceClient();

  const { data: org } = await service
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .maybeSingle();
  if (!org) notFound();

  const { data: line } = await service
    .from("material_lines")
    .select("id")
    .eq("organization_id", org.id)
    .eq("slug", lineSlug)
    .eq("line_kind", "internal")
    .maybeSingle();
  if (!line) notFound();

  redirect(`/sales/${line.id}`);
}
