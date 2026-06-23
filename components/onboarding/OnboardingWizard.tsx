"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StepLogo } from "./StepLogo";
import { StepColors } from "./StepColors";
import { StepMaterials } from "./StepMaterials";
import {
  ONBOARDING_EVENTS,
  trackOnboarding,
} from "@/lib/onboarding-track";
import { deriveMaterialLineName } from "@/lib/material-line-name";

type Status = "pending" | "running" | "complete" | "failed";

interface ScrapeProgress {
  stage: "scraping" | "extracting" | "classifying" | "finalizing";
  message: string;
  total?: number;
}

interface ScrapeResult {
  logoCandidates?: string[];
  imageCandidates?: string[];
  colorCandidates?: string[];
  primaryColor?: string | null;
  title?: string | null;
  candidateMaterials?: Array<{
    src_url: string;
    suggested_title: string;
    suggested_category: "Countertops" | "Backsplash" | "Flooring";
    confidence: number;
  }>;
}

export interface MaterialDraft {
  src_url: string | null;
  uploaded_path?: string;
  title: string;
  category: "Countertops" | "Backsplash" | "Flooring";
  included: boolean;
}

export type FinalizeLogo =
  | { mode: "scraped"; src_url: string }
  | { mode: "uploaded"; storage_path: string }
  | { mode: "none" };

export interface FinalizeRequestPayload {
  materialLineName: string;
  materialLineSlug: string;
  logo: FinalizeLogo;
  colors: { primary: string; accent: string; background: string };
  materials: Array<{
    src_url: string | null;
    uploaded_path?: string;
    title: string;
    category: "Countertops" | "Backsplash" | "Flooring";
  }>;
}

interface Props {
  orgId: string;
  orgSlug: string;
  orgName: string;
  scrapeId: string;
  initialStatus: Status;
  initialResult: ScrapeResult | null;
  initialError: string | null;
  initialProgress?: ScrapeProgress | null;
  scrapeCreatedAt: string;
}

const TOTAL_STEPS = 3;

export function OnboardingWizard({
  orgId,
  orgSlug,
  orgName,
  scrapeId,
  initialStatus,
  initialResult,
  initialError,
  initialProgress,
  scrapeCreatedAt,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [result, setResult] = useState<ScrapeResult | null>(initialResult);
  const [error, setError] = useState<string | null>(initialError);
  const [progress, setProgress] = useState<ScrapeProgress | null>(
    initialProgress ?? null,
  );
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  async function startOver() {
    if (
      !window.confirm(
        "Start over with a different website? Your current selections will be discarded.",
      )
    ) {
      return;
    }
    setRestarting(true);
    try {
      await fetch(`/api/onboarding/scrape/${scrapeId}`, { method: "DELETE" });
    } catch {
      // Best effort — even if the cancel call fails, navigate; the website
      // page will surface any state-machine issue on landing.
    }
    router.push(`/onboarding/${orgId}/website`);
    router.refresh();
  }

  // Selected logo (URL or uploaded storage path).
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoMode, setLogoMode] = useState<"scraped" | "uploaded" | "none">(
    "none",
  );

  // Selected colors.
  const [primary, setPrimary] = useState("#1A1A1A");
  const [accent, setAccent] = useState("#9CAF88");
  const [background, setBackground] = useState("#FFFFFF");

  // Materials drafts.
  const [materials, setMaterials] = useState<MaterialDraft[]>([]);

  // Material line name + slug — seeded from the scraped website title when
  // available (falls back to the org name), then re-seeded once the scrape
  // completes below.
  const defaultLineName = deriveMaterialLineName(
    initialResult?.title ?? null,
    orgName,
  );
  const [lineName, setLineName] = useState(defaultLineName);
  const lineSlug = useMemo(() => slugify(lineName), [lineName]);

  // Poll for scrape completion until the row reaches a terminal status. We
  // depend only on scrapeId so the polling loop runs uninterrupted across the
  // pending → running → complete transitions; the tick itself reads the latest
  // status from the response and stops the interval when terminal.
  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const tick = async () => {
      try {
        const res = await fetch(`/api/onboarding/scrape/${scrapeId}`);
        if (!res.ok) return;
        const body = (await res.json()) as {
          status: Status;
          result: ScrapeResult | null;
          error: string | null;
          progress: ScrapeProgress | null;
        };
        if (cancelled) return;
        setStatus(body.status);
        setResult(body.result);
        setError(body.error);
        setProgress(body.progress ?? null);
        if (body.status === "complete" || body.status === "failed") {
          stop();
        }
      } catch {
        // ignore transient errors
      }
    };

    if (initialStatus !== "complete" && initialStatus !== "failed") {
      interval = setInterval(tick, 2500);
      tick();
    }

    return () => {
      cancelled = true;
      stop();
    };
  }, [scrapeId, initialStatus]);

  // Once scrape completes, seed initial state from the result. Uses the
  // React-canonical "adjust state during render" pattern: we track the last
  // seeded result, so we re-seed only when result identity actually changes.
  const [seededFor, setSeededFor] = useState<ScrapeResult | null>(null);
  if (status === "complete" && result && seededFor !== result) {
    setSeededFor(result);
    if (result.logoCandidates && result.logoCandidates.length > 0) {
      setLogoUrl(result.logoCandidates[0]);
      setLogoMode("scraped");
    }
    if (result.primaryColor) setPrimary(result.primaryColor);
    if (result.title) setLineName(deriveMaterialLineName(result.title, orgName));
    setMaterials(
      (result.candidateMaterials ?? []).map((c) => ({
        src_url: c.src_url,
        title: c.suggested_title,
        category: c.suggested_category,
        included: true,
      })),
    );
  }

  if (status === "pending" || status === "running") {
    return (
      <ScrapeProgressView
        progress={progress}
        scrapeId={scrapeId}
        orgId={orgId}
        startedAt={scrapeCreatedAt}
      />
    );
  }

  if (status === "failed") {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          We couldn&apos;t scrape your site
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          {error ?? "Unknown error."} You can still set up your material line
          manually.
        </p>
        <ManualFallbackForm
          orgId={orgId}
          orgName={orgName}
          scrapeId={scrapeId}
          defaultLineName={defaultLineName}
          submitting={submitting}
          finalize={(payload) => finalize(payload)}
          finalizeError={finalizeError}
        />
      </div>
    );
  }

  async function finalize(input: FinalizeRequestPayload) {
    setSubmitting(true);
    setFinalizeError(null);
    try {
      const res = await fetch("/api/onboarding/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          scrapeId,
          ...input,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFinalizeError(body.error ?? "Failed to finalize");
        setSubmitting(false);
        return;
      }
      trackOnboarding(ONBOARDING_EVENTS.wizardFinalized, {
        organizationId: orgId,
        materialLineId: body.materialLineId,
      });
      router.push(
        `/onboarding/${orgId}/team?materialLineId=${encodeURIComponent(body.materialLineId)}`,
      );
      router.refresh();
    } catch (err) {
      console.error("finalize error", err);
      setFinalizeError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  function next() {
    if (step < TOTAL_STEPS) setStep((step + 1) as 1 | 2 | 3);
  }
  function back() {
    if (step > 1) setStep((step - 1) as 1 | 2 | 3);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Stepper current={step} />
        <button
          type="button"
          onClick={startOver}
          disabled={restarting || submitting}
          className="shrink-0 text-sm text-slate-600 hover:text-slate-900 underline disabled:opacity-50"
        >
          {restarting ? "Resetting…" : "Use a different website"}
        </button>
      </div>

      {step === 1 && (
        <StepLogo
          orgId={orgId}
          orgSlug={orgSlug}
          candidates={result?.logoCandidates ?? []}
          selectedUrl={logoUrl}
          mode={logoMode}
          onSelectScraped={(url) => {
            setLogoUrl(url);
            setLogoMode("scraped");
          }}
          onUploaded={(storagePath, publicUrl) => {
            setLogoUrl(publicUrl);
            setLogoMode("uploaded");
          }}
          onClear={() => {
            setLogoUrl(null);
            setLogoMode("none");
          }}
        />
      )}

      {step === 2 && (
        <StepColors
          dominant={
            result?.colorCandidates?.length
              ? result.colorCandidates
              : result?.primaryColor
                ? [result.primaryColor]
                : []
          }
          primary={primary}
          onChange={(next) => setPrimary(next.primary)}
        />
      )}

      {step === 3 && (
        <StepMaterials
          orgSlug={orgSlug}
          orgId={orgId}
          materials={materials}
          onChange={setMaterials}
          lineName={lineName}
          onLineNameChange={setLineName}
        />
      )}

      {finalizeError && (
        <div className="text-sm text-red-600" role="alert">
          {finalizeError}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={back}
          disabled={step === 1 || submitting}
          className="px-4 py-2 text-slate-600 hover:text-slate-900 disabled:opacity-30"
        >
          Back
        </button>
        {step < TOTAL_STEPS ? (
          <button
            type="button"
            onClick={next}
            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting || !lineName.trim()}
            onClick={() => {
              const logo: FinalizeLogo =
                logoMode === "scraped" && logoUrl
                  ? { mode: "scraped", src_url: logoUrl }
                  : logoMode === "uploaded" && logoUrl
                    ? { mode: "uploaded", storage_path: stripPublicUrl(logoUrl) }
                    : { mode: "none" };
              finalize({
                materialLineName: lineName.trim(),
                materialLineSlug: lineSlug,
                logo,
                colors: { primary, accent, background },
                materials: materials
                  .filter((m) => m.included)
                  .map((m) => ({
                    src_url: m.src_url,
                    uploaded_path: m.uploaded_path,
                    title: m.title,
                    category: m.category,
                  })),
              });
            }}
            className="px-6 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? "Setting up…" : "Finish setup"}
          </button>
        )}
      </div>
    </div>
  );
}

// Visible progress steps. The backend "extracting" stage is intentionally
// omitted — it's folded into "Scanning website" so we don't surface a
// "Reading images" step to the user.
const STAGE_ORDER: ScrapeProgress["stage"][] = [
  "scraping",
  "classifying",
  "finalizing",
];
const STAGE_LABELS: Record<ScrapeProgress["stage"], string> = {
  scraping: "Scanning website",
  extracting: "Scanning website",
  classifying: "Identifying materials",
  finalizing: "Wrapping up",
};

// Map a (possibly hidden) backend stage to its position in STAGE_ORDER so the
// right visible step stays highlighted. "extracting" maps to "scraping".
function displayedStageIndex(stage: ScrapeProgress["stage"]): number {
  const effective = stage === "extracting" ? "scraping" : stage;
  return STAGE_ORDER.indexOf(effective);
}

const STUCK_AFTER_MS = 5 * 60 * 1000;

function ScrapeProgressView({
  progress,
  scrapeId,
  orgId,
  startedAt,
}: {
  progress: ScrapeProgress | null;
  scrapeId: string;
  orgId: string;
  startedAt: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const elapsedMs = now - new Date(startedAt).getTime();
  const stuck = elapsedMs >= STUCK_AFTER_MS;

  const currentIdx = progress ? displayedStageIndex(progress.stage) : -1;
  const message =
    progress?.message ?? "Scanning your website for logo, colors, and materials…";

  async function cancelAndRetry() {
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/onboarding/scrape/${scrapeId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setCancelError(
          `Cancel failed (${res.status}): ${body.error ?? "unknown error"}`,
        );
        setCancelling(false);
        return;
      }
    } catch (err) {
      setCancelError(
        `Network error: ${err instanceof Error ? err.message : String(err)}`,
      );
      setCancelling(false);
      return;
    }
    router.push(`/onboarding/${orgId}/website`);
    router.refresh();
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
      <div className="flex items-center gap-3 text-slate-700 mb-6">
        <span className="inline-block w-5 h-5 shrink-0 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
        <span className="font-medium">{message}</span>
      </div>
      <ol className="space-y-2">
        {STAGE_ORDER.map((stage, i) => {
          const done = currentIdx > i;
          const active = currentIdx === i;
          return (
            <li key={stage} className="flex items-center gap-3 text-sm">
              <span
                className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-semibold ${
                  done
                    ? "bg-emerald-500 text-white"
                    : active
                      ? "bg-blue-600 text-white"
                      : "bg-slate-200 text-slate-500"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={
                  active
                    ? "text-slate-900 font-medium"
                    : done
                      ? "text-slate-600"
                      : "text-slate-400"
                }
              >
                {STAGE_LABELS[stage]}
                {active && progress?.total !== undefined && (
                  <span className="text-slate-500 ml-1">
                    ({progress.total})
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-6 text-xs text-slate-400">
        This usually takes 20–60 seconds.
      </p>
      {stuck && (
        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-900 font-medium">
            This is taking longer than expected.
          </p>
          <p className="text-xs text-amber-800 mt-1">
            The scrape may have stalled. You can cancel and try a different URL.
          </p>
        </div>
      )}
      <div className="mt-6">
        <button
          type="button"
          onClick={cancelAndRetry}
          disabled={cancelling}
          className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50"
        >
          {cancelling ? "Cancelling…" : "Cancel & try a different URL"}
        </button>
        {cancelError && (
          <p className="mt-3 text-sm text-red-600">{cancelError}</p>
        )}
      </div>
    </div>
  );
}

function Stepper({ current }: { current: 1 | 2 | 3 }) {
  const labels = ["Logo", "Colors", "Materials"];
  return (
    <ol className="flex items-center gap-2 sm:gap-3 text-sm">
      {labels.map((label, i) => {
        const idx = (i + 1) as 1 | 2 | 3;
        const active = idx === current;
        const done = idx < current;
        return (
          <li key={label} className="flex items-center gap-2 shrink-0">
            <span
              className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${
                active
                  ? "bg-blue-600 text-white"
                  : done
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-200 text-slate-600"
              }`}
            >
              {idx}
            </span>
            <span
              className={`${active ? "inline" : "hidden sm:inline"} ${
                active
                  ? "text-slate-900 font-medium"
                  : done
                    ? "text-slate-700"
                    : "text-slate-400"
              }`}
            >
              {label}
            </span>
            {idx < 3 && <span className="text-slate-300 shrink-0">›</span>}
          </li>
        );
      })}
    </ol>
  );
}

function ManualFallbackForm({
  orgId: _orgId,
  orgName: _orgName,
  scrapeId: _scrapeId,
  defaultLineName,
  submitting,
  finalize,
  finalizeError,
}: {
  orgId: string;
  orgName: string;
  scrapeId: string;
  defaultLineName: string;
  submitting: boolean;
  finalize: (p: FinalizeRequestPayload) => void | Promise<void>;
  finalizeError: string | null;
}) {
  // Minimal shape: name + slug + colors. Materials/logo can be added after
  // landing on the material-line dashboard.
  const [name, setName] = useState(defaultLineName);
  const slug = useMemo(() => slugify(name), [name]);
  const [primary, setPrimary] = useState("#1A1A1A");
  const [accent, setAccent] = useState("#9CAF88");
  const [background, setBackground] = useState("#FFFFFF");

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="block text-sm font-medium text-slate-700 mb-1">
          Material line name
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
        />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <ColorField label="Primary" value={primary} onChange={setPrimary} />
        <ColorField label="Accent" value={accent} onChange={setAccent} />
        <ColorField
          label="Background"
          value={background}
          onChange={setBackground}
        />
      </div>

      {finalizeError && (
        <div className="text-sm text-red-600" role="alert">
          {finalizeError}
        </div>
      )}

      <button
        type="button"
        disabled={submitting || !name.trim()}
        onClick={() =>
          finalize({
            materialLineName: name.trim(),
            materialLineSlug: slug,
            logo: { mode: "none" },
            colors: { primary, accent, background },
            materials: [],
          })
        }
        className="px-6 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50"
      >
        {submitting ? "Setting up…" : "Create material line"}
      </button>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 border border-slate-300 rounded"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
        />
      </div>
    </label>
  );
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function stripPublicUrl(url: string): string {
  // Convert a public-bucket URL back to its storage path.
  const marker = "/storage/v1/object/public/public-assets/";
  const idx = url.indexOf(marker);
  return idx >= 0 ? url.slice(idx + marker.length) : url;
}
