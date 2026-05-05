"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  orgId: string;
}

function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function WebsiteForm({ orgId }: Props) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const normalized = normalizeUrl(value);
    if (!normalized) {
      setError("Please enter a valid URL (e.g. https://acmestone.com)");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          websiteUrl: normalized,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to start scrape");
        setSubmitting(false);
        return;
      }

      const { id } = (await res.json()) as { id: string };
      router.push(
        `/onboarding/${orgId}/wizard?scrapeId=${encodeURIComponent(id)}`,
      );
    } catch (err) {
      console.error("scrape submit error", err);
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="block text-sm font-medium text-slate-700 mb-1">
          Website URL
        </span>
        <input
          type="text"
          inputMode="url"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://yourcompany.com"
          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={submitting}
        />
      </label>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || value.trim().length === 0}
        className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Starting…" : "Continue"}
      </button>
    </form>
  );
}
