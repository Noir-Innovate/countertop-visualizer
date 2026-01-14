"use client";

import { useState, useEffect, useCallback } from "react";
import imageCompression from "browser-image-compression";
import ImageUpload from "@/components/ImageUpload";
import SlabSelector from "@/components/SlabSelector";
import ResultDisplay from "@/components/ResultDisplay";
import ThemeDebug from "@/components/ThemeDebug";
import { trackEvent, trackABEvent } from "@/lib/posthog";
import {
  getABVariant,
  getVerifiedPhone,
  type ABVariant,
} from "@/lib/ab-testing";
import {
  SLABS,
  EXAMPLE_SLABS,
  type Slab,
  type GenerationResult,
} from "@/lib/types";
import { useMaterialLine } from "@/lib/material-line";
import { getSlabsForMaterialLine } from "@/lib/slabs";
import posthog from "posthog-js";

export default function Home() {
  const materialLine = useMaterialLine();
  const [kitchenImage, setKitchenImage] = useState<string | null>(null);
  const [selectedSlabs, setSelectedSlabs] = useState<Slab[]>([]);
  const [generationResults, setGenerationResults] = useState<
    GenerationResult[]
  >([]);
  const [persistedResults, setPersistedResults] = useState<GenerationResult[]>(
    []
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

  // Dynamic slabs state
  const [dynamicSlabs, setDynamicSlabs] = useState<Slab[]>([]);
  const [slabsLoading, setSlabsLoading] = useState(true);

  // AB Testing state
  const [abVariant, setAbVariant] = useState<ABVariant>("A");
  const [verifiedPhone, setVerifiedPhoneState] = useState<string | null>(null);

  // Load slabs dynamically based on material line context
  useEffect(() => {
    const loadSlabs = async () => {
      // If it's an example (no material line or default), use example slabs
      if (!materialLine || materialLine.id === "default") {
        setDynamicSlabs(EXAMPLE_SLABS);
        setSlabsLoading(false);
        return;
      }

      if (
        materialLine &&
        materialLine.supabaseFolder &&
        materialLine.id !== "default"
      ) {
        setSlabsLoading(true);
        try {
          const slabs = await getSlabsForMaterialLine(
            materialLine.supabaseFolder
          );
          if (slabs.length > 0) {
            setDynamicSlabs(slabs);
          } else {
            // Fall back to default slabs if none found
            setDynamicSlabs(SLABS);
          }
        } catch (error) {
          console.error("Failed to load slabs:", error);
          setDynamicSlabs(SLABS);
        }
        setSlabsLoading(false);
      } else {
        // Use default slabs for localhost/development
        setDynamicSlabs(SLABS);
        setSlabsLoading(false);
      }
    };
    loadSlabs();
  }, [materialLine]);

  // Initialize AB variant on mount
  useEffect(() => {
    const variant = getABVariant();
    setAbVariant(variant);
    setVerifiedPhoneState(getVerifiedPhone());

    trackABEvent(variant, "page_view");

    // Track page view with material line context
    if (materialLine && typeof window !== "undefined") {
      posthog.capture("page_view", {
        materialLineId: materialLine.id,
        organizationId: materialLine.organizationId,
        url: window.location.href,
        referrer: document.referrer,
        userAgent: navigator.userAgent,
      });
    }
  }, [materialLine]);

  // Listen for localStorage changes to sync verification state (cross-tab sync)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "verified_phone") {
        setVerifiedPhoneState(e.newValue);
      }
    };

    // Listen for storage events (from other tabs/windows)
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  // Handle verification updates from child components
  const handleVerificationUpdate = (phone: string) => {
    setVerifiedPhoneState(phone);
  };

  // Determine if we're showing an example (no material line or default)
  const isExample = !materialLine || materialLine.id === "default";

  // Use dynamic slabs if available, otherwise fall back to default
  // For examples, use OLD_SLABS (from public/slabs), otherwise use dynamic or default SLABS
  const allSlabs = isExample
    ? EXAMPLE_SLABS
    : dynamicSlabs.length > 0
    ? dynamicSlabs
    : SLABS;

  const handleImageUpload = (base64Image: string) => {
    // If changing the kitchen image, clear all persisted results
    if (kitchenImage && kitchenImage !== base64Image) {
      setPersistedResults([]);
    }
    setKitchenImage(base64Image);
    setGenerationResults([]);
    setShowResults(false);
    setError(null);
    trackABEvent(abVariant, "image_uploaded");
  };

  const handleSlabSelect = (slab: Slab) => {
    setSelectedSlabs((prev) => {
      if (prev.find((s) => s.id === slab.id)) {
        return prev.filter((s) => s.id !== slab.id);
      } else if (prev.length < 3) {
        return [...prev, slab];
      }
      return prev;
    });

    // Track only when adding a new slab (not removing)
    const wasSelected = selectedSlabs.find((s) => s.id === slab.id);
    if (!wasSelected && selectedSlabs.length < 3) {
      trackABEvent(abVariant, "slab_selected", { slabId: slab.id });
      // Track with material line context
      if (materialLine && typeof window !== "undefined") {
        posthog.capture("slab_selected", {
          slabId: slab.id,
          slabName: slab.name,
          materialLineId: materialLine.id,
          organizationId: materialLine.organizationId,
        });
      }
    }

    setError(null);
  };

  const compressImage = async (base64Image: string): Promise<string> => {
    try {
      const response = await fetch(base64Image);
      const blob = await response.blob();

      const options = {
        maxSizeMB: 25,
        maxWidthOrHeight: 2560,
        useWebWorker: true,
        fileType: "image/jpeg" as const,
        initialQuality: 0.9,
      };

      const compressedBlob = await imageCompression(blob as File, options);

      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(compressedBlob);
      });
    } catch (error) {
      console.error("Compression error:", error);
      return base64Image;
    }
  };

  const generateSingleImage = useCallback(
    async (
      slab: Slab,
      compressedKitchenImage: string
    ): Promise<GenerationResult> => {
      try {
        // Fetch and compress slab image
        const slabImageResponse = await fetch(slab.imageUrl);
        const slabBlob = await slabImageResponse.blob();
        const slabBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(slabBlob);
        });

        const compressedSlabImage = await compressImage(slabBase64);

        const response = await fetch("/api/generate-countertop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kitchenImage: compressedKitchenImage,
            slabImage: compressedSlabImage,
            slabId: slab.id,
            slabName: slab.name,
            slabDescription: slab.description,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to generate image");
        }

        const data = await response.json();
        return {
          slabId: slab.id,
          slabName: slab.name,
          imageData: data.imageData,
          isLoading: false,
          error: null,
        };
      } catch (err) {
        return {
          slabId: slab.id,
          slabName: slab.name,
          imageData: null,
          isLoading: false,
          error: err instanceof Error ? err.message : "An error occurred",
        };
      }
    },
    []
  );

  const handleGenerate = async () => {
    if (!kitchenImage) {
      setError("Please upload a kitchen image");
      return;
    }
    if (selectedSlabs.length === 0 && persistedResults.length === 0) {
      setError("Please select at least one slab to visualize");
      return;
    }

    // If no new selections but there are persisted results, show them
    if (selectedSlabs.length === 0 && persistedResults.length > 0) {
      setShowResults(true);
      return;
    }

    // Show results display immediately with loading states
    setShowResults(true);
    setIsGenerating(true);
    setError(null);
    trackABEvent(abVariant, "generation_started", {
      slabCount: selectedSlabs.length,
    });

    // Track with material line context
    if (materialLine && typeof window !== "undefined") {
      posthog.capture("generation_started", {
        slabCount: selectedSlabs.length,
        slabIds: selectedSlabs.map((s) => s.id),
        materialLineId: materialLine.id,
        organizationId: materialLine.organizationId,
      });
    }

    // Initialize results with loading states
    const initialResults: GenerationResult[] = selectedSlabs.map((slab) => ({
      slabId: slab.id,
      slabName: slab.name,
      imageData: null,
      isLoading: true,
      error: null,
    }));
    setGenerationResults(initialResults);

    try {
      const compressedKitchenImage = await compressImage(kitchenImage);

      const results = await Promise.all(
        selectedSlabs.map((slab) =>
          generateSingleImage(slab, compressedKitchenImage)
        )
      );

      setGenerationResults(results);

      // Merge results into persistedResults
      setPersistedResults((prev) => {
        const merged = [...prev];
        results.forEach((newResult) => {
          const existingIndex = merged.findIndex(
            (r) => r.slabId === newResult.slabId
          );
          if (existingIndex >= 0) {
            merged[existingIndex] = newResult; // Update existing
          } else {
            merged.push(newResult); // Add new
          }
        });
        return merged;
      });

      // Show results view
      setShowResults(true);

      trackABEvent(abVariant, "generation_completed", {
        successCount: results.filter((r) => r.imageData).length,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      trackEvent("generation_error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    // Go back to selection UI but keep everything
    // Keep kitchenImage and persistedResults so user can view existing results later
    setSelectedSlabs([]);
    setShowResults(false);
    setError(null);
    trackABEvent(abVariant, "reset");
  };

  return (
    <div className="min-h-screen gradient-hero pb-32">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <header className="text-center mb-12 animate-slide-up">
          <div className="flex justify-center mb-6">
            {!materialLine ||
            materialLine.id === "default" ||
            !materialLine.logoUrl ? (
              <div className="h-16 md:h-20 flex items-center justify-center px-8 py-4 border-2 border-dashed border-[var(--color-border)] rounded-lg">
                <span className="text-xl md:text-2xl font-semibold text-[var(--color-text-secondary)]">
                  Your Logo Here
                </span>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={materialLine.logoUrl}
                alt={materialLine.name}
                className="h-16 md:h-20 w-auto object-contain"
              />
            )}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-[var(--color-text)] mb-3">
            {materialLine?.name && !isExample
              ? `${materialLine.name}`
              : "Countertop Visualizer"}
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto">
            See your dream countertops come to life with AI. Upload a photo of
            your kitchen and visualize different materials instantly.
          </p>
        </header>

        {/* Main Content */}
        {slabsLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
        ) : !showResults ? (
          <div className="space-y-8 mb-8">
            {/* Upload Kitchen */}
            <div
              className="card p-6 animate-slide-up"
              style={{ animationDelay: "0.1s" }}
            >
              <h2 className="text-2xl font-semibold text-[var(--color-text)] mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center text-sm font-bold">
                  1
                </span>
                Upload Your Kitchen
              </h2>
              {!kitchenImage ? (
                <ImageUpload onImageUpload={handleImageUpload} />
              ) : (
                <div>
                  <div className="relative rounded-xl overflow-hidden bg-[var(--color-bg-secondary)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={kitchenImage}
                      alt="Uploaded kitchen"
                      className="w-full max-h-[500px] object-contain"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setKitchenImage(null);
                      setPersistedResults([]);
                      setGenerationResults([]);
                      setSelectedSlabs([]);
                      setShowResults(false);
                    }}
                    className="mt-3 w-full px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] font-medium border border-[var(--color-border)] rounded-lg hover:border-[var(--color-primary)] transition-colors"
                  >
                    Change Image
                  </button>
                </div>
              )}
            </div>

            {/* Choose Slabs */}
            <div
              className="card p-6 animate-slide-up"
              style={{ animationDelay: "0.2s" }}
            >
              <div className="sticky top-0 bg-white z-10 py-2 mb-4 border-b border-[var(--color-border)]">
                <h2 className="text-2xl font-semibold text-[var(--color-text)] flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center text-sm font-bold">
                    2
                  </span>
                  Choose Your Slabs
                  <span className="ml-auto text-base font-normal text-[var(--color-text-secondary)]">
                    {selectedSlabs.length} of 3 selected
                  </span>
                </h2>
              </div>
              <SlabSelector
                slabs={allSlabs}
                selectedSlabs={selectedSlabs}
                onSlabSelect={handleSlabSelect}
                generatedSlabIds={persistedResults
                  .filter((r) => r.imageData && !r.isLoading && !r.error)
                  .map((r) => r.slabId)}
              />
            </div>
          </div>
        ) : (
          <ResultDisplay
            generationResults={generationResults}
            allPersistedResults={persistedResults}
            selectedSlabs={selectedSlabs}
            originalImage={kitchenImage}
            onReset={handleReset}
            verifiedPhone={verifiedPhone}
            abVariant={abVariant}
            onVerificationUpdate={handleVerificationUpdate}
          />
        )}

        {/* Loading Animation */}
        {isGenerating && (
          <div className="card p-8 mb-8 text-center animate-fade-in">
            <div className="w-20 h-20 mx-auto mb-4 relative">
              <div className="absolute inset-0 rounded-full border-4 border-[var(--color-accent)]/20"></div>
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[var(--color-accent)] animate-spin"></div>
              <div
                className="absolute inset-2 rounded-full border-4 border-transparent border-t-[var(--color-accent-light)] animate-spin"
                style={{
                  animationDuration: "1.5s",
                  animationDirection: "reverse",
                }}
              ></div>
            </div>
            <h3 className="text-xl font-semibold text-[var(--color-text)] mb-2">
              Creating Your Visualizations
            </h3>
            <p className="text-[var(--color-text-secondary)]">
              Our AI is transforming your kitchen with {selectedSlabs.length}{" "}
              different countertop{selectedSlabs.length > 1 ? "s" : ""}...
            </p>
            <p className="text-sm text-[var(--color-text-muted)] mt-2">
              This usually takes 15-30 seconds per image
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg animate-fade-in">
            <p className="text-red-700 text-center">{error}</p>
          </div>
        )}

        {/* Generate Button */}
        {!showResults && (
          <div className="fixed bottom-0 left-0 right-0 pt-4 pb-6 bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)] to-transparent z-50">
            <div className="container mx-auto px-4 max-w-7xl">
              <div className="text-center">
                <button
                  onClick={handleGenerate}
                  disabled={
                    !kitchenImage ||
                    (selectedSlabs.length === 0 &&
                      persistedResults.length === 0) ||
                    isGenerating
                  }
                  className={`
                    px-10 py-4 text-xl font-semibold rounded-full shadow-lg
                    transition-all duration-300 transform
                    ${
                      kitchenImage &&
                      (selectedSlabs.length > 0 ||
                        persistedResults.length > 0) &&
                      !isGenerating
                        ? "bg-[var(--color-accent)] hover:bg-[var(--color-accent-dark)] text-white hover:scale-105 hover:shadow-xl"
                        : "bg-[var(--color-border)] text-[var(--color-text-muted)] cursor-not-allowed"
                    }
                    ${
                      selectedSlabs.length === 3 &&
                      kitchenImage &&
                      !isGenerating
                        ? "animate-hop ring-4 ring-[var(--color-accent)]/30"
                        : ""
                    }
                  `}
                >
                  {isGenerating ? (
                    <span className="flex items-center gap-3">
                      <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
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
                      Processing...
                    </span>
                  ) : (
                    "See It!"
                  )}
                </button>
                {!kitchenImage && (
                  <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                    Upload a kitchen photo to get started
                  </p>
                )}
                {kitchenImage &&
                  selectedSlabs.length === 0 &&
                  persistedResults.length === 0 && (
                    <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                      Select at least one slab to visualize
                    </p>
                  )}
                {kitchenImage &&
                  selectedSlabs.length === 0 &&
                  persistedResults.length > 0 && (
                    <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                      View existing results or select more slabs
                    </p>
                  )}
              </div>
            </div>
          </div>
        )}
      </div>
      <ThemeDebug />
    </div>
  );
}
