"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface TimeframeSelectorProps {
  currentDays: number;
}

export default function TimeframeSelector({
  currentDays,
}: TimeframeSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingDays, setLoadingDays] = useState<number | null>(null);

  const handleTimeframeChange = (days: number) => {
    if (days === currentDays || isLoading) return;

    setIsLoading(true);
    setLoadingDays(days);
    const params = new URLSearchParams(searchParams.toString());
    params.set("days", days.toString());
    router.push(`?${params.toString()}`);
  };

  // Reset loading state when currentDays changes (navigation complete)
  useEffect(() => {
    setIsLoading(false);
    setLoadingDays(null);
  }, [currentDays]);

  return (
    <div className="flex items-center gap-2 relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-lg z-10">
          <div className="flex items-center gap-2 text-slate-600">
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span className="text-sm font-medium">Loading...</span>
          </div>
        </div>
      )}
      <button
        onClick={() => handleTimeframeChange(7)}
        disabled={isLoading}
        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
          currentDays === 7
            ? "bg-blue-600 text-white"
            : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
        } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        7 Days
      </button>
      <button
        onClick={() => handleTimeframeChange(30)}
        disabled={isLoading}
        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
          currentDays === 30
            ? "bg-blue-600 text-white"
            : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
        } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        30 Days
      </button>
      <button
        onClick={() => handleTimeframeChange(90)}
        disabled={isLoading}
        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
          currentDays === 90
            ? "bg-blue-600 text-white"
            : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
        } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        90 Days
      </button>
    </div>
  );
}
