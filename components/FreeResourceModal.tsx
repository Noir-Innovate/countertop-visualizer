"use client";

import { useEffect, useState } from "react";
import { getStoredAttribution } from "@/lib/attribution";

interface FreeResourceModalProps {
  isOpen: boolean;
  title?: string | null;
  description?: string | null;
  ctaLabel?: string | null;
  materialLineId?: string;
  onSkip: () => void;
  onSuccess: () => void;
  onSubmitted?: (email: string) => void;
  onEmailResult?: (success: boolean) => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function FreeResourceModal({
  isOpen,
  title,
  description,
  ctaLabel,
  materialLineId,
  onSkip,
  onSuccess,
  onSubmitted,
  onEmailResult,
}: FreeResourceModalProps) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setEmail("");
      setError(null);
      setIsSubmitting(false);
      setIsSubmitted(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!EMAIL_REGEX.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!materialLineId || materialLineId === "default") {
      setError("Free resource is not available right now.");
      onEmailResult?.(false);
      return;
    }

    setIsSubmitting(true);
    try {
      const attribution = getStoredAttribution();
      const response = await fetch("/api/free-resource", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          materialLineId,
          ...(attribution && {
            utm_source: attribution.utm_source,
            utm_medium: attribution.utm_medium,
            utm_campaign: attribution.utm_campaign,
            utm_term: attribution.utm_term,
            utm_content: attribution.utm_content,
            referrer: attribution.referrer,
            tags:
              Object.keys(attribution.tags ?? {}).length > 0
                ? attribution.tags
                : undefined,
          }),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send resource email.");
      }

      const submittedEmail = email.trim();
      onEmailResult?.(true);
      onSubmitted?.(submittedEmail);
      setIsSubmitted(true);
    } catch (err) {
      onEmailResult?.(false);
      setError(
        err instanceof Error ? err.message : "Failed to send resource email.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6">
        {isSubmitted ? (
          <div className="text-center py-2 animate-fade-in">
            <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center animate-pulse">
              <svg
                viewBox="0 0 24 24"
                className="h-11 w-11 text-emerald-600"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-slate-900">
              Check your email
            </h3>
            <p className="text-sm text-slate-600 mt-2">
              We just sent your free resource. Open your inbox and click the
              link to access it.
            </p>
            <button
              type="button"
              onClick={onSuccess}
              className="w-full mt-6 py-3 rounded-lg bg-[var(--color-accent)] hover:bg-[var(--color-accent-dark)] text-white font-semibold transition-colors"
            >
              Continue
            </button>
          </div>
        ) : (
          <>
            <h3 className="text-xl font-bold text-slate-900">
              {title || "Get a free resource while we generate your kitchen"}
            </h3>
            <p className="text-sm text-slate-600 mt-2 whitespace-pre-line">
              {description ||
                "Enter your email and we will send you this free resource right away."}
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="you@example.com"
              />

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-lg bg-[var(--color-accent)] hover:bg-[var(--color-accent-dark)] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting
                  ? "Sending..."
                  : ctaLabel?.trim() || "Send me the resource"}
              </button>
              <button
                type="button"
                onClick={onSkip}
                className="w-full text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                No thank you
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
