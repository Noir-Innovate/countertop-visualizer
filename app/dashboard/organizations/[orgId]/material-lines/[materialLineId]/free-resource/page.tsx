"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Toaster, toast } from "react-hot-toast";
import { getMaterialLineBasePath } from "@/lib/material-line-path";

interface Props {
  params: Promise<{ orgId: string; materialLineId: string }>;
}

interface MaterialLineData {
  id: string;
  name: string;
  line_kind: "external" | "internal";
  supabase_folder: string;
  primary_color: string;
  free_resource_enabled: boolean;
  free_resource_title: string | null;
  free_resource_description: string | null;
  free_resource_email_subject: string | null;
  free_resource_email_body: string | null;
  free_resource_cta_label: string | null;
  free_resource_file_url: string | null;
  free_resource_file_name: string | null;
}

const DEFAULT_COPY = {
  title: "Free Countertop Planning Guide",
  description:
    "Want our free countertop planning guide while your kitchen is generating? Enter your email and we will send it right away.",
  subject: "Your Free Countertop Planning Guide",
  emailBody:
    "Thanks for trying our countertop visualizer. Your free planning guide is ready. Use the button below to access it.",
  cta: "Send me the guide",
};

function normalizeBrandColor(color: string | null | undefined): string {
  if (!color || typeof color !== "string") return "#2563eb";
  const value = color.trim();
  const withHash = value.startsWith("#") ? value : `#${value}`;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(withHash)
    ? withHash
    : "#2563eb";
}

export default function FreeResourcePage({ params }: Props) {
  const { orgId, materialLineId } = use(params);
  const router = useRouter();
  const [materialLine, setMaterialLine] = useState<MaterialLineData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("material_lines")
        .select(
          "id, name, line_kind, supabase_folder, primary_color, free_resource_enabled, free_resource_title, free_resource_description, free_resource_email_subject, free_resource_email_body, free_resource_cta_label, free_resource_file_url, free_resource_file_name",
        )
        .eq("id", materialLineId)
        .single();

      if (data) {
        setMaterialLine(data);
        setEnabled(Boolean(data.free_resource_enabled));
        setTitle(data.free_resource_title || "");
        setDescription(data.free_resource_description || "");
        setSubject(data.free_resource_email_subject || "");
        setEmailBody(data.free_resource_email_body || "");
        setCtaLabel(data.free_resource_cta_label || "");
        setFileUrl(data.free_resource_file_url || "");
        setFileName(data.free_resource_file_name || "");
      }

      setLoading(false);
    };

    load();
  }, [materialLineId]);

  const applyDefaultCopy = () => {
    if (!title.trim()) setTitle(DEFAULT_COPY.title);
    if (!description.trim()) setDescription(DEFAULT_COPY.description);
    if (!subject.trim()) setSubject(DEFAULT_COPY.subject);
    if (!emailBody.trim()) setEmailBody(DEFAULT_COPY.emailBody);
    if (!ctaLabel.trim()) setCtaLabel(DEFAULT_COPY.cta);
  };

  const uploadResourceFile = async (file: File) => {
    if (!file || !materialLine) return;

    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${materialLine.supabase_folder}/resources/${Date.now()}-${sanitized}`;
      const { error: uploadError } = await supabase.storage
        .from("public-assets")
        .upload(path, file, {
          upsert: true,
          cacheControl: "3600",
          contentType: file.type || "application/octet-stream",
        });

      if (uploadError) throw new Error(uploadError.message);
      const { data } = supabase.storage
        .from("public-assets")
        .getPublicUrl(path);
      setFileUrl(data.publicUrl);
      setFileName(file.name);
      toast.success("Resource file uploaded");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to upload file";
      setError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadResourceFile(file);
    e.target.value = "";
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("material_lines")
        .update({
          free_resource_enabled: enabled,
          free_resource_title: title || null,
          free_resource_description: description || null,
          free_resource_email_subject: subject || null,
          free_resource_email_body: emailBody || null,
          free_resource_cta_label: ctaLabel || null,
          free_resource_file_url: fileUrl || null,
          free_resource_file_name: fileName || null,
        })
        .eq("id", materialLineId);

      if (updateError) throw new Error(updateError.message);
      toast.success("Free resource settings saved");
      router.refresh();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to save settings";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!testEmail.trim()) {
      toast.error("Enter an email address for the test send");
      return;
    }

    setSendingTest(true);
    try {
      const response = await fetch("/api/free-resource", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail.trim(),
          materialLineId,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Failed to send test email");
      }

      toast.success("Test free resource email sent");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to send test email";
      toast.error(msg);
    } finally {
      setSendingTest(false);
    }
  };

  if (loading || !materialLine) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="h-8 w-64 rounded bg-slate-200 animate-pulse mb-6" />
      </div>
    );
  }

  const basePath = getMaterialLineBasePath(
    orgId,
    materialLineId,
    materialLine.line_kind,
  );
  const previewTitle = title || DEFAULT_COPY.title;
  const previewDesc = description || DEFAULT_COPY.description;
  const previewSubject = subject || DEFAULT_COPY.subject;
  const previewBody = emailBody || DEFAULT_COPY.emailBody;
  const previewCta = ctaLabel || DEFAULT_COPY.cta;
  const brandColor = normalizeBrandColor(materialLine.primary_color);
  const previewButtonStyle = {
    backgroundColor: brandColor,
  };

  const handleDrop = async (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await uploadResourceFile(file);
  };

  return (
    <>
      <Toaster position="top-right" />
      <div className="max-w-7xl mx-auto px-4 py-8">
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
            <Link href={basePath} className="hover:text-slate-700">
              {materialLine.name}
            </Link>
            <span>/</span>
            <span>Free Resource</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Free Resource</h1>
          <p className="text-slate-600 mt-1">
            Configure the optional email capture popup and resource email.
          </p>
        </div>

        <form
          onSubmit={handleSave}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
        >
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="font-medium text-slate-800">
                    Enable free resource popup
                  </span>
                </label>
                <button
                  type="button"
                  onClick={applyDefaultCopy}
                  className="text-sm px-3 py-1.5 border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  Fill default copy
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Popup Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300"
                    placeholder={DEFAULT_COPY.title}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Popup Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300"
                    placeholder={DEFAULT_COPY.description}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Email Subject
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300"
                    placeholder={DEFAULT_COPY.subject}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    CTA Button Label
                  </label>
                  <input
                    type="text"
                    value={ctaLabel}
                    onChange={(e) => setCtaLabel(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300"
                    placeholder={DEFAULT_COPY.cta}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Email Body
                  </label>
                  <textarea
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300"
                    placeholder={DEFAULT_COPY.emailBody}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Resource File
                </label>
                <label
                  onDragEnter={() => setDragActive(true)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragActive(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragActive(false);
                  }}
                  onDrop={handleDrop}
                  className={`block rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                    dragActive
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-300 bg-slate-50 hover:border-slate-400"
                  }`}
                >
                  <input
                    type="file"
                    onChange={handleUpload}
                    accept=".pdf,.doc,.docx,.txt,.rtf,.ppt,.pptx,.xlsx,.xls,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    disabled={uploading}
                    className="hidden"
                  />
                  <p className="text-sm font-medium text-slate-700">
                    {uploading
                      ? "Uploading..."
                      : "Drag and drop your file here, or click to choose"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    PDF, DOC, DOCX, TXT, RTF, PPT, PPTX, XLS, XLSX (max 25MB)
                  </p>
                </label>
                <p className="text-sm text-slate-500 mt-1">
                  Stored in your Supabase `public-assets` bucket under the
                  material-line `resources` folder.
                </p>
              </div>

              {fileUrl && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm text-slate-700">
                    File:{" "}
                    <span className="font-medium">
                      {fileName || "Uploaded"}
                    </span>
                  </p>
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 underline break-all"
                  >
                    {fileUrl}
                  </a>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => router.push(basePath)}
                  className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 text-white rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
                >
                  {saving ? "Saving..." : "Save Free Resource"}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">
                Send Test Email
              </h2>
              <p className="text-sm text-slate-600 mb-4">
                Sends using the currently saved free resource settings. Save
                first if you made changes.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 px-4 py-3 rounded-lg border border-slate-300"
                />
                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={sendingTest}
                  className="px-5 py-3 text-white rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
                >
                  {sendingTest ? "Sending..." : "Send test"}
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">
                Popup Preview
              </h2>
              <div className="rounded-xl border border-slate-300 p-4 bg-slate-50">
                <h3 className="font-bold text-slate-900">{previewTitle}</h3>
                <p className="text-sm text-slate-600 mt-2 whitespace-pre-line">
                  {previewDesc}
                </p>
                <input
                  type="email"
                  disabled
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 mt-3 rounded-lg border border-slate-300 bg-white text-sm"
                />
                <button
                  type="button"
                  className="w-full mt-3 py-2 text-white rounded-lg text-sm"
                  style={previewButtonStyle}
                >
                  {previewCta}
                </button>
                <button
                  type="button"
                  className="w-full mt-2 text-xs text-slate-500"
                >
                  No thank you
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">
                Email Preview
              </h2>
              <div className="rounded-xl border border-slate-300 p-4 bg-slate-50">
                <p className="text-xs text-slate-500">Subject</p>
                <p className="font-medium text-slate-900 mb-3">
                  {previewSubject}
                </p>
                <p className="text-sm text-slate-700 mb-4 whitespace-pre-line">
                  {previewBody}
                </p>
                <button
                  type="button"
                  className="px-4 py-2 text-white rounded-lg text-sm"
                  style={previewButtonStyle}
                >
                  {previewCta}
                </button>
                <p className="text-xs text-slate-500 mt-3 break-all">
                  {fileUrl || "https://your-resource-link-will-appear-here"}
                </p>
              </div>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
