"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { trackEvent } from "@/lib/posthog";
import { EXAMPLE_KITCHENS, type ExampleKitchen } from "@/lib/types";

interface KitchenSelectorProps {
  onKitchenSelect: (base64Image: string, isExample?: boolean) => void;
  exampleKitchens?: ExampleKitchen[];
}

export default function KitchenSelector({
  onKitchenSelect,
  exampleKitchens = EXAMPLE_KITCHENS,
}: KitchenSelectorProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingExampleId, setLoadingExampleId] = useState<string | null>(null);

  const processFile = useCallback(
    (file: File) => {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        setError("Please upload an image file");
        return;
      }

      // Validate file size (max 25MB)
      if (file.size > 25 * 1024 * 1024) {
        setError("Image must be less than 25MB");
        return;
      }

      setError(null);

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        trackEvent("image_uploaded", {
          fileSize: file.size,
          fileType: file.type,
        });
        onKitchenSelect(base64, false);
      };
      reader.onerror = () => {
        setError("Failed to read image file");
      };
      reader.readAsDataURL(file);
    },
    [onKitchenSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        processFile(files[0]);
      }
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        processFile(files[0]);
      }
    },
    [processFile]
  );

  const handleExampleSelect = useCallback(
    async (kitchen: ExampleKitchen) => {
      setLoadingExampleId(kitchen.id);
      setError(null);

      try {
        // Fetch the example image and convert to base64
        const response = await fetch(kitchen.imageUrl);
        if (!response.ok) {
          throw new Error("Failed to load example image");
        }
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          trackEvent("example_kitchen_selected", {
            kitchenId: kitchen.id,
            kitchenName: kitchen.name,
          });
          onKitchenSelect(base64, true);
          setLoadingExampleId(null);
        };
        reader.onerror = () => {
          setError("Failed to load example image");
          setLoadingExampleId(null);
        };
        reader.readAsDataURL(blob);
      } catch {
        setError("Failed to load example image. Please try uploading your own.");
        setLoadingExampleId(null);
      }
    },
    [onKitchenSelect]
  );

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      {/* Upload Section */}
      <div>
        <label
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            relative flex flex-col items-center justify-center w-full h-48 md:h-56
            border-2 border-dashed rounded-xl cursor-pointer
            transition-all duration-200
            ${
              isDragging
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
                : "border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-secondary)]"
            }
          `}
        >
          <input
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />

          <div className="flex flex-col items-center justify-center px-4 text-center">
            {/* Upload Icon */}
            <div
              className={`
              w-14 h-14 mb-3 rounded-full flex items-center justify-center
              transition-colors duration-200
              ${
                isDragging
                  ? "bg-[var(--color-accent)]/10"
                  : "bg-[var(--color-bg-secondary)]"
              }
            `}
            >
              <svg
                className={`w-7 h-7 transition-colors duration-200 ${
                  isDragging
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-text-secondary)]"
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
            </div>

            <p className="mb-1 text-lg font-semibold text-[var(--color-text)]">
              {isDragging ? "Drop your image here" : "Upload your kitchen photo"}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Drag & drop or{" "}
              <span className="text-[var(--color-accent)] font-medium">
                click to browse
              </span>
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              PNG, JPG up to 25MB
            </p>
          </div>
        </label>
      </div>

      {/* Divider */}
      {exampleKitchens.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-[var(--color-border)]" />
          <span className="text-sm font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
            Or choose one of ours
          </span>
          <div className="flex-1 h-px bg-[var(--color-border)]" />
        </div>
      )}

      {/* Example Kitchens Grid */}
      {exampleKitchens.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {exampleKitchens.map((kitchen) => (
            <button
              key={kitchen.id}
              onClick={() => handleExampleSelect(kitchen)}
              disabled={loadingExampleId !== null}
              className={`
                group relative aspect-video rounded-xl overflow-hidden
                border-2 border-[var(--color-border)]
                transition-all duration-200
                ${
                  loadingExampleId === kitchen.id
                    ? "opacity-75"
                    : loadingExampleId !== null
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:border-[var(--color-accent)] hover:shadow-lg"
                }
              `}
            >
              <Image
                src={kitchen.thumbnailUrl || kitchen.imageUrl}
                alt={kitchen.name}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                onError={(e) => {
                  // Hide broken images
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              
              {/* Overlay with name */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-3">
                <span className="text-white font-medium text-sm">
                  {kitchen.name}
                </span>
              </div>

              {/* Loading indicator */}
              {loadingExampleId === kitchen.id && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <svg
                    className="animate-spin h-8 w-8 text-white"
                    viewBox="0 0 24 24"
                  >
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
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600 text-center">{error}</p>
        </div>
      )}
    </div>
  );
}
