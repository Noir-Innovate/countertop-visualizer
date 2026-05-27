import Link from "next/link";
import { TrackView } from "@/components/analytics/TrackView";
import { ONBOARDING_EVENTS } from "@/lib/onboarding-track";
import { createServiceClient } from "@/lib/supabase/server";
import {
  MaterialLineProvider,
  type MaterialLineConfig,
} from "@/lib/material-line";
import V2Page from "../v2/page";

export const dynamic = "force-dynamic";

// Fixed demo brand. Every visitor to /demo sees the same identity regardless
// of which underlying material line backs the slabs. Drop the SVG at
// public/demo-logo.svg and flip DEMO_BRAND.logoUrl to "/demo-logo.svg" to
// turn it on.
const DEMO_BRAND = {
  name: "Countertop Visualizer",
  logoUrl: "/demo-logo.png" as string | null,
  primaryColor: "#000000",
  backgroundColor: "#ffffff",
};

// Resolves a demo material line by env-driven slug. No fallback — if the slug
// isn't configured or doesn't resolve, the page shows an unavailable state so
// the demo never silently drifts to whatever line was last created.
async function loadDemoMaterialLine(): Promise<MaterialLineConfig | null> {
  const slug = process.env.NEXT_PUBLIC_DEMO_MATERIAL_LINE_SLUG;
  if (!slug) return null;

  const service = (await createServiceClient()) as any;
  const { data } = await service
    .from("material_lines")
    .select(
      "id, organization_id, slug, supabase_folder, line_kind",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    organizationId: data.organization_id,
    slug: data.slug,
    name: DEMO_BRAND.name,
    supabaseFolder: data.supabase_folder,
    logoUrl: DEMO_BRAND.logoUrl,
    primaryColor: DEMO_BRAND.primaryColor,
    backgroundColor: DEMO_BRAND.backgroundColor,
    lineKind: data.line_kind === "internal" ? "internal" : "external",
    kitchenImages: [],
  };
}

export default async function DemoPage() {
  const materialLine = await loadDemoMaterialLine();

  if (!materialLine) {
    return (
      <div className="max-w-xl mx-auto p-8 text-center text-slate-700">
        <h1 className="text-xl font-semibold mb-2">Demo unavailable</h1>
        <p className="text-sm text-slate-600">
          No demo material line is configured. Set{" "}
          <code className="font-mono">NEXT_PUBLIC_DEMO_MATERIAL_LINE_SLUG</code>{" "}
          to a published internal line, or{" "}
          <Link href="/dashboard" className="text-blue-600 underline">
            create one in your dashboard
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <MaterialLineProvider materialLine={materialLine}>
      <TrackView event={ONBOARDING_EVENTS.demoViewed} />
      <V2Page />
    </MaterialLineProvider>
  );
}
