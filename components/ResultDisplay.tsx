"use client";

import { useState, useMemo } from "react";
import ImageModal from "./ImageModal";
import ImageCarousel from "./ImageCarousel";
import ImageComparison from "./ImageComparison";
import QuoteModal from "./QuoteModal";
import type { GenerationResult } from "@/lib/types";

interface ResultDisplayProps {
  generationResults: GenerationResult[];
  originalImage: string | null;
  onReset: () => void;
  verifiedPhone: string | null;
  abVariant: string;
  onRetryGeneration: (slabId: string) => Promise<void>;
  materialLineId?: string | null;
  organizationId?: string | null;
}

type ViewMode = "carousel" | "compare";

export default function ResultDisplay({
  generationResults,
  originalImage,
  onReset,
  verifiedPhone,
  abVariant,
  onRetryGeneration,
  materialLineId,
  organizationId,
}: ResultDisplayProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageAlt, setSelectedImageAlt] = useState("");
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

  // Build images array: original first, then generated results
  const allImages = useMemo(() => {
    const images: Array<{
      id: string;
      name: string;
      imageUrl: string;
      isOriginal?: boolean;
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

    // Add generated results
    generationResults.forEach((result) => {
      if (result.imageData && !result.isLoading && !result.error) {
        images.push({
          id: result.slabId,
          name: result.slabName,
          imageUrl: `data:image/png;base64,${result.imageData}`,
        });
      }
    });

    return images;
  }, [originalImage, generationResults]);

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

  const openModal = (imageUrl: string, alt: string) => {
    setSelectedImage(imageUrl);
    setSelectedImageAlt(alt);
  };

  const closeModal = () => {
    setSelectedImage(null);
    setSelectedImageAlt("");
  };

  const handleGetQuote = (
    imageId: string,
    imageName: string,
    imageUrl: string
  ) => {
    // Find the result to get the slab ID
    const result = generationResults.find((r) => r.slabId === imageId);
    setSelectedForQuote({
      slabId: result?.slabId || imageId,
      slabName: imageName,
      imageUrl: imageUrl,
    });
    setShowLeadForm(true);
  };

  const handleRetry = async (imageId: string) => {
    await onRetryGeneration(imageId);
  };

  const allComplete = generationResults.every((r) => !r.isLoading);
  const hasCompletedImages = allImages.length > 0;

  return (
    <>
      <div className="card p-6 mb-8 animate-slide-up">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[var(--color-text)]">
              Your New Kitchens
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-1">
              {generationResults.length}{" "}
              {generationResults.length === 1 ? "variation" : "variations"}{" "}
              generated
            </p>
          </div>
          {allComplete && (
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
          )}
        </div>

        {/* View Mode Toggle */}
        {allComplete && hasCompletedImages && (
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
        {viewMode === "carousel" && hasCompletedImages && (
          <div className="mb-6">
            <ImageCarousel
              images={allImages}
              currentIndex={carouselIndex}
              onIndexChange={setCarouselIndex}
              onImageClick={openModal}
              onRetry={(imageId) => {
                if (imageId !== "original") {
                  handleRetry(imageId);
                }
              }}
              onGetQuote={(imageId, imageName, imageUrl) => {
                if (imageId !== "original") {
                  handleGetQuote(imageId, imageName, imageUrl);
                }
              }}
              onDownload={(imageId, imageName, imageUrl) => {
                if (imageId !== "original") {
                  // Find the result to get base64 data
                  const result = generationResults.find(
                    (r) => r.slabId === imageId
                  );
                  if (result?.imageData) {
                    handleDownload(result.imageData, imageName);
                  }
                }
              }}
            />
          </div>
        )}

        {/* Comparison View */}
        {viewMode === "compare" &&
          hasCompletedImages &&
          allImages.length >= 2 && (
            <div className="mb-6">
              <ImageComparison
                images={allImages}
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
              />
            </div>
          )}

        {/* Loading States */}
        {!allComplete && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            {generationResults.map((result) => (
              <div key={result.slabId} className="space-y-3">
                <h3 className="text-lg font-semibold text-[var(--color-text-secondary)] text-center">
                  {result.slabName}
                </h3>
                {result.isLoading && (
                  <div className="aspect-video bg-[var(--color-bg-secondary)] rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <svg
                        className="animate-spin h-8 w-8 text-[var(--color-accent)] mx-auto mb-2"
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
                      <p className="text-sm text-[var(--color-text-muted)]">
                        Generating...
                      </p>
                    </div>
                  </div>
                )}
                {result.error && (
                  <div className="aspect-video bg-red-50 rounded-lg flex items-center justify-center p-4">
                    <p className="text-sm text-red-600 text-center">
                      {result.error}
                    </p>
                  </div>
                )}
              </div>
            ))}
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
          verifiedPhone={verifiedPhone}
          abVariant={abVariant}
          materialLineId={materialLineId}
          organizationId={organizationId}
          onSubmitSuccess={() => setShowLeadForm(false)}
        />
      )}

      {/* Image Modal */}
      {selectedImage && (
        <ImageModal
          imageUrl={selectedImage}
          alt={selectedImageAlt}
          onClose={closeModal}
        />
      )}
    </>
  );
}
