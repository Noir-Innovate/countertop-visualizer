"use client";

import { useState, useEffect, use, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { Toaster } from "react-hot-toast";
import { getMaterialLineBasePath } from "@/lib/material-line-path";

interface Props {
  params: Promise<{ orgId: string; materialLineId: string }>;
}

interface MaterialLine {
  id: string;
  name: string;
  line_kind: "external" | "internal";
  display_title: string | null;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  background_color: string;
  supabase_folder: string;
  email_sender_name: string | null;
  email_reply_to: string | null;
  ghl_push_enabled: boolean;
  access_locked: boolean;
}

export default function MaterialLineSettingsPage({ params }: Props) {
  const { orgId, materialLineId } = use(params);
  const router = useRouter();
  const [materialLine, setMaterialLine] = useState<MaterialLine | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [displayTitle, setDisplayTitle] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [emailSenderName, setEmailSenderName] = useState("");
  const [emailReplyTo, setEmailReplyTo] = useState("");
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [ghlEnabled, setGhlEnabled] = useState(false);
  const [accessLocked, setAccessLocked] = useState(false);
  const [ghlAvailable, setGhlAvailable] = useState<boolean | null>(null);
  const [ghlSaving, setGhlSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const materialLineBasePath = getMaterialLineBasePath(
    orgId,
    materialLineId,
    materialLine?.line_kind,
  );

  useEffect(() => {
    const fetchMaterialLine = async () => {
      const supabase = createClient();
      const [{ data }, { data: org }] = await Promise.all([
        supabase
          .from("material_lines")
          .select("*")
          .eq("id", materialLineId)
          .single(),
        supabase
          .from("organizations")
          .select("slug")
          .eq("id", orgId)
          .single(),
      ]);

      if (data) {
        setMaterialLine(data);
        setName(data.name);
        setDisplayTitle(data.display_title || data.name || "");
        setLogoUrl(data.logo_url || "");
        setPrimaryColor(data.primary_color);
        setBackgroundColor(data.background_color);
        setEmailSenderName(data.email_sender_name || "");
        setEmailReplyTo(data.email_reply_to || "");
        setGhlEnabled(!!data.ghl_push_enabled);
        setAccessLocked(!!data.access_locked);
      }
      if (org?.slug) setOrgSlug(org.slug);
      setLoading(false);
    };

    fetchMaterialLine();
  }, [materialLineId, orgId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/integrations/ghl?orgId=${orgId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setGhlAvailable(!!data.integration && data.integration.enabled);
      })
      .catch(() => {
        if (!cancelled) setGhlAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  async function handleGhlToggle(next: boolean) {
    setGhlSaving(true);
    const prev = ghlEnabled;
    setGhlEnabled(next);
    try {
      const res = await fetch(
        `/api/material-lines/${materialLineId}/ghl-toggle`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: next }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setGhlEnabled(prev);
        toast.error(data.error || "Failed to update");
        return;
      }
      toast.success(next ? "Leads will push to GHL" : "GHL push disabled");
    } catch (e) {
      setGhlEnabled(prev);
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setGhlSaving(false);
    }
  }

  async function handleLogoUpload(file: File) {
    if (!orgSlug) {
      setUploadError("Organization slug unavailable; cannot upload yet.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
      const path = `${orgSlug}/material-line-logos/${materialLineId}/logo-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("public-assets")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: (file.type || "").split(";")[0].trim() || undefined,
        });
      if (uploadErr) throw new Error(uploadErr.message);
      const {
        data: { publicUrl },
      } = supabase.storage.from("public-assets").getPublicUrl(path);
      setLogoUrl(publicUrl);
      toast.success("Logo uploaded. Don't forget to save.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("material_lines")
        .update({
          name,
          display_title: displayTitle || null,
          logo_url: logoUrl || null,
          primary_color: primaryColor,
          accent_color: primaryColor, // Accent uses primary color
          background_color: backgroundColor,
          email_sender_name: emailSenderName || null,
          email_reply_to: emailReplyTo || null,
          // Only internal lines expose the lock; keep external lines unlocked.
          access_locked:
            materialLine?.line_kind === "internal" ? accessLocked : false,
        })
        .eq("id", materialLineId);

      if (updateError) {
        setError(updateError.message);
        toast.error(updateError.message);
        return;
      }

      toast.success("Settings saved successfully!");
      router.refresh();
    } catch {
      const errorMessage = "An unexpected error occurred";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-slate-200 rounded w-1/2 mb-8"></div>
          <div className="bg-white rounded-xl p-6 space-y-6">
            <div className="h-10 bg-slate-200 rounded"></div>
            <div className="h-10 bg-slate-200 rounded"></div>
            <div className="h-10 bg-slate-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!materialLine) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p className="text-slate-600">Material line not found</p>
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <Link href="/dashboard" className="hover:text-slate-700">
              Dashboard
            </Link>
            <span>/</span>
            <Link
              href={`/dashboard/organizations/${orgId}`}
              className="hover:text-slate-700"
            >
              Organization
            </Link>
            <span>/</span>
            <Link href={materialLineBasePath} className="hover:text-slate-700">
              {materialLine.name}
            </Link>
            <span>/</span>
            <span>Settings</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">
            Material Line Settings
          </h1>
          <p className="text-slate-600 mt-1">
            Customize your material line&apos;s branding and appearance
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Material Line Type
              </label>
              <div className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                {materialLine.line_kind === "internal"
                  ? "Internal line"
                  : "External line"}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Type is locked after creation.
              </p>
            </div>

            {materialLine.line_kind === "internal" && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <input
                    id="accessLocked"
                    type="checkbox"
                    checked={accessLocked}
                    onChange={(e) => setAccessLocked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="accessLocked" className="flex-1">
                    <span className="block text-sm font-medium text-slate-700">
                      Require sign-in to access this line
                    </span>
                    <span className="mt-1 block text-sm text-slate-500">
                      When checked, the public visualizer is locked down.
                      Visitors are forwarded to the <code>/sales</code> portal
                      and must log in with an account that has been given access
                      to this line. When unchecked, anyone can open the line
                      directly.
                    </span>
                  </label>
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Internal Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                required
              />
              <p className="mt-1 text-sm text-slate-500">
                Used internally in the dashboard and admin areas
              </p>
            </div>

            <div>
              <label
                htmlFor="displayTitle"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Display Title
              </label>
              <input
                id="displayTitle"
                type="text"
                value={displayTitle}
                onChange={(e) => setDisplayTitle(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder={name}
              />
              <p className="mt-1 text-sm text-slate-500">
                Public-facing title shown on your visualizer page. If empty,
                internal name will be used.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Logo
              </label>

              <div
                onClick={() =>
                  !uploading && logoFileInputRef.current?.click()
                }
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!uploading) setDragActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const file = e.dataTransfer.files?.[0];
                  if (!uploading && file) handleLogoUpload(file);
                }}
                className={`cursor-pointer border-2 border-dashed rounded-lg px-6 py-8 text-center transition-colors ${
                  dragActive
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100"
                } ${uploading ? "opacity-60 cursor-wait" : ""}`}
              >
                <svg
                  className="mx-auto w-8 h-8 text-slate-400 mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12M12 7.5V21"
                  />
                </svg>
                <p className="text-sm font-medium text-slate-900">
                  {uploading
                    ? "Uploading…"
                    : "Drop a logo here or click to browse"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  PNG, JPG, WEBP, or SVG · recommended 200x80px
                </p>
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoUpload(file);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </div>
              {uploadError && (
                <p className="text-sm text-red-600 mt-2">{uploadError}</p>
              )}

              <label
                htmlFor="logoUrl"
                className="block text-xs font-medium text-slate-500 mt-4 mb-1"
              >
                Or paste a logo URL
              </label>
              <input
                id="logoUrl"
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="https://example.com/logo.png"
              />

              {logoUrl && (
                <div className="mt-3 p-4 bg-slate-50 rounded-lg flex items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoUrl}
                    alt="Logo preview"
                    className="h-12 object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setLogoUrl("")}
                    className="ml-auto text-sm text-slate-500 hover:text-slate-700"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 pt-6">
              <h3 className="text-lg font-medium text-slate-900 mb-4">
                Theme Colors
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="primaryColor"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Primary Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="primaryColor"
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-12 h-12 rounded-lg border border-slate-300 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Used for buttons, highlights, and accents
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="backgroundColor"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Background
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="backgroundColor"
                      type="color"
                      value={backgroundColor}
                      onChange={(e) => setBackgroundColor(e.target.value)}
                      className="w-12 h-12 rounded-lg border border-slate-300 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={backgroundColor}
                      onChange={(e) => setBackgroundColor(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Color Preview */}
              <div
                className="mt-4 p-4 rounded-lg border border-slate-200"
                style={{ backgroundColor }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="px-4 py-2 rounded-lg text-white font-medium"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Primary Button
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-6">
              <h3 className="text-lg font-medium text-slate-900 mb-4">
                Email Settings
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                These settings override organization defaults. Leave empty to
                use organization settings.
              </p>

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="emailSenderName"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Email Sender Name
                  </label>
                  <input
                    id="emailSenderName"
                    type="text"
                    value={emailSenderName}
                    onChange={(e) => setEmailSenderName(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    placeholder="e.g., Your Company Name"
                  />
                  <p className="mt-1 text-sm text-slate-500">
                    Name shown as the sender in quote confirmation emails
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="emailReplyTo"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Reply-To Email
                  </label>
                  <input
                    id="emailReplyTo"
                    type="email"
                    value={emailReplyTo}
                    onChange={(e) => setEmailReplyTo(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    placeholder="support@yourcompany.com"
                  />
                  <p className="mt-1 text-sm text-slate-500">
                    Email address where replies to quote confirmation emails
                    will be sent
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-6">
              <h3 className="text-lg font-medium text-slate-900 mb-2">CRM</h3>
              {ghlAvailable === null ? (
                <p className="text-sm text-slate-500">
                  Checking integration status…
                </p>
              ) : ghlAvailable ? (
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-700 font-medium">
                      Push leads to GoHighLevel
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      When a lead is submitted on this material line, a contact
                      will be upserted in your org&apos;s GHL location and a
                      note with lead details will be attached.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGhlToggle(!ghlEnabled)}
                    disabled={ghlSaving}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                      ghlEnabled ? "bg-blue-600" : "bg-slate-300"
                    }`}
                    aria-pressed={ghlEnabled}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        ghlEnabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ) : (
                <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <p>
                    No active GoHighLevel integration for this organization.{" "}
                    <Link
                      href={`/dashboard/organizations/${orgId}/integrations`}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Set one up →
                    </Link>
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-4 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-3 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </form>

          <div className="mt-8 pt-8 border-t border-dashed border-red-200">
            <h3 className="text-lg font-medium text-red-900 mb-2">
              Danger zone
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              Permanently delete this material line and related dashboard data.
              You will be asked to type the internal name to confirm.
            </p>
            <Link
              href={`${materialLineBasePath}/delete`}
              className="inline-flex items-center justify-center px-4 py-2 border border-red-300 text-red-700 font-medium rounded-lg hover:bg-red-50 transition-colors"
            >
              Delete material line…
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
