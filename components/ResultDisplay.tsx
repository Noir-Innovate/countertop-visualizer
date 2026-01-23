"use client";

import { useState, useMemo } from "react";
import ImageModal from "./ImageModal";
import ImageCarousel from "./ImageCarousel";
import ImageComparison from "./ImageComparison";
import QuoteModal from "./QuoteModal";
import type { GenerationResult } from "@/lib/types";
import type { Slab } from "@/lib/types";

interface ResultDisplayProps {
  generationResults: GenerationResult[];
  allPersistedResults: GenerationResult[];
  selectedSlabs: Slab[];
  originalImage: string | null;
  onReset: () => void;
  verifiedPhone: string | null;
  abVariant: string;
  onVerificationUpdate?: (phone: string) => void;
}

type ViewMode = "carousel" | "compare";

export default function ResultDisplay({
  generationResults,
  allPersistedResults,
  selectedSlabs,
  originalImage,
  onReset,
  verifiedPhone,
  abVariant,
  onVerificationUpdate,
}: ResultDisplayProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(
    null
  );
  const [viewMode, setViewMode] = useState<ViewMode>("carousel");
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [compareLeftIndex, setCompareLeftIndex] = useState(0);
  const [compareRightIndex, setCompareRightIndex] = useState(1);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [selectedForQuote, setSelectedForQuote] = useState<{
    slabId: string | null;
    slabName: string | null;
    imageUrl: string | null;
  }>({ slabId: null, slabName: null, imageUrl: null });

  // Merge all results including loading states
  const allResults = useMemo(() => {
    const merged: GenerationResult[] = [];

    // Add all persisted results (completed)
    allPersistedResults.forEach((result) => {
      merged.push(result);
    });

    // Add loading states for selected slabs that aren't in persisted results yet
    selectedSlabs.forEach((slab) => {
      const existing = merged.find((r) => r.slabId === slab.id);
      if (!existing) {
        merged.push({
          slabId: slab.id,
          slabName: slab.name,
          imageData: null,
          isLoading: true,
          error: null,
        });
      }
    });

    // Update with current generation results (may include loading or completed)
    generationResults.forEach((result) => {
      const index = merged.findIndex((r) => r.slabId === result.slabId);
      if (index >= 0) {
        merged[index] = result; // Update existing
      } else {
        merged.push(result); // Add new
      }
    });

    return merged;
  }, [allPersistedResults, selectedSlabs, generationResults]);

  // Build images array: original first, then all results (including loading)
  const allImages = useMemo(() => {
    const images: Array<{
      id: string;
      name: string;
      imageUrl: string;
      isOriginal?: boolean;
      isLoading?: boolean;
    }> = [];

    // Add original as first image
    if (originalImage) {
      images.push({
        id: "original",
        name: "Original Kitchen",
        imageUrl: originalImage,
        isOriginal: true,
      });
    }

    // Add all results (completed and loading)
    allResults.forEach((result) => {
      if (result.isLoading) {
        // Add loading placeholder
        images.push({
          id: result.slabId,
          name: result.slabName,
          imageUrl: "", // Empty for loading state
          isLoading: true,
        });
      } else if (result.imageData && !result.error) {
        // Add completed result
        images.push({
          id: result.slabId,
          name: result.slabName,
          imageUrl: `data:image/png;base64,${result.imageData}`,
        });
      }
    });

    return images;
  }, [originalImage, allResults]);

  // Initialize compare indices when switching to compare mode
  const handleSwitchToCompare = () => {
    setViewMode("compare");
    if (allImages.length > 1) {
      setCompareLeftIndex(0);
      setCompareRightIndex(Math.min(1, allImages.length - 1));
    }
  };

  const handleDownload = (imageData: string, slabName: string) => {
    const link = document.createElement("a");
    link.href = `data:image/png;base64,${imageData}`;
    link.download = `countertop-${slabName
      .toLowerCase()
      .replace(/\s+/g, "-")}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openModal = (imageUrl: string, alt: string, imageIndex: number) => {
    setSelectedImageIndex(imageIndex);
  };

  const closeModal = () => {
    setSelectedImageIndex(null);
  };

  const handleGetQuote = (
    imageId: string,
    imageName: string,
    imageUrl: string
  ) => {
    // Find the result to get the slab ID
    const result = allResults.find((r) => r.slabId === imageId);
    setSelectedForQuote({
      slabId: result?.slabId || imageId,
      slabName: imageName,
      imageUrl: imageUrl,
    });
    setShowLeadForm(true);
  };

  const allComplete = allResults.every((r) => !r.isLoading);
  const hasCompletedImages = allResults.some(
    (r) => r.imageData && !r.isLoading && !r.error
  );
  const hasAnyResults = allResults.length > 0;

  return (
    <>
      <div className="card p-6 mb-8 animate-slide-up">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[var(--color-text)]">
              Your New Kitchens
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-1">
              {
                allResults.filter(
                  (r) => r.imageData && !r.isLoading && !r.error
                ).length
              }{" "}
              {allResults.filter((r) => r.imageData && !r.isLoading && !r.error)
                .length === 1
                ? "variation"
                : "variations"}{" "}
              generated
            </p>
          </div>
          <button
            onClick={onReset}
            className="px-4 py-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] font-medium transition-colors flex items-center gap-2"
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
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Try Another
          </button>
        </div>

        {/* View Mode Toggle */}
        {hasAnyResults && (
          <div className="flex gap-2 justify-center mb-6">
            <button
              onClick={() => setViewMode("carousel")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === "carousel"
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
              }`}
            >
              Carousel
            </button>
            <button
              onClick={handleSwitchToCompare}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === "compare"
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
              }`}
            >
              Compare
            </button>
          </div>
        )}

        {/* Carousel View */}
        {viewMode === "carousel" && hasAnyResults && (
          <div className="mb-6 -mx-6 md:mx-0 overflow-hidden">
            <ImageCarousel
              images={allImages}
              allResults={allResults}
              currentIndex={carouselIndex}
              onIndexChange={setCarouselIndex}
              onImageClick={openModal}
              onGetQuote={(imageId, imageName, imageUrl) => {
                if (imageId !== "original") {
                  handleGetQuote(imageId, imageName, imageUrl);
                }
              }}
              onDownload={(imageId, imageName, imageUrl) => {
                if (imageId !== "original") {
                  // Find the result to get base64 data
                  const result = allResults.find((r) => r.slabId === imageId);
                  if (result?.imageData) {
                    handleDownload(result.imageData, imageName);
                  }
                }
              }}
            />
          </div>
        )}

        {/* Comparison View */}
        {viewMode === "compare" && hasAnyResults && allImages.length >= 2 && (
          <div className="mb-6 -mx-6 md:mx-0 overflow-hidden">
            <ImageComparison
              images={allImages}
              allResults={allResults}
              leftIndex={compareLeftIndex}
              rightIndex={compareRightIndex}
              onLeftIndexChange={setCompareLeftIndex}
              onRightIndexChange={setCompareRightIndex}
              onImageClick={openModal}
              onGetQuote={(imageId, imageName, imageUrl) => {
                if (imageId !== "original") {
                  handleGetQuote(imageId, imageName, imageUrl);
                }
              }}
              onDownload={(imageId, imageName, imageUrl) => {
                if (imageId !== "original") {
                  // Find the result to get base64 data
                  const result = allResults.find((r) => r.slabId === imageId);
                  if (result?.imageData) {
                    handleDownload(result.imageData, imageName);
                  }
                }
              }}
            />
          </div>
        )}
      </div>

      {/* Quote Modal */}
      {showLeadForm && (
        <QuoteModal
          isOpen={showLeadForm}
          onClose={() => setShowLeadForm(false)}
          selectedSlabId={selectedForQuote.slabId}
          selectedSlabName={selectedForQuote.slabName}
          selectedImageUrl={selectedForQuote.imageUrl}
          originalImageUrl={originalImage}
          verifiedPhone={verifiedPhone}
          abVariant={abVariant}
          onSubmitSuccess={() => setShowLeadForm(false)}
          onVerificationUpdate={onVerificationUpdate}
        />
      )}

      {/* Image Modal */}
      {selectedImageIndex !== null && (
        <ImageModal
          images={allImages}
          currentIndex={selectedImageIndex}
          onIndexChange={setSelectedImageIndex}
          onClose={closeModal}
          onGetQuote={(imageId, imageName, imageUrl) => {
            if (imageId !== "original") {
              closeModal();
              handleGetQuote(imageId, imageName, imageUrl);
            }
          }}
          onDownload={(imageId, imageName, imageUrl) => {
            if (imageId !== "original") {
              // Find the result to get base64 data
              const result = allResults.find((r) => r.slabId === imageId);
              if (result?.imageData) {
                handleDownload(result.imageData, imageName);
              }
            }
          }}
        />
      )}
    </>
  );
}
