"use client";

import { useEffect, useState } from "react";

export default function ThemeDebug() {
  const [colors, setColors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const updateColors = () => {
      const root = document.documentElement;
      const computedStyles = getComputedStyle(root);

      setColors({
        "--color-primary":
          computedStyles.getPropertyValue("--color-primary").trim() ||
          "not set",
        "--color-primary-light":
          computedStyles.getPropertyValue("--color-primary-light").trim() ||
          "not set",
        "--color-primary-dark":
          computedStyles.getPropertyValue("--color-primary-dark").trim() ||
          "not set",
        "--color-accent":
          computedStyles.getPropertyValue("--color-accent").trim() || "not set",
        "--color-accent-light":
          computedStyles.getPropertyValue("--color-accent-light").trim() ||
          "not set",
        "--color-accent-dark":
          computedStyles.getPropertyValue("--color-accent-dark").trim() ||
          "not set",
        "--color-bg":
          computedStyles.getPropertyValue("--color-bg").trim() || "not set",
        "--color-bg-secondary":
          computedStyles.getPropertyValue("--color-bg-secondary").trim() ||
          "not set",
      });
    };

    updateColors();
    // Update on window resize/load in case styles change
    window.addEventListener("resize", updateColors);
    return () => window.removeEventListener("resize", updateColors);
  }, []);

  if (process.env.NODE_ENV !== "development") return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black/90 text-white p-4 rounded-lg font-mono text-xs z-[9999] max-w-sm">
      <div className="font-bold mb-2 text-yellow-400">
        Theme Debug (Dev Only)
      </div>
      <div className="space-y-1">
        <div>
          <span className="text-gray-400">Primary:</span>{" "}
          <span
            className="inline-block w-3 h-3 rounded border border-white/30 mr-1"
            style={{ backgroundColor: colors["--color-primary"] }}
          />
          <span>{colors["--color-primary"]}</span>
        </div>
        <div className="pl-4 text-gray-300">
          Light:{" "}
          <span
            className="inline-block w-3 h-3 rounded border border-white/30 mr-1"
            style={{ backgroundColor: colors["--color-primary-light"] }}
          />
          {colors["--color-primary-light"]}
        </div>
        <div className="pl-4 text-gray-300">
          Dark:{" "}
          <span
            className="inline-block w-3 h-3 rounded border border-white/30 mr-1"
            style={{ backgroundColor: colors["--color-primary-dark"] }}
          />
          {colors["--color-primary-dark"]}
        </div>
        <div className="mt-2">
          <span className="text-gray-400">Accent (same as Primary):</span>{" "}
          <span
            className="inline-block w-3 h-3 rounded border border-white/30 mr-1"
            style={{ backgroundColor: colors["--color-accent"] }}
          />
          <span>{colors["--color-accent"]}</span>
        </div>
        <div className="mt-2">
          <span className="text-gray-400">BG:</span>{" "}
          <span
            className="inline-block w-3 h-3 rounded border border-white/30 mr-1"
            style={{ backgroundColor: colors["--color-bg"] }}
          />
          <span>{colors["--color-bg"]}</span>
        </div>
        <div className="pl-4 text-gray-300">
          Secondary:{" "}
          <span
            className="inline-block w-3 h-3 rounded border border-white/30 mr-1"
            style={{ backgroundColor: colors["--color-bg-secondary"] }}
          />
          {colors["--color-bg-secondary"]}
        </div>
      </div>
    </div>
  );
}
