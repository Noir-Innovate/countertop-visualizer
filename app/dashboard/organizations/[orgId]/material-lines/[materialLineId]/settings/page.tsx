"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { Toaster } from "react-hot-toast";

interface Props {
  params: Promise<{ orgId: string; materialLineId: string }>;
}

interface MaterialLine {
  id: string;
  name: string;
  display_title: string | null;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  background_color: string;
  supabase_folder: string;
  email_sender_name: string | null;
  email_reply_to: string | null;
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

  useEffect(() => {
    const fetchMaterialLine = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("material_lines")
        .select("*")
        .eq("id", materialLineId)
        .single();

      if (data) {
        setMaterialLine(data);
        setName(data.name);
        setDisplayTitle(data.display_title || data.name || "");
        setLogoUrl(data.logo_url || "");
        setPrimaryColor(data.primary_color);
        setBackgroundColor(data.background_color);
        setEmailSenderName(data.email_sender_name || "");
        setEmailReplyTo(data.email_reply_to || "");
      }
      setLoading(false);
    };

    fetchMaterialLine();
  }, [materialLineId]);

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
          <Link
            href={`/dashboard/organizations/${orgId}/material-lines/${materialLineId}`}
            className="hover:text-slate-700"
          >
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
              Public-facing title shown on your visualizer page. If empty, internal name will be used.
            </p>
          </div>

          <div>
            <label
              htmlFor="logoUrl"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Logo URL
            </label>
            <input
              id="logoUrl"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              placeholder="https://example.com/logo.png"
            />
            <p className="mt-1 text-sm text-slate-500">
              URL to your logo image. Recommended size: 200x80px
            </p>
            {logoUrl && (
              <div className="mt-3 p-4 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500 mb-2">Preview:</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt="Logo preview"
                  className="h-12 object-contain"
                />
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
              These settings override organization defaults. Leave empty to use organization settings.
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
                  Email address where replies to quote confirmation emails will be sent
                </p>
              </div>
            </div>
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
      </div>
    </div>
    </>
  );
}
