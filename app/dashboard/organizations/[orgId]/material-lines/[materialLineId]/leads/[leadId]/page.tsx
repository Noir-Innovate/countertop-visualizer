import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getLeadImageUrl } from "@/lib/storage";

interface Props {
  params: Promise<{ orgId: string; materialLineId: string; leadId: string }>;
}

export default async function LeadDetailPage({ params }: Props) {
  const { orgId, materialLineId, leadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/dashboard/login");
  }

  // Verify user has access to this org
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .single();

  if (!membership) {
    notFound();
  }

  // Fetch material line
  const { data: materialLine } = await supabase
    .from("material_lines")
    .select("*")
    .eq("id", materialLineId)
    .eq("organization_id", orgId)
    .single();

  if (!materialLine) {
    notFound();
  }

  // Fetch organization name
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();

  // Fetch lead with all details
  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("material_line_id", materialLineId)
    .single();

  if (!lead) {
    notFound();
  }

  // Get image URLs
  let selectedImageUrl: string | null = null;
  let originalImageUrl: string | null = null;

  // Try to get selected image (prefer blob URL, then storage path)
  if (lead.selected_image_url) {
    selectedImageUrl = lead.selected_image_url;
  } else if (lead.image_storage_path) {
    const result = await getLeadImageUrl(lead.image_storage_path, 3600);
    selectedImageUrl = result.url || null;
  }

  // Try to get original image (prefer blob URL, then storage path)
  if (lead.original_image_url) {
    originalImageUrl = lead.original_image_url;
  } else if (lead.original_image_storage_path) {
    const result = await getLeadImageUrl(
      lead.original_image_storage_path,
      3600,
    );
    originalImageUrl = result.url || null;
  }

  // Fetch selected slab info if available
  let selectedSlabName: string | null = null;
  if (lead.selected_slab_id) {
    // Try to get slab name from materials table
    const { data: material } = await supabase
      .from("materials")
      .select("name")
      .eq("id", lead.selected_slab_id)
      .single();
    selectedSlabName = material?.name || lead.selected_slab_id;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
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
          <Link
            href={`/dashboard/organizations/${orgId}/material-lines/${materialLineId}/leads`}
            className="hover:text-slate-700"
          >
            Leads
          </Link>
          <span>/</span>
          <span>{lead.name}</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{lead.name}</h1>
            <p className="text-slate-600 mt-1">
              Submitted{" "}
              {new Date(lead.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Contact Information */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Contact Information
          </h2>
          <dl className="space-y-4">
            <div>
              <dt className="text-sm font-medium text-slate-500">Name</dt>
              <dd className="mt-1 text-sm text-slate-900">{lead.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Email</dt>
              <dd className="mt-1 text-sm text-slate-900">
                <a
                  href={`mailto:${lead.email}`}
                  className="text-blue-600 hover:text-blue-700"
                >
                  {lead.email}
                </a>
              </dd>
            </div>
            {lead.phone && (
              <div>
                <dt className="text-sm font-medium text-slate-500">Phone</dt>
                <dd className="mt-1 text-sm text-slate-900">
                  <a
                    href={`tel:${lead.phone}`}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    {lead.phone}
                  </a>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-slate-500">Address</dt>
              <dd className="mt-1 text-sm text-slate-900">{lead.address}</dd>
            </div>
            {selectedSlabName && (
              <div>
                <dt className="text-sm font-medium text-slate-500">
                  Selected Material
                </dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {selectedSlabName}
                </dd>
              </div>
            )}
            {lead.ab_variant && (
              <div>
                <dt className="text-sm font-medium text-slate-500">
                  A/B Test Variant
                </dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {lead.ab_variant}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Images */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Images</h2>
          <div className="space-y-6">
            {originalImageUrl && (
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-2">
                  Original Kitchen Image
                </h3>
                <div className="relative aspect-video bg-slate-100 rounded-lg overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={originalImageUrl}
                    alt="Original kitchen image"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            )}
            {selectedImageUrl && (
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-2">
                  Generated Visualization
                </h3>
                <div className="relative aspect-video bg-slate-100 rounded-lg overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedImageUrl}
                    alt="Generated visualization"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            )}
            {!originalImageUrl && !selectedImageUrl && (
              <p className="text-sm text-slate-500">No images available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
