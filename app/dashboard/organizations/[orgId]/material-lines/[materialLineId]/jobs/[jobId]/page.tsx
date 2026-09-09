import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getOrgAccess } from "@/lib/admin-auth";
import { getMaterialLineBasePath } from "@/lib/material-line-path";

interface Props {
  params: Promise<{ orgId: string; materialLineId: string; jobId: string }>;
}

interface GeneratedImageRow {
  id: string;
  session_id: string;
  material_id: string | null;
  material_category: string | null;
  kitchen_image_path: string | null;
  input_image_path: string | null;
  output_image_path: string;
  generation_order: number | null;
  created_at: string;
}

interface WorkspaceRow {
  id: string;
  session_id: string;
  label: string | null;
  kitchen_image_path: string | null;
  created_at: string;
}

function publicUrl(path: string | null): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !path) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/public-assets/${encoded}`;
}

export default async function JobDetailPage({ params }: Props) {
  const { orgId, materialLineId, jobId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard/login");

  const access = await getOrgAccess(orgId);
  if (!access?.allowed) notFound();
  if (
    access.role !== "owner" &&
    access.role !== "admin" &&
    access.role !== "super_admin"
  ) {
    redirect(`/dashboard/organizations/${orgId}/material-lines/${materialLineId}`);
  }

  const service = await createServiceClient();

  const [{ data: org }, { data: line }, { data: job }] = await Promise.all([
    service.from("organizations").select("name").eq("id", orgId).single(),
    service
      .from("material_lines")
      .select("name, line_kind")
      .eq("id", materialLineId)
      .eq("organization_id", orgId)
      .single(),
    service
      .from("leads")
      .select(
        "id, address, name, email, phone, notes, gps_lat, gps_lng, created_at, v2_session_id, salesperson_id, profiles:salesperson_id(id, full_name)",
      )
      .eq("id", jobId)
      .eq("organization_id", orgId)
      .eq("material_line_id", materialLineId)
      .maybeSingle(),
  ]);

  if (!line || !job) notFound();

  const salesperson = (
    job as unknown as { profiles: { full_name: string | null } | null }
  ).profiles;

  const { data: workspaceData } = await service
    .from("job_workspaces")
    .select("id, session_id, label, kitchen_image_path, created_at")
    .eq("lead_id", jobId)
    .order("created_at", { ascending: true });

  const workspaces = (workspaceData || []) as WorkspaceRow[];

  // A job's generations hang off its workspace sessions. Older jobs predate
  // workspaces and carry a single session on the lead itself, so include that
  // too or their images silently go missing here.
  const sessionIds = Array.from(
    new Set(
      [...workspaces.map((w) => w.session_id), job.v2_session_id].filter(
        (s): s is string => !!s,
      ),
    ),
  );

  let images: GeneratedImageRow[] = [];
  if (sessionIds.length > 0) {
    const { data: imageData } = await service
      .from("generated_images")
      .select(
        "id, session_id, material_id, material_category, kitchen_image_path, input_image_path, output_image_path, generation_order, created_at",
      )
      .in("session_id", sessionIds)
      .order("created_at", { ascending: true });
    images = (imageData || []) as GeneratedImageRow[];
  }

  // Resolve material names in one round trip rather than per image.
  const materialIds = Array.from(
    new Set(images.map((i) => i.material_id).filter((m): m is string => !!m)),
  );
  const materialNames = new Map<string, string>();
  if (materialIds.length > 0) {
    const { data: materials } = await service
      .from("materials")
      .select("id, title, filename")
      .in("id", materialIds);
    for (const m of materials || []) {
      materialNames.set(m.id, m.title || m.filename);
    }
  }

  const bySession = new Map<string, GeneratedImageRow[]>();
  for (const img of images) {
    const list = bySession.get(img.session_id) || [];
    list.push(img);
    bySession.set(img.session_id, list);
  }

  // Sessions with images but no workspace row (the legacy lead-session case)
  // still deserve a panel, so synthesise one.
  const panels: {
    key: string;
    label: string;
    kitchenPath: string | null;
    images: GeneratedImageRow[];
  }[] = workspaces.map((w) => ({
    key: w.session_id,
    label: w.label || "Untitled room",
    kitchenPath: w.kitchen_image_path,
    images: bySession.get(w.session_id) || [],
  }));

  for (const sid of sessionIds) {
    if (panels.some((p) => p.key === sid)) continue;
    const imgs = bySession.get(sid) || [];
    if (imgs.length === 0) continue;
    panels.push({
      key: sid,
      label: "Earlier session",
      kitchenPath: imgs[0].kitchen_image_path,
      images: imgs,
    });
  }

  const jobTitle = job.address || job.name || "Job";
  const linePath = getMaterialLineBasePath(orgId, materialLineId, line.line_kind);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2 flex-wrap">
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
          <Link href={linePath} className="hover:text-slate-700">
            {line.name}
          </Link>
          <span>/</span>
          <Link href={`${linePath}/jobs`} className="hover:text-slate-700">
            Salesperson Jobs
          </Link>
          <span>/</span>
          <span className="text-slate-700">{jobTitle}</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900">{jobTitle}</h1>
        <p className="text-slate-600 mt-1">
          {images.length} generated image{images.length === 1 ? "" : "s"} across{" "}
          {panels.length} room{panels.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 text-sm">
          {[
            ["Customer", job.name],
            ["Salesperson", salesperson?.full_name],
            ["Email", job.email],
            ["Phone", job.phone],
            [
              "GPS",
              job.gps_lat != null && job.gps_lng != null
                ? `${job.gps_lat.toFixed(5)}, ${job.gps_lng.toFixed(5)}`
                : null,
            ],
            ["Created", new Date(job.created_at).toLocaleString()],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                {label}
              </dt>
              <dd className="mt-1 text-slate-900 break-words">
                {(value as string) || "—"}
              </dd>
            </div>
          ))}
        </dl>
        {job.notes && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Notes
            </dt>
            <dd className="mt-1 text-slate-900 whitespace-pre-wrap">
              {job.notes}
            </dd>
          </div>
        )}
      </div>

      {panels.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-6 py-12 text-center text-slate-500">
          No images have been generated for this job yet.
        </div>
      )}

      <div className="space-y-8">
        {panels.map((panel) => {
          const kitchenUrl = publicUrl(panel.kitchenPath);
          return (
            <section
              key={panel.key}
              className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-200 flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  {panel.label}
                </h2>
                <span className="text-sm text-slate-500 shrink-0">
                  {panel.images.length} image
                  {panel.images.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {kitchenUrl && (
                  <figure className="space-y-2">
                    <a
                      href={kitchenUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg overflow-hidden border-2 border-slate-300 bg-slate-100 aspect-4/3"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={kitchenUrl}
                        alt="Original kitchen photo"
                        className="w-full h-full object-cover"
                      />
                    </a>
                    <figcaption className="text-xs">
                      <span className="font-medium text-slate-700">
                        Original photo
                      </span>
                    </figcaption>
                  </figure>
                )}

                {panel.images.map((img) => {
                  const url = publicUrl(img.output_image_path);
                  const materialName = img.material_id
                    ? materialNames.get(img.material_id)
                    : null;
                  return (
                    <figure key={img.id} className="space-y-2">
                      <a
                        href={url ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-lg overflow-hidden border border-slate-200 bg-slate-100 aspect-4/3"
                      >
                        {url && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={url}
                            alt={materialName || "Generated visualization"}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        )}
                      </a>
                      <figcaption className="text-xs space-y-0.5">
                        <p className="font-medium text-slate-800 truncate">
                          {materialName || "Colour change"}
                        </p>
                        <p className="text-slate-500">
                          {img.material_category || "—"} ·{" "}
                          {new Date(img.created_at).toLocaleDateString()}
                        </p>
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
