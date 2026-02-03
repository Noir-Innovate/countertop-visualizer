"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { Toaster } from "react-hot-toast";
import { validateKitchenImage } from "@/lib/image-utils";
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

interface Props {
  params: Promise<{ orgId: string; materialLineId: string }>;
}

interface KitchenImage {
  id: string; // Database kitchen_images ID (UUID)
  filename: string;
  title: string | null;
  order: number;
  url: string;
}

const MAX_KITCHEN_IMAGES = 3;

export default function KitchenImagesPage({ params }: Props) {
  const { orgId, materialLineId } = use(params);
  const router = useRouter();
  const [kitchenImages, setKitchenImages] = useState<KitchenImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [materialLine, setMaterialLine] = useState<{
    name: string;
    supabase_folder: string;
  } | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [deletingImage, setDeletingImage] = useState<KitchenImage | null>(null);
  const [editingImage, setEditingImage] = useState<KitchenImage | null>(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    fetchKitchenImages();
  }, [materialLineId, orgId]);

  const fetchKitchenImages = async () => {
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
      const { data: mlData, error: mlError } = await supabase
        .from("material_lines")
        .select("name, supabase_folder")
        .eq("id", materialLineId)
        .single();

      if (mlError || !mlData) {
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

      // Fetch kitchen images from database
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

      const { data: kitchenImagesData, error: kitchenError } = await supabase
        .from("kitchen_images")
        .select("id, filename, title, order")
        .eq("material_line_id", materialLineId)
        .order("order", { ascending: true });

      if (kitchenError) {
        console.error("Error fetching kitchen images:", kitchenError);
        setKitchenImages([]);
      } else {
        const images: KitchenImage[] = (kitchenImagesData || []).map((img) => ({
          id: img.id,
          filename: img.filename,
          title: img.title,
          order: img.order,
          url: `${supabaseUrl}/storage/v1/object/public/public-assets/${mlData.supabase_folder}/kitchens/${img.filename}`,
        }));
        setKitchenImages(images);
      }
    } catch (err) {
      setErrors(["An unexpected error occurred"]);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Check if adding these files would exceed the limit
    const totalImages = kitchenImages.length + files.length;
    if (totalImages > MAX_KITCHEN_IMAGES) {
      setErrors([
        `Cannot upload ${files.length} image(s). Maximum of ${MAX_KITCHEN_IMAGES} kitchen images allowed. You currently have ${kitchenImages.length} image(s).`,
      ]);
      return;
    }

    setUploading(true);
    setErrors([]);
    setWarnings([]);

    const newErrors: string[] = [];
    const newWarnings: string[] = [];
    const filesToUpload: File[] = [];

    // Validate all files first
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const validation = await validateKitchenImage(file);

      if (!validation.isValid) {
        newErrors.push(`${file.name}: ${validation.errors.join(", ")}`);
      } else {
        filesToUpload.push(file);
        if (validation.warnings.length > 0) {
          newWarnings.push(`${file.name}: ${validation.warnings.join(", ")}`);
        }
      }
    }

    if (newErrors.length > 0) {
      setErrors(newErrors);
      setUploading(false);
      return;
    }

    if (newWarnings.length > 0) {
      setWarnings(newWarnings);
    }

    // Upload files
    await uploadKitchenImages(filesToUpload);
  };

  const uploadKitchenImages = async (files: File[]) => {
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
        setErrors(["You do not have permission to upload kitchen images"]);
        setUploading(false);
        return;
      }

      const uploadErrors: string[] = [];
      const uploadedFiles: Array<{ fileName: string; originalName: string }> =
        [];

      // Get the maximum order value for kitchen images
      const { data: maxOrderData } = await supabase
        .from("kitchen_images")
        .select("order")
        .eq("material_line_id", materialLineId)
        .order("order", { ascending: false })
        .limit(1)
        .single();

      const maxOrder = maxOrderData?.order ?? 0;
      let currentOrder = maxOrder;

      // Upload each file
      for (const file of files) {
        try {
          // Create unique filename with timestamp
          const timestamp = Date.now();
          const extension = file.name.split(".").pop();
          const fileName = `kitchen-${timestamp}.${extension}`;
          const filePath = `${materialLine.supabase_folder}/kitchens/${fileName}`;

          // Upload to Supabase storage
          const { error: uploadError } = await supabase.storage
            .from("public-assets")
            .upload(filePath, file, {
              cacheControl: "3600",
              upsert: false,
            });

          if (uploadError) {
            if (uploadError.message.includes("already exists")) {
              uploadErrors.push(`File ${file.name} already exists`);
            } else {
              uploadErrors.push(
                `Failed to upload ${file.name}: ${uploadError.message}`,
              );
            }
            continue;
          }

          // Increment order for this kitchen image
          currentOrder += 1;

          // Auto-generate title from original filename
          const autoTitle = file.name
            .replace(/\.[^.]+$/, "") // Remove extension
            .replace(/[-_]/g, " ") // Replace dashes/underscores with spaces
            .replace(/\b\w/g, (c) => c.toUpperCase()); // Capitalize words

          // Insert kitchen_images record into database
          const { error: dbError } = await supabase
            .from("kitchen_images")
            .insert({
              material_line_id: materialLineId,
              filename: fileName,
              title: autoTitle,
              order: currentOrder,
            });

          if (dbError) {
            console.error(
              `Failed to create kitchen image record for ${file.name}:`,
              dbError,
            );
            uploadErrors.push(
              `Failed to save ${file.name} metadata: ${dbError.message}`,
            );
            continue;
          }

          uploadedFiles.push({ fileName, originalName: file.name });
        } catch (err) {
          uploadErrors.push(
            `Failed to upload ${file.name}: ${err instanceof Error ? err.message : "Unknown error"}`,
          );
        }
      }

      // Show success message
      if (uploadedFiles.length > 0) {
        toast.success(
          `Successfully uploaded ${uploadedFiles.length} kitchen image(s)`,
        );
        await fetchKitchenImages();
      }

      if (uploadErrors.length > 0) {
        setErrors(uploadErrors);
      }
    } catch (err) {
      setErrors([
        err instanceof Error ? err.message : "Failed to upload kitchen images",
      ]);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = async () => {
    if (!deletingImage || !materialLine) return;

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

      // Verify user has permission
      const { data: membership } = await supabase
        .from("organization_members")
        .select("role")
        .eq("profile_id", user.id)
        .eq("organization_id", orgId)
        .in("role", ["owner", "admin"])
        .single();

      if (!membership) {
        setErrors(["You do not have permission to delete kitchen images"]);
        setUploading(false);
        return;
      }

      const filePath = `${materialLine.supabase_folder}/kitchens/${deletingImage.filename}`;

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("public-assets")
        .remove([filePath]);

      if (storageError) {
        setErrors([`Failed to delete file: ${storageError.message}`]);
        setUploading(false);
        return;
      }

      // Delete from kitchen_images table
      const { error: dbError } = await supabase
        .from("kitchen_images")
        .delete()
        .eq("id", deletingImage.id)
        .eq("material_line_id", materialLineId);

      if (dbError) {
        console.error("Failed to delete kitchen image record:", dbError);
        setErrors([`Failed to delete record: ${dbError.message}`]);
        setUploading(false);
        return;
      }

      toast.success("Kitchen image deleted successfully");
      await fetchKitchenImages();
      setDeletingImage(null);
    } catch (err) {
      setErrors([
        err instanceof Error ? err.message : "Failed to delete kitchen image",
      ]);
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateKitchenImage = async (
    image: KitchenImage,
    title: string,
  ) => {
    try {
      const supabase = createClient();

      const { error } = await supabase
        .from("kitchen_images")
        .update({ title: title.trim() || null })
        .eq("id", image.id)
        .eq("material_line_id", materialLineId);

      if (error) {
        toast.error(`Failed to update kitchen image: ${error.message}`);
        setErrors([error.message]);
        return;
      }

      toast.success("Kitchen image updated successfully");
      await fetchKitchenImages();
      setEditingImage(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to update kitchen image";
      toast.error(errorMessage);
      setErrors([errorMessage]);
    }
  };

  const handleReorderImages = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = kitchenImages.findIndex((img) => img.id === active.id);
    const newIndex = kitchenImages.findIndex((img) => img.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Optimistically update the UI
    const newImages = arrayMove(kitchenImages, oldIndex, newIndex);
    setKitchenImages(newImages);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error("You must be logged in");
        await fetchKitchenImages(); // Revert
        return;
      }

      // Update the database with new order
      const newOrder = newImages.map((img) => img.id);

      // Update order for each kitchen image
      const updatePromises = newImages.map((img, index) => {
        return supabase
          .from("kitchen_images")
          .update({ order: index + 1 })
          .eq("id", img.id);
      });

      await Promise.all(updatePromises);

      toast.success("Kitchen images reordered successfully");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to reorder kitchen images";
      toast.error(errorMessage);
      setErrors([errorMessage]);
      // Revert to original order
      await fetchKitchenImages();
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

  // Check if we're in local development
  const isLocalDev =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  const canUploadMore = kitchenImages.length < MAX_KITCHEN_IMAGES;

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
            <span>Kitchen Images</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-4 mb-1">
                <h1 className="text-3xl font-bold text-slate-900">
                  Kitchen Images
                </h1>
                {!loading && (
                  <div
                    className={`flex items-center gap-2 px-3 py-1 border rounded-lg ${
                      kitchenImages.length >= MAX_KITCHEN_IMAGES
                        ? "bg-green-50 border-green-200"
                        : "bg-blue-50 border-blue-200"
                    }`}
                  >
                    <svg
                      className={`w-5 h-5 ${
                        kitchenImages.length >= MAX_KITCHEN_IMAGES
                          ? "text-green-600"
                          : "text-blue-600"
                      }`}
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
                    <span
                      className={`font-semibold ${
                        kitchenImages.length >= MAX_KITCHEN_IMAGES
                          ? "text-green-700"
                          : "text-blue-700"
                      }`}
                    >
                      {kitchenImages.length} of {MAX_KITCHEN_IMAGES}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-slate-600 mt-1">
                Upload custom kitchen stock photos for your customers to use in
                Step 1 of the visualizer. Recommended aspect ratio: 16:9 (e.g.,
                1920x1080).
              </p>
            </div>
            {canUploadMore && (
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
                Upload Kitchen Image
              </label>
            )}
            <input
              id="file-upload"
              type="file"
              multiple
              accept="image/jpeg,image/jpg,image/png"
              onChange={handleFileInputChange}
              className="hidden"
              disabled={uploading || !canUploadMore}
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

        {warnings.length > 0 && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-yellow-700 font-semibold text-sm mb-2">
              {warnings.length === 1 ? "Warning" : "Warnings"}:
            </p>
            <ul className="list-disc list-inside space-y-1">
              {warnings.map((warning, index) => (
                <li key={index} className="text-yellow-700 text-sm">
                  {warning}
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
              Uploading kitchen images...
            </p>
          </div>
        )}

        {/* Drag and Drop Zone - Only show if can upload more and no images exist */}
        {kitchenImages.length === 0 && canUploadMore && (
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
              Drag and drop kitchen images here, or click the upload button
              above
            </p>
            <p className="text-sm text-slate-500">
              PNG, JPG up to 25MB • 16:9 aspect ratio recommended • Maximum{" "}
              {MAX_KITCHEN_IMAGES} images
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
        ) : kitchenImages.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleReorderImages}
          >
            <SortableContext items={kitchenImages.map((img) => img.id)}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {kitchenImages.map((image) => (
                  <SortableKitchenImageCard
                    key={image.id}
                    image={image}
                    onEdit={() => setEditingImage(image)}
                    onDelete={() => setDeletingImage(image)}
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
              No Kitchen Images Found
            </h2>
            <p className="text-slate-600 mb-4">
              Upload kitchen stock photos to provide custom options for your
              customers in Step 1 of the visualizer.
            </p>
          </div>
        )}

        {/* Edit Kitchen Image Modal */}
        {editingImage && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
              <div className="p-6 border-b border-slate-200">
                <h2 className="text-2xl font-bold text-slate-900">
                  Edit Kitchen Image
                </h2>
                <p className="text-slate-600 mt-1 text-sm">
                  {editingImage.filename}
                </p>
              </div>
              <EditKitchenImageForm
                image={editingImage}
                onSave={(title) => {
                  handleUpdateKitchenImage(editingImage, title);
                }}
                onCancel={() => setEditingImage(null)}
              />
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deletingImage && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
              <div className="p-6 border-b border-slate-200">
                <h2 className="text-2xl font-bold text-slate-900">
                  Delete Kitchen Image
                </h2>
                <p className="text-slate-600 mt-1">
                  Are you sure you want to delete this kitchen image? This
                  action cannot be undone.
                </p>
              </div>
              <div className="p-6">
                <div className="bg-slate-50 rounded-lg p-4 mb-4">
                  <div className="aspect-video relative rounded-lg overflow-hidden">
                    {isLocalDev ||
                    deletingImage.url.includes("127.0.0.1") ||
                    deletingImage.url.includes("localhost") ? (
                      <img
                        src={deletingImage.url}
                        alt="Kitchen to delete"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Image
                        src={deletingImage.url}
                        alt="Kitchen to delete"
                        fill
                        className="object-cover"
                      />
                    )}
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
                <button
                  onClick={() => setDeletingImage(null)}
                  disabled={uploading}
                  className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteImage}
                  disabled={uploading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Sortable Kitchen Image Card Component
function SortableKitchenImageCard({
  image,
  onEdit,
  onDelete,
  isLocalDev,
}: {
  image: KitchenImage;
  onEdit: () => void;
  onDelete: () => void;
  isLocalDev: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow group ${
        isDragging ? "z-50" : ""
      }`}
    >
      <div className="aspect-video relative bg-slate-100 overflow-hidden">
        {isLocalDev ||
        image.url.includes("127.0.0.1") ||
        image.url.includes("localhost") ? (
          <img
            src={image.url}
            alt="Kitchen"
            className="w-full h-full object-cover"
            onError={(e) => {
              console.error("Image load error:", image.url);
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <Image
            src={image.url}
            alt="Kitchen"
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        )}
        {/* Drag Handle */}
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
        {/* Edit/Delete Buttons */}
        <div className="absolute top-2 right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex gap-2">
          <button
            onClick={onEdit}
            className="p-2 bg-white rounded-lg shadow-md hover:bg-slate-50 transition-colors"
            title="Edit kitchen image"
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
            title="Delete kitchen image"
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
        <p className="font-medium text-slate-900 truncate">
          {image.title || "Untitled Kitchen"}
        </p>
        <p className="text-xs text-slate-400 truncate mt-1">{image.filename}</p>
      </div>
    </div>
  );
}

// Edit Kitchen Image Form Component
function EditKitchenImageForm({
  image,
  onSave,
  onCancel,
}: {
  image: KitchenImage;
  onSave: (title: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(image.title || "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(title);
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
            placeholder="Enter kitchen image title"
          />
          <p className="text-xs text-slate-500 mt-1">
            This title will be displayed in the visualizer when customers select
            a kitchen
          </p>
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
