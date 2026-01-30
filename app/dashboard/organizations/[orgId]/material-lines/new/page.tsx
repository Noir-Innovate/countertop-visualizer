"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Props {
  params: Promise<{ orgId: string }>;
}

export default function NewMaterialLinePage({ params }: Props) {
  const { orgId } = use(params);
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    // Auto-generate slug from name if slug hasn't been manually edited
    if (!slug || slug === generateSlug(name)) {
      setSlug(generateSlug(newName));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("You must be logged in");
        return;
      }

      // Verify user has access to create material lines in this org
      const { data: membership } = await supabase
        .from("organization_members")
        .select("role")
        .eq("profile_id", user.id)
        .eq("organization_id", orgId)
        .in("role", ["owner", "admin"])
        .single();

      if (!membership) {
        setError(
          "You do not have permission to create material lines in this organization",
        );
        return;
      }

      // Get organization slug
      const { data: org } = await supabase
        .from("organizations")
        .select("slug")
        .eq("id", orgId)
        .single();

      if (!org || !org.slug) {
        setError(
          "Organization slug not found. Please update the organization first.",
        );
        setLoading(false);
        return;
      }

      // Check if slug is available
      const { data: existingMaterialLine } = await supabase
        .from("material_lines")
        .select("id")
        .eq("slug", slug)
        .single();

      if (existingMaterialLine) {
        setError("This slug is already taken. Please choose a different one.");
        return;
      }

      // Create folder path: {org-slug}/{material-line-slug}/
      const folderPath = `${org.slug}/${slug}`;

      // Create the material line
      const { data: materialLine, error: materialLineError } = await supabase
        .from("material_lines")
        .insert({
          organization_id: orgId,
          name,
          slug,
          supabase_folder: folderPath,
        })
        .select()
        .single();

      if (materialLineError) {
        setError(materialLineError.message);
        return;
      }

      router.push(
        `/dashboard/organizations/${orgId}/material-lines/${materialLine.id}`,
      );
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const appDomain =
    process.env.NEXT_PUBLIC_APP_DOMAIN || "countertopvisualizer.com";

  return (
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
          <span>New Material Line</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900">
          Create Material Line
        </h1>
        <p className="text-slate-600 mt-1">
          Set up a new material line for your countertop visualizer
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
              Material Line Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={handleNameChange}
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              placeholder="Accent Countertops"
              required
            />
            <p className="mt-1 text-sm text-slate-500">
              The name of your material line or brand
            </p>
          </div>

          <div>
            <label
              htmlFor="slug"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              URL Slug
            </label>
            <div className="flex items-center">
              <input
                id="slug"
                type="text"
                value={slug}
                onChange={(e) =>
                  setSlug(
                    e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                  )
                }
                className="w-full px-4 py-3 rounded-l-lg border border-r-0 border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="accent-countertops"
                required
              />
              <span className="px-4 py-3 bg-slate-100 border border-slate-300 rounded-r-lg text-slate-500 text-sm whitespace-nowrap">
                .{appDomain}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Your visualizer will be available at {slug || "your-slug"}.
              {appDomain}
            </p>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-3 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim() || !slug.trim()}
              className="flex-1 py-3 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "Creating..." : "Create Material Line"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
