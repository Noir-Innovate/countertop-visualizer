"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getMaterialLineBasePath } from "@/lib/material-line-path";

interface Props {
  params: Promise<{ orgId: string }>;
}

interface PendingMaterialLineDraft {
  orgId: string;
  name: string;
  slug: string;
  lineKind: "external" | "internal";
  agreedToLeadBilling: boolean;
}

export default function NewMaterialLinePage({ params }: Props) {
  const { orgId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [lineKind, setLineKind] = useState<"external" | "internal">("external");
  const [agreedToLeadBilling, setAgreedToLeadBilling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const processedCheckoutSessionRef = useRef<string | null>(null);
  const draftStorageKey = `pending-material-line:${orgId}`;

  const generateSlug = (value: string) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    if (!slug || slug === generateSlug(name)) {
      setSlug(generateSlug(newName));
    }
  };

  const createMaterialLine = async ({
    draft,
    skipBillingOnboarding,
  }: {
    draft: PendingMaterialLineDraft;
    skipBillingOnboarding: boolean;
  }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("You must be logged in");
    }

    const [{ data: membership }, { data: profile }] = await Promise.all([
      supabase
        .from("organization_members")
        .select("role")
        .eq("profile_id", user.id)
        .eq("organization_id", orgId)
        .in("role", ["owner", "admin"])
        .single(),
      supabase
        .from("profiles")
        .select("is_super_admin")
        .eq("id", user.id)
        .single(),
    ]);

    const isSuperAdmin = Boolean(profile?.is_super_admin);
    if (!membership && !isSuperAdmin) {
      throw new Error(
        "You do not have permission to create material lines in this organization",
      );
    }

    if (!skipBillingOnboarding) {
      const onboardingResponse = await fetch(
        "/api/billing/onboarding/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId: orgId,
            lineKind: draft.lineKind,
            agreedToLeadBilling: draft.agreedToLeadBilling,
          }),
        },
      );

      const onboardingBody = await onboardingResponse.json();
      if (!onboardingResponse.ok) {
        throw new Error(
          onboardingBody.error || "Failed to initialize billing onboarding",
        );
      }

      if (onboardingBody.required && onboardingBody.url) {
        sessionStorage.setItem(draftStorageKey, JSON.stringify(draft));
        window.location.href = onboardingBody.url;
        return;
      }
    }

    const { data: org } = await supabase
      .from("organizations")
      .select("slug")
      .eq("id", orgId)
      .single();

    if (!org?.slug) {
      throw new Error(
        "Organization slug not found. Please update the organization first.",
      );
    }

    const { data: existingMaterialLine } = await supabase
      .from("material_lines")
      .select("id")
      .eq("slug", draft.slug)
      .single();

    if (existingMaterialLine) {
      throw new Error(
        "This slug is already taken. Please choose a different one.",
      );
    }

    const folderPath = `${org.slug}/${draft.slug}`;
    const { data: materialLine, error: materialLineError } = await supabase
      .from("material_lines")
      .insert({
        organization_id: orgId,
        name: draft.name,
        slug: draft.slug,
        supabase_folder: folderPath,
        line_kind: draft.lineKind,
      })
      .select()
      .single();

    if (materialLineError) {
      throw new Error(materialLineError.message);
    }

    sessionStorage.removeItem(draftStorageKey);
    router.push(
      getMaterialLineBasePath(orgId, materialLine.id, materialLine.line_kind),
    );
    router.refresh();
  };

  useEffect(() => {
    const checkoutState = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id");

    if (checkoutState === "cancel") {
      setError("Billing setup was canceled. Please try again.");
      router.replace(`/dashboard/organizations/${orgId}/material-lines/new`);
      return;
    }

    if (checkoutState !== "success" || !sessionId) {
      return;
    }

    if (processedCheckoutSessionRef.current === sessionId) {
      return;
    }
    processedCheckoutSessionRef.current = sessionId;
    router.replace(`/dashboard/organizations/${orgId}/material-lines/new`);

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const rawDraft = sessionStorage.getItem(draftStorageKey);
        if (!rawDraft) {
          throw new Error(
            "Missing pending material line draft after checkout.",
          );
        }

        const draft = JSON.parse(rawDraft) as PendingMaterialLineDraft;
        if (draft.orgId !== orgId) {
          throw new Error(
            "Billing checkout draft does not match organization.",
          );
        }

        const confirmResponse = await fetch(
          `/api/billing/onboarding/confirm?organizationId=${orgId}&sessionId=${sessionId}&lineKind=${draft.lineKind}`,
        );
        const confirmBody = await confirmResponse.json();
        if (!confirmResponse.ok) {
          throw new Error(
            confirmBody.error || "Failed to confirm billing checkout session",
          );
        }

        await createMaterialLine({ draft, skipBillingOnboarding: true });
      } catch (err) {
        processedCheckoutSessionRef.current = null;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to complete billing setup for first line",
        );
      } finally {
        setLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, orgId, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const draft: PendingMaterialLineDraft = {
      orgId,
      name: name.trim(),
      slug: slug.trim(),
      lineKind,
      agreedToLeadBilling,
    };

    try {
      await createMaterialLine({ draft, skipBillingOnboarding: false });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
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
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Material Line Type
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLineKind("external")}
                className={`text-left p-4 rounded-lg border transition-colors ${
                  lineKind === "external"
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-300 hover:border-slate-400"
                }`}
              >
                <p className="font-medium text-slate-900">Lead Line</p>
                <p className="text-sm text-slate-600 mt-1">
                  Designed to generate leads for your business. $50/lead.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setLineKind("internal")}
                className={`text-left p-4 rounded-lg border transition-colors ${
                  lineKind === "internal"
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-300 hover:border-slate-400"
                }`}
              >
                <p className="font-medium text-slate-900">Internal Line</p>
                <p className="text-sm text-slate-600 mt-1">
                  Designed to increase average sale amount for visits. $250/mo.
                </p>
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Line type can only be changed by a super user.
            </p>
          </div>

          {lineKind === "external" && (
            <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-lg">
              <input
                type="checkbox"
                checked={agreedToLeadBilling}
                onChange={(e) => setAgreedToLeadBilling(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span className="text-sm text-slate-700">
                I agree to lead billing at $50 per generated lead and understand
                billing info is required for the first lead line.
              </span>
            </label>
          )}

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
              {loading ? "Processing..." : "Create Material Line"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
