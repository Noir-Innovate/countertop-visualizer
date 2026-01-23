"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { Toaster } from "react-hot-toast";

interface Props {
  params: Promise<{ orgId: string }>;
}

interface Organization {
  id: string;
  name: string;
  email_sender_name: string | null;
  email_reply_to: string | null;
}

export default function OrganizationSettingsPage({ params }: Props) {
  const { orgId } = use(params);
  const router = useRouter();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [emailSenderName, setEmailSenderName] = useState("");
  const [emailReplyTo, setEmailReplyTo] = useState("");

  useEffect(() => {
    const fetchOrganization = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", orgId)
        .single();

      if (data) {
        setOrganization(data);
        setEmailSenderName(data.email_sender_name || "");
        setEmailReplyTo(data.email_reply_to || "");
      }
      setLoading(false);
    };

    fetchOrganization();
  }, [orgId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("organizations")
        .update({
          email_sender_name: emailSenderName || null,
          email_reply_to: emailReplyTo || null,
        })
        .eq("id", orgId);

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
          </div>
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p className="text-slate-600">Organization not found</p>
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
            {organization.name}
          </Link>
          <span>/</span>
          <span>Settings</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900">
          Organization Settings
        </h1>
        <p className="text-slate-600 mt-1">
          Configure default email settings for your organization
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
            <h3 className="text-lg font-medium text-slate-900 mb-4">
              Email Settings
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              These are default email settings for all material lines in this organization. Individual material lines can override these settings.
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
                  Default name shown as the sender in quote confirmation emails. If not set, defaults to &quot;Countertop Visualizer&quot;.
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
                  Default email address where replies to quote confirmation emails will be sent
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
