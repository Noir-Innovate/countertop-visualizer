/**
 * Server-side finalize step for the onboarding wizard.
 *
 * Given a confirmed scrape result, create the internal material line and
 * download/reupload chosen images into the public-assets bucket. We always run
 * with the service-role client so RLS doesn't trip during cross-row writes.
 *
 * The DB trigger from migration 039 ensures we don't reach this code unless
 * the org has an active billing account (active|trialing|past_due).
 */

import { createServiceClient } from "@/lib/supabase/server";
import type { AllowedCategory } from "@/lib/scrape-classify";
import { DEFAULT_CATEGORY_COLORS } from "@/lib/cabinet-colors";
import sharp from "sharp";

const BUCKET = "public-assets";

export interface FinalizeMaterialInput {
  src_url: string | null;
  uploaded_path?: string;
  title: string;
  category: AllowedCategory;
}

export interface FinalizeOnboardingInput {
  organizationId: string;
  scrapeId: string;
  materialLineName: string;
  materialLineSlug: string;
  logo:
    | { mode: "scraped"; src_url: string }
    | { mode: "uploaded"; storage_path: string }
    | { mode: "none" };
  colors: { primary: string; accent: string; background: string };
  materials: FinalizeMaterialInput[];
}

export interface FinalizeOnboardingResult {
  materialLineId: string;
  materialsCreated: number;
  failedImages: Array<{ src_url: string; error: string }>;
}

export async function finalizeOnboarding(
  input: FinalizeOnboardingInput,
): Promise<FinalizeOnboardingResult> {
  const service = await createServiceClient();

  const { data: org } = await service
    .from("organizations")
    .select("slug")
    .eq("id", input.organizationId)
    .single();
  if (!org?.slug) {
    throw new Error("Organization not found or missing slug");
  }

  const folder = `${org.slug}/${input.materialLineSlug}`;

  const { data: existing } = await service
    .from("material_lines")
    .select("id")
    .eq("slug", input.materialLineSlug)
    .maybeSingle();
  if (existing) {
    throw new Error("This slug is already taken. Please pick another.");
  }

  // Upload logo first so we can reference it on the material_lines row.
  let logoUrl: string | null = null;
  if (input.logo.mode === "scraped") {
    logoUrl = await downloadAndStore({
      service,
      sourceUrl: input.logo.src_url,
      folder,
      basename: "logo",
      preserveOriginal: true,
    });
  } else if (input.logo.mode === "uploaded") {
    logoUrl = publicUrl(input.logo.storage_path);
  }

  const { data: materialLine, error: mlError } = await service
    .from("material_lines")
    .insert({
      organization_id: input.organizationId,
      name: input.materialLineName,
      slug: input.materialLineSlug,
      supabase_folder: folder,
      line_kind: "internal",
      logo_url: logoUrl,
      primary_color: input.colors.primary,
      accent_color: input.colors.accent,
      background_color: input.colors.background,
      category_colors: DEFAULT_CATEGORY_COLORS,
    })
    .select("id")
    .single();

  if (mlError || !materialLine) {
    throw new Error(mlError?.message ?? "Failed to create material line");
  }

  const failedImages: Array<{ src_url: string; error: string }> = [];
  const orderByCategory = new Map<AllowedCategory, number>();

  for (const material of input.materials) {
    const order = orderByCategory.get(material.category) ?? 0;
    orderByCategory.set(material.category, order + 1);

    let storagePath: string | null = null;
    let filename: string | null = null;

    if (material.uploaded_path) {
      storagePath = material.uploaded_path;
      filename = material.uploaded_path.split("/").pop() ?? null;
    } else if (material.src_url) {
      try {
        const stored = await downloadAndStoreWithFilename({
          service,
          sourceUrl: material.src_url,
          folder,
          baseHint: material.title,
        });
        storagePath = stored.path;
        filename = stored.filename;
      } catch (err) {
        failedImages.push({
          src_url: material.src_url,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
    } else {
      continue;
    }

    if (!storagePath || !filename) continue;

    const { error: matError } = await service.from("materials").insert({
      material_line_id: materialLine.id,
      filename,
      title: material.title,
      material_category: material.category,
      order,
    });
    if (matError) {
      failedImages.push({
        src_url: material.src_url ?? storagePath,
        error: matError.message,
      });
    }
  }

  // Mark the scrape complete-with-finalized so we don't redirect back to wizard.
  await service
    .from("org_onboarding_scrapes")
    .update({ status: "complete" })
    .eq("id", input.scrapeId);

  return {
    materialLineId: materialLine.id,
    materialsCreated: input.materials.length - failedImages.length,
    failedImages,
  };
}

interface ServiceClient {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Buffer,
        opts: { contentType: string; upsert: boolean },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
}

async function downloadAndStore(args: {
  service: ServiceClient;
  sourceUrl: string;
  folder: string;
  basename: string;
  /**
   * If true, store the original bytes verbatim instead of re-encoding to JPEG.
   * Required for logos so transparency (PNG, SVG, WebP alpha) is preserved —
   * JPEG flattens transparent pixels to black.
   */
  preserveOriginal?: boolean;
}): Promise<string> {
  const { service, sourceUrl, folder, basename, preserveOriginal } = args;
  const { buf, ext, contentType } = preserveOriginal
    ? await fetchOriginal(sourceUrl)
    : await fetchAsImage(sourceUrl);
  const filename = `${basename}.${ext}`;
  const path = `${folder}/${filename}`;
  const { error } = await service.storage
    .from(BUCKET)
    .upload(path, buf, { contentType, upsert: true });
  if (error) throw new Error(error.message);
  return publicUrl(path);
}

async function fetchOriginal(
  url: string,
): Promise<{ buf: Buffer; ext: string; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch returned ${res.status}`);
  const rawContentType = res.headers.get("content-type") ?? "image/png";
  // Strip any "; charset=..." suffix — Supabase storage matches the bare
  // media type against the bucket's allowed_mime_types and rejects
  // "image/svg+xml; charset=utf-8" even though "image/svg+xml" is allowed.
  const contentType = rawContentType.split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw new Error(`Not an image (got ${rawContentType})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = extFromContentType(contentType) ?? extFromUrl(url) ?? "png";
  return { buf, ext, contentType };
}

function extFromContentType(ct: string): string | null {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/avif": "avif",
  };
  const base = ct.split(";")[0].trim().toLowerCase();
  return map[base] ?? null;
}

function extFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const m = pathname.match(/\.(png|jpe?g|webp|gif|svg|avif)$/);
    return m ? (m[1] === "jpeg" ? "jpg" : m[1]) : null;
  } catch {
    return null;
  }
}

async function downloadAndStoreWithFilename(args: {
  service: ServiceClient;
  sourceUrl: string;
  folder: string;
  baseHint: string;
}): Promise<{ path: string; filename: string }> {
  const { service, sourceUrl, folder, baseHint } = args;
  const { buf, ext, contentType } = await fetchAsImage(sourceUrl);

  const safeBase = slugify(baseHint) || "material";
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const filename = `${safeBase}-${stamp}.${ext}`;
  const path = `${folder}/${filename}`;

  const { error } = await service.storage
    .from(BUCKET)
    .upload(path, buf, { contentType, upsert: false });
  if (error) throw new Error(error.message);

  return { path, filename };
}

async function fetchAsImage(
  url: string,
): Promise<{ buf: Buffer; ext: string; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Image fetch returned ${res.status}`);
  }
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Not an image (got ${contentType})`);
  }

  const raw = Buffer.from(await res.arrayBuffer());

  // Re-encode through sharp to normalize format and strip metadata. This also
  // lets us reject corrupt files early.
  const out = await sharp(raw)
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();

  return { buf: out, ext: "jpg", contentType: "image/jpeg" };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function publicUrl(storagePath: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}
