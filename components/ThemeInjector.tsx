"use client";

import { useEffect } from "react";
import { useMaterialLine } from "@/lib/material-line";

export default function ThemeInjector() {
  const materialLine = useMaterialLine();

  useEffect(() => {
    if (!materialLine) return;

    // Set CSS variables directly on the document root
    // This ensures they override globals.css defaults
    const root = document.documentElement;

    // Helper to lighten/darken colors
    const lightenColor = (hex: string, percent: number): string => {
      const num = parseInt(hex.replace("#", ""), 16);
      if (isNaN(num)) return hex;
      const r = Math.min(
        255,
        Math.round(
          ((num >> 16) & 0xff) + (255 - ((num >> 16) & 0xff)) * percent
        )
      );
      const g = Math.min(
        255,
        Math.round(((num >> 8) & 0xff) + (255 - ((num >> 8) & 0xff)) * percent)
      );
      const b = Math.min(
        255,
        Math.round((num & 0xff) + (255 - (num & 0xff)) * percent)
      );
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
    };

    const darkenColor = (hex: string, percent: number): string => {
      const num = parseInt(hex.replace("#", ""), 16);
      if (isNaN(num)) return hex;
      const r = Math.max(0, Math.round(((num >> 16) & 0xff) * (1 - percent)));
      const g = Math.max(0, Math.round(((num >> 8) & 0xff) * (1 - percent)));
      const b = Math.max(0, Math.round((num & 0xff) * (1 - percent)));
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
    };

    const primaryColor = materialLine.primaryColor || "#2563eb";
    const backgroundColor = materialLine.backgroundColor || "#ffffff";

    // Set all CSS variables
    root.style.setProperty("--color-primary", primaryColor);
    root.style.setProperty(
      "--color-primary-light",
      lightenColor(primaryColor, 0.3)
    );
    root.style.setProperty(
      "--color-primary-dark",
      darkenColor(primaryColor, 0.2)
    );

    // Accent uses primary color
    root.style.setProperty("--color-accent", primaryColor);
    root.style.setProperty(
      "--color-accent-light",
      lightenColor(primaryColor, 0.3)
    );
    root.style.setProperty(
      "--color-accent-dark",
      darkenColor(primaryColor, 0.2)
    );

    root.style.setProperty("--color-bg", backgroundColor);
    root.style.setProperty(
      "--color-bg-secondary",
      lightenColor(backgroundColor, 0.02)
    );
    root.style.setProperty("--color-bg-card", backgroundColor);

    // Log in development
    if (process.env.NODE_ENV === "development") {
      console.log("[ThemeInjector] Applied colors:", {
        primaryColor,
        backgroundColor,
      });
    }
  }, [materialLine]);

  return null;
}
