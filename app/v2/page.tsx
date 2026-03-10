"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import V2KitchenUpload from "@/components/v2/V2KitchenUpload";
import V2Visualizer from "@/components/v2/V2Visualizer";
import { useMaterialLine } from "@/lib/material-line";
import type { ExampleKitchen } from "@/lib/types";
import { captureAndPersistAttribution } from "@/lib/attribution";
import { trackEvent } from "@/lib/posthog";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  const key = "v2_session_id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export default function V2Page() {
  const materialLine = useMaterialLine();
  const [kitchenImage, setKitchenImage] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [customKitchens, setCustomKitchens] = useState<ExampleKitchen[]>([]);

  useEffect(() => {
    captureAndPersistAttribution();
    setSessionId(getOrCreateSessionId());
  }, []);

  useEffect(() => {
    if (materialLine) {
      trackEvent("v2_page_view", {
        materialLineId: materialLine.id,
        organizationId: materialLine.organizationId,
      });
    }
  }, [materialLine]);

  // Load custom kitchen images from material line
  useEffect(() => {
    if (
      !materialLine?.kitchenImages ||
      materialLine.kitchenImages.length === 0
    ) {
      setCustomKitchens([]);
      return;
    }
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      (typeof window !== "undefined"
        ? `${window.location.protocol}//${window.location.hostname}:54321`
        : "http://127.0.0.1:54321");

    setCustomKitchens(
      materialLine.kitchenImages
        .sort((a, b) => a.order - b.order)
        .map((img) => ({
          id: img.id,
          name: img.title || `Kitchen ${img.order}`,
          imageUrl: `${supabaseUrl}/storage/v1/object/public/public-assets/${materialLine.supabaseFolder}/kitchens/${img.filename}`,
        })),
    );
  }, [materialLine]);

  const handleKitchenSelect = (base64Image: string) => {
    setKitchenImage(base64Image);
    trackEvent("v2_kitchen_selected", {
      materialLineId: materialLine?.id,
      organizationId: materialLine?.organizationId,
    });
  };

  const handleChangePhoto = () => {
    setKitchenImage(null);
  };

  return (
    <div className="min-h-screen gradient-hero pb-4">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {!kitchenImage ? (
          <V2KitchenUpload
            onKitchenSelect={handleKitchenSelect}
            customKitchens={customKitchens}
          />
        ) : (
          <V2Visualizer
            kitchenImage={kitchenImage}
            sessionId={sessionId}
            onChangePhoto={handleChangePhoto}
          />
        )}
      </div>

      <footer className="mt-4 pt-2 pb-1 border-t border-[var(--color-border)]">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex flex-col md:flex-row justify-center items-center gap-2 md:gap-3 text-xs text-[var(--color-text-secondary)]">
            <Link
              href="/privacy"
              className="hover:text-[var(--color-text)] transition-colors underline"
            >
              Privacy Policy
            </Link>
            <span className="hidden md:inline text-[var(--color-text-muted)]">
              &bull;
            </span>
            <Link
              href="/terms"
              className="hover:text-[var(--color-text)] transition-colors underline"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
