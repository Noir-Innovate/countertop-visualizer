"use client";

import { useCallback, useState } from "react";
import { trackEvent } from "@/lib/posthog";

interface ImageUploadProps {
  onImageUpload: (base64Image: string) => void;
}

export default function ImageUpload({ onImageUpload }: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        onImageUpload(base64);
      };
      reader.onerror = () => {
        setError("Failed to read image file");
      };
      reader.readAsDataURL(file);
    },
    [onImageUpload]
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

  return (
    <div className="w-full">
      <label
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative flex flex-col items-center justify-center w-full h-64 
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

        <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
          {/* Upload Icon */}
          <div
            className={`
            w-16 h-16 mb-4 rounded-full flex items-center justify-center
            transition-colors duration-200
            ${
              isDragging
                ? "bg-[var(--color-accent)]/10"
                : "bg-[var(--color-bg-secondary)]"
            }
          `}
          >
            <svg
              className={`w-8 h-8 transition-colors duration-200 ${
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

          <p className="mb-2 text-lg font-semibold text-[var(--color-text)]">
            {isDragging ? "Drop your image here" : "Upload your kitchen photo"}
          </p>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Drag & drop or{" "}
            <span className="text-[var(--color-accent)] font-medium">
              click to browse
            </span>
          </p>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            PNG, JPG up to 25MB
          </p>
        </div>
      </label>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}
