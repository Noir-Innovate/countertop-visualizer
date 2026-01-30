"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Toaster } from "react-hot-toast";

interface Props {
  params: Promise<{ orgId: string; materialLineId: string }>;
}

interface MaterialFile {
  id: string; // Database material ID (UUID)
  name: string; // Filename
  title?: string | null;
  material_type?: string | null;
  order?: number;
}

interface FileWithMetadata {
  file: File;
  title: string;
  material_type: string;
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
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<FileWithMetadata[]>([]);
  const [editingMaterial, setEditingMaterial] = useState<MaterialFile | null>(
    null,
  );
  const [deletingMaterial, setDeletingMaterial] = useState<MaterialFile | null>(
    null,
  );
  const [showEditAllModal, setShowEditAllModal] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [isReordering, setIsReordering] = useState(false);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    fetchMaterials();
  }, [materialLineId, orgId]);

  // Helper function to generate title from filename
  const generateTitleFromFilename = (filename: string): string => {
    return filename
      .replace(/\.[^.]+$/, "") // Remove extension
      .replace(/[-_]/g, " ") // Replace dashes/underscores with spaces
      .replace(/\b\w/g, (c) => c.toUpperCase()); // Capitalize words
  };

  // Material type options
  const MATERIAL_TYPES = [
    { value: "none", label: "None" },
    { value: "Granite", label: "Granite" },
    { value: "Quartz", label: "Quartz" },
    { value: "Quartzite", label: "Quartzite" },
    { value: "Marble", label: "Marble" },
    { value: "Soapstone", label: "Soapstone" },
    { value: "Porcelain", label: "Porcelain" },
    { value: "Solid Surface", label: "Solid Surface" },
    { value: "Other", label: "Other" },
  ];

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
            file.name.match(/\.(jpg|jpeg|png|webp|gif|tif|tiff)$/i),
          ) || [];

        // Fetch material metadata from database, ordered by order field
        const { data: materialsData } = await supabase
          .from("materials")
          .select("id, filename, title, material_type, order")
          .eq("material_line_id", materialLineId)
          .order("order", { ascending: true });

        // Create a map of filename to metadata
        const materialsMap = new Map<
          string,
          {
            id: string;
            title: string | null;
            material_type: string | null;
            order: number;
          }
        >();
        if (materialsData) {
          materialsData.forEach((m) => {
            materialsMap.set(m.filename, {
              id: m.id,
              title: m.title,
              material_type: m.material_type,
              order: m.order,
            });
          });
        }

        // Combine storage files with database metadata
        const materialsWithMetadata: MaterialFile[] = materialFiles
          .map((file) => {
            const meta = materialsMap.get(file.name);
            return {
              id: meta?.id || file.id || file.name, // Use database ID if available
              name: file.name,
              title: meta?.title || null,
              material_type: meta?.material_type || null,
              order: meta?.order ?? 999999, // Put materials without order at the end
            };
          })
          // Sort by order from database
          .sort((a, b) => {
            if (a.order !== undefined && b.order !== undefined) {
              return a.order - b.order;
            }
            // Fallback to filename alphabetical if order is missing
            return a.name.localeCompare(b.name);
          });

        setMaterials(materialsWithMetadata);
        console.log(
          "Loaded materials:",
          materialsWithMetadata.length,
          "from folder:",
          mlData.supabase_folder,
        );
      }
    } catch (err) {
      setErrors(["An unexpected error occurred"]);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Validate files first
    const validFiles: File[] = [];
    const errors: string[] = [];
    const maxSize = 25 * 1024 * 1024; // 25MB
    const validExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".gif",
      ".tif",
      ".tiff",
    ];

    Array.from(files).forEach((file) => {
      // Validate file type
      const fileExtension = file.name
        .toLowerCase()
        .substring(file.name.lastIndexOf("."));
      if (!validExtensions.includes(fileExtension)) {
        errors.push(
          `Invalid file type: ${file.name}. Only JPG, PNG, WEBP, and GIF are allowed.`,
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

    if (errors.length > 0) {
      setErrors(errors);
      return;
    }

    // Prepare files with auto-generated title and default material type
    const filesWithMetadata: FileWithMetadata[] = validFiles.map((file) => ({
      file,
      title: generateTitleFromFilename(file.name),
      material_type: "none", // Default to none
    }));

    setPendingFiles(filesWithMetadata);
    setShowUploadModal(true);
  };

  const handleFileUpload = async () => {
    if (pendingFiles.length === 0) return;

    setUploading(true);
    setErrors([]);
    setShowUploadModal(false);

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

      const errors: string[] = [];

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

      // Get the maximum order value for this material line to assign order to new materials
      const { data: maxOrderData } = await supabase
        .from("materials")
        .select("order")
        .eq("material_line_id", materialLineId)
        .order("order", { ascending: false })
        .limit(1)
        .single();

      const maxOrder = maxOrderData?.order ?? 0;
      let currentOrder = maxOrder;

      // Upload files and create material records
      const uploadResults = await Promise.allSettled(
        pendingFiles.map(async ({ file, title, material_type }) => {
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
                `Bucket 'public-assets' not found. Please create it first or contact support.`,
              );
            }
            throw new Error(
              `Failed to upload ${file.name}: ${uploadError.message}`,
            );
          }

          // Increment order for this material
          currentOrder += 1;

          // Insert material record into database
          // Title is automatically generated from filename, material_type is optional
          const finalTitle =
            title.trim() || generateTitleFromFilename(file.name);
          const finalMaterialType =
            material_type === "none" || material_type === ""
              ? null
              : material_type;

          const { error: materialError } = await supabase
            .from("materials")
            .insert({
              material_line_id: materialLineId,
              filename: file.name,
              title: finalTitle,
              material_type: finalMaterialType,
              order: currentOrder,
            });

          if (materialError) {
            console.error(
              `Failed to create material record for ${file.name}:`,
              materialError,
            );
            // Don't throw - file was uploaded successfully, just metadata failed
          }

          return uploadData;
        }),
      );

      // Collect upload errors
      uploadResults.forEach((result, index) => {
        if (result.status === "rejected") {
          errors.push(
            result.reason?.message ||
              `Failed to upload ${pendingFiles[index]?.file.name || "file"}`,
          );
        }
      });

      // Show all errors if any
      if (errors.length > 0) {
        setErrors(errors);
      }

      // Refresh materials list if at least one file was uploaded successfully
      const successCount = uploadResults.filter(
        (r) => r.status === "fulfilled",
      ).length;
      if (successCount > 0) {
        await fetchMaterials();
      }

      // Clear pending files
      setPendingFiles([]);
    } catch (err) {
      setErrors([
        err instanceof Error ? err.message : "Failed to upload files",
      ]);
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateMaterial = async (
    material: MaterialFile,
    title: string,
    materialType: string,
  ) => {
    try {
      const supabase = createClient();

      // Fetch current material to get order value (handle errors gracefully)
      // Use the order from the material object if available, otherwise fetch it
      let currentOrder = material.order ?? 999999;

      // Only fetch if we don't have the order in the material object
      if (!material.order) {
        const { data: currentMaterial, error: fetchError } = await supabase
          .from("materials")
          .select("order")
          .eq("id", material.id)
          .eq("material_line_id", materialLineId)
          .single();

        if (!fetchError && currentMaterial?.order) {
          currentOrder = currentMaterial.order;
        } else if (fetchError) {
          // If fetch fails, use default order
          console.warn(
            "Failed to fetch current order, using default:",
            fetchError,
          );
          // Continue with default order
        }
      }

      // Prepare the update data (don't include id, material_line_id, or filename in update)
      const updateData: {
        title: string | null;
        material_type: string | null;
        order: number;
      } = {
        title: title.trim() || null,
        material_type:
          materialType === "none" || materialType === "" ? null : materialType,
        order: currentOrder,
      };

      // Use update instead of upsert since we're updating an existing record by ID
      const { error } = await supabase
        .from("materials")
        .update(updateData)
        .eq("id", material.id)
        .eq("material_line_id", materialLineId);

      if (error) {
        let errorMessage = "Failed to update material";
        if (error.message) {
          errorMessage = error.message;
        } else if (error.code) {
          errorMessage = `Update failed: ${error.code}`;
        }
        toast.error(errorMessage);
        setErrors([errorMessage]);
        return;
      }

      toast.success("Material updated successfully");
      await fetchMaterials();
      setEditingMaterial(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to update material";
      toast.error(errorMessage);
      setErrors([errorMessage]);
    }
  };

  const handleDeleteMaterial = async () => {
    if (!deletingMaterial || !materialLine) return;

    try {
      setUploading(true);
      setErrors([]);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrors(["You must be logged in"]);
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
        setErrors(["You do not have permission to delete materials"]);
        setUploading(false);
        return;
      }

      const filePath = `${materialLine.supabase_folder}/${deletingMaterial.name}`;

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("public-assets")
        .remove([filePath]);

      if (storageError) {
        setErrors([`Failed to delete file: ${storageError.message}`]);
        setUploading(false);
        return;
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from("materials")
        .delete()
        .eq("material_line_id", materialLineId)
        .eq("filename", deletingMaterial.name);

      if (dbError) {
        console.error("Failed to delete material record:", dbError);
        // Don't fail if DB delete fails - file is already deleted
      }

      // Reorder remaining materials to fill gaps (make order sequential: 1, 2, 3...)
      const { data: remainingMaterials } = await supabase
        .from("materials")
        .select("id")
        .eq("material_line_id", materialLineId)
        .order("order", { ascending: true });

      if (remainingMaterials && remainingMaterials.length > 0) {
        // Update order values to be sequential
        const updatePromises = remainingMaterials.map((material, index) => {
          return supabase
            .from("materials")
            .update({ order: index + 1 })
            .eq("id", material.id);
        });

        await Promise.all(updatePromises);
      }

      await fetchMaterials();
      setDeletingMaterial(null);
    } catch (err) {
      setErrors([
        err instanceof Error ? err.message : "Failed to delete material",
      ]);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!materialLine || materials.length === 0) return;

    try {
      setUploading(true);
      setErrors([]);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrors(["You must be logged in"]);
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
        setErrors(["You do not have permission to delete materials"]);
        setUploading(false);
        return;
      }

      // Prepare all file paths for deletion
      const filePaths = materials.map(
        (material) => `${materialLine.supabase_folder}/${material.name}`,
      );

      // Delete all files from storage
      const { error: storageError } = await supabase.storage
        .from("public-assets")
        .remove(filePaths);

      if (storageError) {
        setErrors([`Failed to delete files: ${storageError.message}`]);
        setUploading(false);
        return;
      }

      // Delete all records from database
      const { error: dbError } = await supabase
        .from("materials")
        .delete()
        .eq("material_line_id", materialLineId);

      if (dbError) {
        console.error("Failed to delete material records:", dbError);
        // Don't fail if DB delete fails - files are already deleted
      }

      await fetchMaterials();
      setShowDeleteAllModal(false);
    } catch (err) {
      setErrors([
        err instanceof Error ? err.message : "Failed to delete materials",
      ]);
    } finally {
      setUploading(false);
    }
  };

  const handleReorderMaterials = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = materials.findIndex((m) => m.id === active.id);
    const newIndex = materials.findIndex((m) => m.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Optimistically update the UI
    const newMaterials = arrayMove(materials, oldIndex, newIndex);
    setMaterials(newMaterials);
    setIsReordering(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        const errorMessage = "You must be logged in";
        toast.error(errorMessage);
        setErrors([errorMessage]);
        setIsReordering(false);
        await fetchMaterials(); // Revert on error
        return;
      }

      // Get material IDs in the new order (using database IDs)
      const materialIds = newMaterials.map((m) => m.id);

      // Call the reorder API
      const response = await fetch(
        `/api/material-lines/${materialLineId}/materials/reorder`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            materialIds: materialIds,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to reorder materials");
      }

      toast.success("Materials reordered successfully");
      // Refresh materials to ensure consistency
      await fetchMaterials();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to reorder materials";
      toast.error(errorMessage);
      setErrors([errorMessage]);
      // Revert to original order
      await fetchMaterials();
    } finally {
      setIsReordering(false);
    }
  };

  const handleEditAll = async (title: string, materialType: string) => {
    if (!materialLine || materials.length === 0) return;

    try {
      setUploading(true);
      setErrors([]);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrors(["You must be logged in"]);
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
        setErrors(["You do not have permission to edit materials"]);
        setUploading(false);
        return;
      }

      // Fetch current orders for all materials
      const { data: currentMaterials } = await supabase
        .from("materials")
        .select("id, filename, order")
        .eq("material_line_id", materialLineId)
        .in(
          "filename",
          materials.map((m) => m.name),
        );

      const orderMap = new Map(
        currentMaterials?.map((m) => [m.filename, m.order]) || [],
      );

      // Update all materials with the same title and material type
      const updates = materials.map((material) => ({
        id: material.id,
        material_line_id: materialLineId,
        filename: material.name,
        title: title.trim() || null,
        material_type:
          materialType === "none" || materialType === "" ? null : materialType,
        order: orderMap.get(material.name) ?? material.order ?? 999999,
      }));

      // Use upsert to update or create records
      const { error } = await supabase.from("materials").upsert(updates, {
        onConflict: "material_line_id,filename",
      });

      if (error) {
        setErrors([`Failed to update materials: ${error.message}`]);
        setUploading(false);
        return;
      }

      await fetchMaterials();
      setShowEditAllModal(false);
    } catch (err) {
      setErrors([
        err instanceof Error ? err.message : "Failed to update materials",
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
      handleFileSelect(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files);
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
    <>
      <Toaster position="top-right" />
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
              accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/tiff,image/tif"
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

        {/* Drag and Drop Zone - Only show if no materials exist */}
        {materials.length === 0 && (
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
              Drag and drop material images here, or click the upload button
              above
            </p>
            <p className="text-sm text-slate-500">
              Supported formats: JPG, PNG, WEBP, GIF, TIF, TIFF (max 25MB per
              file)
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
        ) : materials.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleReorderMaterials}
          >
            <SortableContext items={materials.map((m) => m.id)}>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {materials.map((material) => (
                  <SortableMaterialCard
                    key={material.id}
                    material={material}
                    isReordering={isReordering}
                    onEdit={() => setEditingMaterial(material)}
                    onDelete={() => setDeletingMaterial(material)}
                    getImageUrl={getImageUrl}
                    generateTitleFromFilename={generateTitleFromFilename}
                    isLocalDev={isLocalDev}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
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

        {/* Upload Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-slate-200">
                <h2 className="text-2xl font-bold text-slate-900">
                  Upload Materials
                </h2>
                <p className="text-slate-600 mt-1">
                  Add titles and material types for your materials (optional)
                </p>
              </div>
              <div className="p-6 space-y-6">
                {pendingFiles.map((fileWithMeta, index) => (
                  <div
                    key={index}
                    className="border border-slate-200 rounded-lg p-4"
                  >
                    <p className="text-sm font-medium text-slate-700 mb-3">
                      {fileWithMeta.file.name}
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Title{" "}
                          <span className="text-slate-400 text-xs">
                            (auto-generated)
                          </span>
                        </label>
                        <input
                          type="text"
                          value={fileWithMeta.title}
                          onChange={(e) => {
                            const updated = [...pendingFiles];
                            updated[index].title = e.target.value;
                            setPendingFiles(updated);
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                          placeholder="Enter material title"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Title will be saved automatically from filename if
                          left unchanged
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Material Type{" "}
                          <span className="text-slate-400 text-xs">
                            (optional)
                          </span>
                        </label>
                        <select
                          value={fileWithMeta.material_type}
                          onChange={(e) => {
                            const updated = [...pendingFiles];
                            updated[index].material_type = e.target.value;
                            setPendingFiles(updated);
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {MATERIAL_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setPendingFiles([]);
                  }}
                  className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFileUpload}
                  disabled={uploading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? "Uploading..." : "Upload"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Material Modal */}
        {editingMaterial && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
              <div className="p-6 border-b border-slate-200">
                <h2 className="text-2xl font-bold text-slate-900">
                  Edit Material
                </h2>
                <p className="text-slate-600 mt-1 text-sm">
                  {editingMaterial.name}
                </p>
              </div>
              <EditMaterialForm
                material={editingMaterial}
                materialTypes={MATERIAL_TYPES}
                onSave={(title, materialType) => {
                  handleUpdateMaterial(editingMaterial, title, materialType);
                }}
                onCancel={() => setEditingMaterial(null)}
              />
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deletingMaterial && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
              <div className="p-6 border-b border-slate-200">
                <h2 className="text-2xl font-bold text-slate-900">
                  Delete Material
                </h2>
                <p className="text-slate-600 mt-1">
                  Are you sure you want to delete this material? This action
                  cannot be undone.
                </p>
              </div>
              <div className="p-6">
                <div className="bg-slate-50 rounded-lg p-4 mb-4">
                  <p className="font-medium text-slate-900">
                    {deletingMaterial.title ||
                      generateTitleFromFilename(deletingMaterial.name)}
                  </p>
                  <p className="text-sm text-slate-600 mt-1">
                    {deletingMaterial.name}
                  </p>
                </div>
              </div>
              <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
                <button
                  onClick={() => setDeletingMaterial(null)}
                  disabled={uploading}
                  className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteMaterial}
                  disabled={uploading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit All Modal */}
        {showEditAllModal && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
              <div className="p-6 border-b border-slate-200">
                <h2 className="text-2xl font-bold text-slate-900">
                  Edit All Materials
                </h2>
                <p className="text-slate-600 mt-1 text-sm">
                  Apply the same title and material type to all{" "}
                  {materials.length} materials
                </p>
              </div>
              <EditAllForm
                materialTypes={MATERIAL_TYPES}
                onSave={(title, materialType) => {
                  handleEditAll(title, materialType);
                }}
                onCancel={() => setShowEditAllModal(false)}
                saving={uploading}
              />
            </div>
          </div>
        )}

        {/* Delete All Confirmation Modal */}
        {showDeleteAllModal && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
              <div className="p-6 border-b border-slate-200">
                <h2 className="text-2xl font-bold text-slate-900">
                  Delete All Materials
                </h2>
                <p className="text-slate-600 mt-1">
                  Are you sure you want to delete all {materials.length}{" "}
                  materials? This action cannot be undone.
                </p>
              </div>
              <div className="p-6">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <p className="font-medium text-red-900">
                    Warning: This will permanently delete all materials in this
                    material line.
                  </p>
                  <p className="text-sm text-red-700 mt-1">
                    All files and their metadata will be removed.
                  </p>
                </div>
              </div>
              <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteAllModal(false)}
                  disabled={uploading}
                  className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAll}
                  disabled={uploading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? "Deleting..." : "Delete All"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Sortable Material Card Component
function SortableMaterialCard({
  material,
  isReordering,
  onEdit,
  onDelete,
  getImageUrl,
  generateTitleFromFilename,
  isLocalDev,
}: {
  material: MaterialFile;
  isReordering: boolean;
  onEdit: () => void;
  onDelete: () => void;
  getImageUrl: (fileName: string) => string;
  generateTitleFromFilename: (filename: string) => string;
  isLocalDev: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: material.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const imageUrl = getImageUrl(material.name);
  const displayTitle =
    material.title || generateTitleFromFilename(material.name);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow group ${
        isDragging ? "z-50" : ""
      } ${isReordering ? "pointer-events-none" : ""}`}
    >
      <div className="aspect-[3/4] relative bg-slate-100 overflow-hidden">
        {isLocalDev ||
        imageUrl.includes("127.0.0.1") ||
        imageUrl.includes("localhost") ? (
          <img
            src={imageUrl}
            alt={displayTitle}
            className="w-full h-full object-cover"
            onError={(e) => {
              console.error("Image load error:", imageUrl);
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <Image
            src={imageUrl}
            alt={displayTitle}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
          />
        )}
        {/* Drag Handle - Always visible on mobile, hover on desktop */}
        <div
          {...attributes}
          {...listeners}
          className="absolute top-2 left-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-2 bg-white rounded-lg shadow-md hover:bg-slate-50 z-10"
          title="Drag to reorder"
        >
          <svg
            className="w-4 h-4 text-slate-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8h16M4 16h16"
            />
          </svg>
        </div>
        {/* Edit/Delete Buttons - Always visible on mobile, hover on desktop */}
        <div className="absolute top-2 right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex gap-2">
          <button
            onClick={onEdit}
            className="p-2 bg-white rounded-lg shadow-md hover:bg-slate-50 transition-colors"
            title="Edit material"
          >
            <svg
              className="w-4 h-4 text-slate-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-2 bg-white rounded-lg shadow-md hover:bg-red-50 transition-colors"
            title="Delete material"
          >
            <svg
              className="w-4 h-4 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p
            className="font-medium text-slate-900 truncate flex-1"
            title={displayTitle}
          >
            {displayTitle}
          </p>
          {material.material_type && (
            <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full whitespace-nowrap flex-shrink-0">
              {material.material_type}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-1">{material.name}</p>
      </div>
    </div>
  );
}

// Edit Material Form Component
function EditMaterialForm({
  material,
  materialTypes,
  onSave,
  onCancel,
}: {
  material: MaterialFile;
  materialTypes: Array<{ value: string; label: string }>;
  onSave: (title: string, materialType: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(material.title || "");
  const [materialType, setMaterialType] = useState(
    material.material_type || "none",
  );
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(title, materialType);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter material title"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Material Type
          </label>
          <select
            value={materialType}
            onChange={(e) => setMaterialType(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {materialTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

// Edit All Form Component
function EditAllForm({
  materialTypes,
  onSave,
  onCancel,
  saving,
}: {
  materialTypes: Array<{ value: string; label: string }>;
  onSave: (title: string, materialType: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState("");
  const [materialType, setMaterialType] = useState("none");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(title, materialType);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter title for all materials"
          />
          <p className="text-xs text-slate-500 mt-1">
            Leave empty to remove titles from all materials
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Material Type
          </label>
          <select
            value={materialType}
            onChange={(e) => setMaterialType(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {materialTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1">
            Select "None" to remove material type from all materials
          </p>
        </div>
      </div>
      <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save All"}
        </button>
      </div>
    </form>
  );
}
