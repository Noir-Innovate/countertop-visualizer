"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

interface Props {
  params: Promise<{ orgId: string; materialLineId: string }>;
}

interface MaterialFile {
  id: string;
  name: string;
}

export default function MaterialsPage({ params }: Props) {
  const { orgId, materialLineId } = use(params);
  const router = useRouter();
  const [materials, setMaterials] = useState<MaterialFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [materialLine, setMaterialLine] = useState<{
    name: string;
    supabase_folder: string;
  } | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    fetchMaterials();
  }, [materialLineId, orgId]);

  const fetchMaterials = async () => {
    setLoading(true);
    setErrors([]);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/dashboard/login");
        return;
      }

      // Fetch material line
      const { data: mlData } = await supabase
        .from("material_lines")
        .select("name, supabase_folder")
        .eq("id", materialLineId)
        .single();

      if (!mlData) {
        setErrors(["Material line not found"]);
        setLoading(false);
        return;
      }

      setMaterialLine(mlData);

      // Fetch organization name
      const { data: orgData } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", orgId)
        .single();

      if (orgData) {
        setOrgName(orgData.name);
      }

      // List files from Supabase storage
      const { data: files, error: storageError } = await supabase.storage
        .from("public-assets")
        .list(mlData.supabase_folder);

      if (storageError) {
        setErrors(["Failed to load materials: " + storageError.message]);
        console.error("Storage error:", storageError);
      } else {
        const materialFiles =
          files?.filter((file) =>
            file.name.match(/\.(jpg|jpeg|png|webp|gif)$/i)
          ) || [];
        setMaterials(materialFiles);
        console.log(
          "Loaded materials:",
          materialFiles.length,
          "from folder:",
          mlData.supabase_folder
        );
      }
    } catch (err) {
      setErrors(["An unexpected error occurred"]);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    setErrors([]);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrors(["You must be logged in"]);
        setUploading(false);
        return;
      }

      if (!materialLine) {
        setErrors(["Material line not found"]);
        setUploading(false);
        return;
      }

      // Verify user has permission (owner/admin of org)
      const { data: membership } = await supabase
        .from("organization_members")
        .select("role")
        .eq("profile_id", user.id)
        .eq("organization_id", orgId)
        .in("role", ["owner", "admin"])
        .single();

      if (!membership) {
        setErrors(["You do not have permission to upload materials"]);
        setUploading(false);
        return;
      }

      // First, validate all files and collect errors
      const validFiles: File[] = [];
      const errors: string[] = [];
      const maxSize = 25 * 1024 * 1024; // 25MB
      const validExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

      Array.from(files).forEach((file) => {
        // Validate file type
        const fileExtension = file.name
          .toLowerCase()
          .substring(file.name.lastIndexOf("."));
        if (!validExtensions.includes(fileExtension)) {
          errors.push(
            `Invalid file type: ${file.name}. Only JPG, PNG, WEBP, and GIF are allowed.`
          );
          return;
        }

        // Validate file size
        if (file.size > maxSize) {
          errors.push(`File ${file.name} exceeds 25MB limit`);
          return;
        }

        validFiles.push(file);
      });

      // Ensure bucket exists before uploading
      try {
        const bucketCheckResponse = await fetch("/api/storage/create-bucket", {
          method: "POST",
        });
        if (!bucketCheckResponse.ok) {
          const bucketError = await bucketCheckResponse.json();
          console.warn("Bucket check failed:", bucketError);
          // Continue anyway - bucket might exist
        }
      } catch (bucketErr) {
        console.warn("Failed to check/create bucket:", bucketErr);
        // Continue anyway - bucket might exist
      }

      // Upload valid files
      const uploadResults = await Promise.allSettled(
        validFiles.map(async (file) => {
          // Upload directly to Supabase storage
          // Folder structure: {org-slug}/{material-line-slug}/{filename}
          const filePath = `${materialLine.supabase_folder}/${file.name}`;

          const { data: uploadData, error: uploadError } =
            await supabase.storage
              .from("public-assets")
              .upload(filePath, file, {
                cacheControl: "3600",
                upsert: false, // Don't overwrite existing files
              });

          if (uploadError) {
            if (uploadError.message.includes("already exists")) {
              throw new Error(`File ${file.name} already exists`);
            }
            if (uploadError.message.includes("Bucket not found")) {
              throw new Error(
                `Bucket 'public-assets' not found. Please create it first or contact support.`
              );
            }
            throw new Error(
              `Failed to upload ${file.name}: ${uploadError.message}`
            );
          }

          return uploadData;
        })
      );

      // Collect upload errors
      uploadResults.forEach((result, index) => {
        if (result.status === "rejected") {
          errors.push(
            result.reason?.message ||
              `Failed to upload ${validFiles[index]?.name || "file"}`
          );
        }
      });

      // Show all errors if any
      if (errors.length > 0) {
        setErrors(errors);
      }

      // Refresh materials list if at least one file was uploaded successfully
      const successCount = uploadResults.filter(
        (r) => r.status === "fulfilled"
      ).length;
      if (successCount > 0) {
        await fetchMaterials();
      }
    } catch (err) {
      setErrors([
        err instanceof Error ? err.message : "Failed to upload files",
      ]);
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files);
    }
  };

  // Helper function to get public URL for an image
  const getImageUrl = (fileName: string): string => {
    if (!materialLine?.supabase_folder) return "";
    const supabase = createClient();
    const { data } = supabase.storage
      .from("public-assets")
      .getPublicUrl(`${materialLine.supabase_folder}/${fileName}`);
    return data.publicUrl;
  };

  // Check if we're in local development
  const isLocalDev =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

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
            {orgName || "Organization"}
          </Link>
          <span>/</span>
          <Link
            href={`/dashboard/organizations/${orgId}/material-lines/${materialLineId}`}
            className="hover:text-slate-700"
          >
            {materialLine?.name || "Material Line"}
          </Link>
          <span>/</span>
          <span>Materials</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-4 mb-1">
              <h1 className="text-3xl font-bold text-slate-900">
                Material Inventory
              </h1>
              {!loading && (
                <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg">
                  <svg
                    className="w-5 h-5 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="text-blue-700 font-semibold">
                    {materials.length}{" "}
                    {materials.length === 1 ? "material" : "materials"}
                  </span>
                </div>
              )}
            </div>
            <p className="text-slate-600 mt-1">
              {materialLine && (
                <>
                  Showing materials from folder:{" "}
                  <code className="px-2 py-1 bg-slate-100 rounded text-sm">
                    {materialLine.supabase_folder}
                  </code>
                </>
              )}
            </p>
          </div>
          <label
            htmlFor="file-upload"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Upload Materials
          </label>
          <input
            id="file-upload"
            type="file"
            multiple
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
            onChange={handleFileInputChange}
            className="hidden"
            disabled={uploading}
          />
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 font-semibold text-sm mb-2">
            {errors.length === 1 ? "Error" : "Errors"}:
          </p>
          <ul className="list-disc list-inside space-y-1">
            {errors.map((error, index) => (
              <li key={index} className="text-red-700 text-sm">
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {uploading && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-700 text-sm flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Uploading materials...
          </p>
        </div>
      )}

      {/* Drag and Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`mb-6 p-12 border-2 border-dashed rounded-xl text-center transition-colors ${
          dragActive
            ? "border-blue-500 bg-blue-50"
            : "border-slate-300 bg-slate-50 hover:border-slate-400"
        }`}
      >
        <svg
          className="w-12 h-12 text-slate-400 mx-auto mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className="text-slate-600 mb-2">
          Drag and drop material images here, or click the upload button above
        </p>
        <p className="text-sm text-slate-500">
          Supported formats: JPG, PNG, WEBP, GIF (max 25MB per file)
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
        </div>
      ) : materials.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {materials.map((material) => {
            const imageUrl = getImageUrl(material.name);
            const materialName = material.name
              .replace(/\.[^.]+$/, "") // Remove extension
              .replace(/[-_]/g, " ") // Replace dashes/underscores with spaces
              .replace(/\b\w/g, (c) => c.toUpperCase()); // Capitalize words

            return (
              <div
                key={material.id}
                className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="aspect-[3/4] relative bg-slate-100 overflow-hidden">
                  {isLocalDev ||
                  imageUrl.includes("127.0.0.1") ||
                  imageUrl.includes("localhost") ? (
                    // Use regular img tag for local development to avoid Next.js image optimization issues
                    <img
                      src={imageUrl}
                      alt={materialName}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        console.error("Image load error:", imageUrl);
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <Image
                      src={imageUrl}
                      alt={materialName}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                    />
                  )}
                </div>
                <div className="p-4">
                  <p
                    className="font-medium text-slate-900 truncate"
                    title={materialName}
                  >
                    {materialName}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{material.name}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            No Materials Found
          </h2>
          <p className="text-slate-600 mb-4">
            Upload material images to get started. Images will be stored in:
            <br />
            <code className="px-2 py-1 bg-slate-100 rounded text-sm mt-2 inline-block">
              public-assets/{materialLine?.supabase_folder}/
            </code>
          </p>
        </div>
      )}
    </div>
  );
}
