"use client";

import { useState, useEffect, useCallback } from "react";
import { TAG_PARAM_PREFIXES, isAllowedTagKey } from "@/lib/attribution";

export interface SavedLink {
  id: string;
  name: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  tags: Record<string, string> | null;
  created_at: string;
}

interface TrackingLinksClientProps {
  materialLineId: string;
  baseUrl: string;
}

function buildTrackingUrl(
  baseUrl: string,
  params: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
    tags?: Record<string, string>;
  },
): string {
  const search = new URLSearchParams();
  if (params.utm_source?.trim())
    search.set("utm_source", params.utm_source.trim());
  if (params.utm_medium?.trim())
    search.set("utm_medium", params.utm_medium.trim());
  if (params.utm_campaign?.trim())
    search.set("utm_campaign", params.utm_campaign.trim());
  if (params.utm_term?.trim()) search.set("utm_term", params.utm_term.trim());
  if (params.utm_content?.trim())
    search.set("utm_content", params.utm_content.trim());
  if (params.tags && typeof params.tags === "object") {
    Object.entries(params.tags).forEach(([k, v]) => {
      if (k.trim() && v != null && String(v).trim())
        search.set(k.trim(), String(v).trim());
    });
  }
  const q = search.toString();
  return q
    ? `${baseUrl.replace(/\/$/, "")}/?${q}`
    : `${baseUrl.replace(/\/$/, "")}/`;
}

export default function TrackingLinksClient({
  materialLineId,
  baseUrl,
}: TrackingLinksClientProps) {
  const [name, setName] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmTerm, setUtmTerm] = useState("");
  const [utmContent, setUtmContent] = useState("");
  const [tags, setTags] = useState<{ key: string; value: string }[]>([
    { key: "", value: "" },
  ]);
  const [savedLinks, setSavedLinks] = useState<SavedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/material-lines/${materialLineId}/tracking-links`,
      );
      if (!res.ok) throw new Error("Failed to load links");
      const data = await res.json();
      setSavedLinks(Array.isArray(data) ? data : []);
    } catch (e) {
      setSavedLinks([]);
      setError(e instanceof Error ? e.message : "Failed to load links");
    } finally {
      setLoading(false);
    }
  }, [materialLineId]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const rawTags = tags.reduce<Record<string, string>>((acc, { key, value }) => {
    if (key.trim()) acc[key.trim()] = value.trim();
    return acc;
  }, {});
  const allowedTags = Object.fromEntries(
    Object.entries(rawTags).filter(([k]) => isAllowedTagKey(k)),
  );
  const tagKeyOptions = [...TAG_PARAM_PREFIXES];
  const currentParams = {
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_term: utmTerm,
    utm_content: utmContent,
    tags: allowedTags,
  };
  const generatedUrl = buildTrackingUrl(baseUrl, currentParams);

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyFeedback("Copied!");
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback("Copy failed");
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  };

  const addTagRow = () => {
    setTags((prev) => [...prev, { key: "", value: "" }]);
  };

  const updateTag = (index: number, field: "key" | "value", value: string) => {
    setTags((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    );
  };

  const removeTag = (index: number) => {
    setTags((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Give this link a name so you can find it later.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/material-lines/${materialLineId}/tracking-links`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            utm_source: utmSource.trim() || undefined,
            utm_medium: utmMedium.trim() || undefined,
            utm_campaign: utmCampaign.trim() || undefined,
            utm_term: utmTerm.trim() || undefined,
            utm_content: utmContent.trim() || undefined,
            tags: currentParams.tags,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSavedLinks((prev) => [data, ...prev]);
      setName("");
      setUtmSource("");
      setUtmMedium("");
      setUtmCampaign("");
      setUtmTerm("");
      setUtmContent("");
      setTags([{ key: "", value: "" }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save link");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (linkId: string) => {
    setDeletingId(linkId);
    try {
      const res = await fetch(
        `/api/material-lines/${materialLineId}/tracking-links/${linkId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to delete");
      setSavedLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch {
      setError("Failed to delete link");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Build new URL */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Create a new tracking URL
        </h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label
              htmlFor="link-name"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Link name
            </label>
            <input
              id="link-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Facebook Spring 2025"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="utm_source"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                UTM Source
              </label>
              <input
                id="utm_source"
                type="text"
                value={utmSource}
                onChange={(e) => setUtmSource(e.target.value)}
                placeholder="e.g. facebook"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label
                htmlFor="utm_medium"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                UTM Medium
              </label>
              <input
                id="utm_medium"
                type="text"
                value={utmMedium}
                onChange={(e) => setUtmMedium(e.target.value)}
                placeholder="e.g. cpc"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="utm_campaign"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              UTM Campaign
            </label>
            <input
              id="utm_campaign"
              type="text"
              value={utmCampaign}
              onChange={(e) => setUtmCampaign(e.target.value)}
              placeholder="e.g. spring_2025"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="utm_term"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                UTM Term
              </label>
              <input
                id="utm_term"
                type="text"
                value={utmTerm}
                onChange={(e) => setUtmTerm(e.target.value)}
                placeholder="e.g. quartz countertops"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label
                htmlFor="utm_content"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                UTM Content
              </label>
              <input
                id="utm_content"
                type="text"
                value={utmContent}
                onChange={(e) => setUtmContent(e.target.value)}
                placeholder="e.g. hero_banner"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">
                Tags (custom parameters)
              </label>
              <button
                type="button"
                onClick={addTagRow}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                + Add tag
              </button>
            </div>
            <div className="space-y-2">
              {tags.map((tag, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <select
                    value={tag.key}
                    onChange={(e) => updateTag(index, "key", e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select key</option>
                    {tagKeyOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={tag.value}
                    onChange={(e) => updateTag(index, "value", e.target.value)}
                    placeholder="Value"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeTag(index)}
                    className="p-2 text-slate-400 hover:text-red-600"
                    aria-label="Remove tag"
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
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Generated URL */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
            <div className="text-sm font-medium text-slate-700 mb-2">
              Generated URL
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <code className="flex-1 min-w-0 text-sm text-slate-800 break-all">
                {generatedUrl}
              </code>
              <button
                type="button"
                onClick={() => copyToClipboard(generatedUrl)}
                className="shrink-0 px-3 py-1.5 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300"
              >
                {copyFeedback === "Copied!" ? "Copied!" : "Copy URL"}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
            >
              {saving ? "Saving…" : "Save this link"}
            </button>
          </div>
        </form>
      </div>

      {/* Saved links */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Saved links
        </h2>
        {loading ? (
          <p className="text-slate-500 text-sm">Loading…</p>
        ) : savedLinks.length === 0 ? (
          <p className="text-slate-500 text-sm">
            No saved links yet. Create a URL above and click “Save this link” to
            add one.
          </p>
        ) : (
          <ul className="space-y-4">
            {savedLinks.map((link) => {
              const linkUrl = buildTrackingUrl(baseUrl, {
                utm_source: link.utm_source ?? undefined,
                utm_medium: link.utm_medium ?? undefined,
                utm_campaign: link.utm_campaign ?? undefined,
                utm_term: link.utm_term ?? undefined,
                utm_content: link.utm_content ?? undefined,
                tags: link.tags ?? undefined,
              });
              return (
                <li
                  key={link.id}
                  className="flex flex-wrap items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-slate-300"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900 truncate">
                      {link.name}
                    </div>
                    <code className="text-xs text-slate-500 break-all block mt-1">
                      {linkUrl}
                    </code>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(linkUrl)}
                      className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(link.id)}
                      disabled={deletingId === link.id}
                      className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50"
                    >
                      {deletingId === link.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
