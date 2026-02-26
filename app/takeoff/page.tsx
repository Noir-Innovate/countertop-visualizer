"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import imageCompression from "browser-image-compression";
import StepHeader from "@/components/StepHeader";
import ImageUpload from "@/components/ImageUpload";

/** Strip script tags and event handlers from SVG for safe render */
function sanitizeSvg(svg: string): string {
  let out = svg.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    "",
  );
  out = out.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");
  out = out.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, "");
  return out;
}

export default function TakeoffPage() {
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [kitchenImage, setKitchenImage] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [fabricationNotes, setFabricationNotes] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageUpload = useCallback((base64: string) => {
    setKitchenImage(base64);
    setError(null);
  }, []);

  const compressImage = useCallback(
    async (base64Image: string): Promise<string> => {
      try {
        const res = await fetch(base64Image);
        const blob = await res.blob();
        const options = {
          maxSizeMB: 4,
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
      } catch {
        return base64Image;
      }
    },
    [],
  );

  const handleGenerate = useCallback(async () => {
    if (!kitchenImage) return;
    setIsGenerating(true);
    setError(null);
    try {
      const compressed = await compressImage(kitchenImage);
      const res = await fetch("/api/takeoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: compressed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate takeoff");
      }
      setSvg(data.svg ?? null);
      setFabricationNotes(data.fabricationNotes ?? null);
      setCurrentStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsGenerating(false);
    }
  }, [kitchenImage, compressImage]);

  const handleNewTakeoff = useCallback(() => {
    setCurrentStep(1);
    setKitchenImage(null);
    setSvg(null);
    setFabricationNotes(null);
    setError(null);
  }, []);

  const handleDownloadSvg = useCallback(() => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `takeoff-${new Date().toISOString().slice(0, 10)}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [svg]);

  return (
    <div className="min-h-screen gradient-hero pb-4">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Step 1: Upload */}
        {currentStep === 1 && (
          <div className="animate-fade-in">
            <StepHeader
              instruction="Upload a photo of your kitchen for takeoff"
              stepNumber={1}
              totalSteps={2}
            />
            <div className="max-w-2xl mx-auto">
              <ImageUpload onImageUpload={handleImageUpload} />
            </div>

            {kitchenImage && (
              <div className="mt-8 max-w-3xl mx-auto">
                <div className="relative aspect-video rounded-xl overflow-hidden bg-[var(--color-bg-secondary)] shadow-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={kitchenImage}
                    alt="Selected kitchen"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="mt-6 text-center">
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className={`
                      px-10 py-4 text-xl font-semibold rounded-full shadow-lg
                      transition-all duration-300 transform
                      ${
                        !isGenerating
                          ? "bg-[var(--color-accent)] hover:bg-[var(--color-accent-dark)] text-white hover:scale-105 hover:shadow-xl"
                          : "bg-[var(--color-border)] text-[var(--color-text-muted)] cursor-not-allowed"
                      }
                    `}
                  >
                    {isGenerating ? (
                      <span className="flex items-center justify-center gap-3">
                        <svg
                          className="animate-spin h-6 w-6"
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
                        Generating takeoff...
                      </span>
                    ) : (
                      "Generate takeoff"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Loading (during generation, still on step 1) */}
        {isGenerating && currentStep === 1 && (
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
              Generating takeoff
            </h3>
            <p className="text-[var(--color-text-secondary)]">
              Our AI is analyzing your kitchen and creating the 2D takeoff…
            </p>
            <p className="text-sm text-[var(--color-text-muted)] mt-2">
              This usually takes 15–30 seconds
            </p>
          </div>
        )}

        {/* Step 2: Result */}
        {currentStep === 2 && svg && (
          <div className="animate-fade-in">
            <StepHeader
              instruction="Your takeoff"
              stepNumber={2}
              totalSteps={2}
            />
            <div className="mb-6 flex justify-center gap-3">
              <button
                onClick={handleDownloadSvg}
                className="px-4 py-2 text-sm font-medium bg-[var(--color-accent)] hover:bg-[var(--color-accent-dark)] text-white rounded-lg shadow transition-colors"
              >
                Download SVG
              </button>
              <button
                onClick={handleNewTakeoff}
                className="px-4 py-2 text-sm font-medium bg-[var(--color-bg-secondary)] hover:bg-[var(--color-border)] text-[var(--color-text)] rounded-lg shadow transition-colors"
              >
                New takeoff
              </button>
            </div>

            <div className="card p-6 mb-6 overflow-auto max-h-[70vh] rounded-2xl bg-[var(--color-bg-secondary)]">
              <div
                className="min-w-0 [&_svg]:max-w-full [&_svg]:h-auto"
                dangerouslySetInnerHTML={{
                  __html: sanitizeSvg(svg),
                }}
              />
            </div>

            {fabricationNotes && (
              <div className="card p-6 mb-8">
                <h3 className="text-lg font-semibold text-[var(--color-text)] mb-3">
                  Fabrication notes
                </h3>
                <div className="text-[var(--color-text-secondary)] whitespace-pre-wrap text-sm">
                  {fabricationNotes}
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg animate-fade-in">
            <p className="text-red-700 text-center">{error}</p>
          </div>
        )}

        {currentStep === 1 && !kitchenImage && (
          <footer className="mt-8 pt-4 border-t border-[var(--color-border)]">
            <div className="flex flex-col md:flex-row justify-center items-center gap-2 md:gap-3 text-xs text-[var(--color-text-secondary)]">
              <Link
                href="/privacy"
                className="hover:text-[var(--color-text)] transition-colors underline"
              >
                Privacy Policy
              </Link>
              <span className="hidden md:inline text-[var(--color-text-muted)]">
                •
              </span>
              <Link
                href="/terms"
                className="hover:text-[var(--color-text)] transition-colors underline"
              >
                Terms of Service
              </Link>
            </div>
          </footer>
        )}

        {currentStep === 2 && (
          <footer className="mt-4 pt-2 pb-1 border-t border-[var(--color-border)]">
            <div className="flex flex-col md:flex-row justify-center items-center gap-2 md:gap-3 text-xs text-[var(--color-text-secondary)]">
              <Link
                href="/privacy"
                className="hover:text-[var(--color-text)] transition-colors underline"
              >
                Privacy Policy
              </Link>
              <span className="hidden md:inline text-[var(--color-text-muted)]">
                •
              </span>
              <Link
                href="/terms"
                className="hover:text-[var(--color-text)] transition-colors underline"
              >
                Terms of Service
              </Link>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
